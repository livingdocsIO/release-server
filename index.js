const _ = require('lodash')
const log = require('pino')({level: 'info', base: null})
const fastify = require('fastify')({logger: log, level: 'error'})
const config = require('rc')('ld')
const assert = require('assert')
const nanoid = require('nanoid')

const services = _.reduce(config.mapping, function (services, service, handle) {
  assert(handle, 'Service handle is required')

  const rancherServiceId = service.rancher_service_id
  assert(rancherServiceId, 'service.rancher_service_id is required')

  const dockerImage = service.docker_image
  assert(dockerImage, 'service.docker_image is required')

  service = {handle, dockerImage, rancherServiceId}
  log.info(`Registered service: ${JSON.stringify(service)}`)
  service.trigger = createTrigger(service)
  services[handle] = service
  return services
}, {})

const flumelog = require('flumelog-aligned-offset')('./data', {block: 64*1024, codec: require('flumecodec').json})
const ifErr = function (err) { err && log.error(err) }

flumelog.onReady((err) => {
  if (err) throw err
  log.info({filename: flumelog.filename, bytes: flumelog.length}, 'Flumelog opened')
})

const notify = {
  DeploymentTriggered: function (id, {service, image, tag}) {
    const payload = {id: id, time: Date.now(), name: 'DeploymentTriggered', data: {service, image, tag}}
    flumelog.append(payload, ifErr)
  },
  DeploymentSucceeded: function (id, res) {
    const payload = {id: id, time: Date.now(), name: 'DeploymentSucceeded'}
    flumelog.append(payload, ifErr)
  },
  DeploymentErrored: function (id, err) {
    const payload = {id: id, time: Date.now(), name: 'DeploymentErrored', data: {message: err.message, stack: err.stack}}
    flumelog.append(payload, ifErr)
  }
}

function createTrigger (service) {
  const execa = require('execa')
  const lastOne = require('last-one-wins')

  return lastOne(function trigger (tag, cb) {
    const id = nanoid(16)
    cb(null, {id})

    notify.DeploymentTriggered(id, {
      service: service.handle,
      image: service.dockerImage,
      tag: tag
    })

    execa(require.resolve('.bin/li-release'), ['upgrade-rancher-container'], {
      env: Object.assign({}, process.env, {
        RANCHER_URL: process.env.RANCHER_URL || process.env.CATTLE_URL,
        CATTLE_ACCESS_KEY: process.env.CATTLE_ACCESS_KEY,
        CATTLE_SECRET_KEY: process.env.CATTLE_SECRET_KEY,
        RANCHER_SERVICE_ID: service.rancherServiceId || '',
        DOCKER_IMAGE_TAG: `${service.dockerImage}:${tag}`
      })
    })
    .then(notify.DeploymentSucceeded.bind(null, id))
    .catch(notify.DeploymentErrored.bind(null, id))
  })
}

const flumelogOptionsParser = require('./flumelog-options')
fastify.route({
  method: 'GET',
  url: '/events',
  handler: function (req, reply) {
    const options = flumelogOptionsParser(req.query)

    flumelog.stream(options)
      .pipe(drainStream(function replyWithEvents (err, events) {
        if (err) return reply.code(500).send(err)

        reply
          .code(200)
          .header('Content-Type', 'application/json')
          .serializer(serializeEvents)
          .send(events)
      }))
  }
})

function drainStream (cb) {
  const items = []
  return {
    paused: false,
    write (data) {
      items.push(data)
    },
    end (err) {
      cb(err, items)
    }
  }
}

function serializeEvents (events) {
  let str = ''
  for (const event of events) str = `${str},${serializeEvent(event)}`
  return `[${str.substring(1)}]`
}

function serializeEvent (event) {
  const {id, time, name, data} = event.value
  const dataStr = typeof data === 'object' ? `,"data":${JSON.stringify(data)}` : ''
  return `{"_seq":${event.seq},"id":"${id}","time":"${new Date(time).toISOString()}","name":"${name}"${dataStr}}`
}

fastify.route({
  method: 'POST',
  url: '/deploy',
  schema: {
    required: ['serviceHandle', 'dockerImageTag'],
    properties: {
      serviceHandle: {type: 'string'},
      dockerImageTag: {type: 'string', minLength: 20}
    }
  },
  handler: function (req, reply) {
    const serviceHandle = req.body.serviceHandle
    const service = services[serviceHandle]
    if (!service) return reply.code(404).send()

    service.trigger(req.body.dockerImageTag, function (err) {
      if (err) reply.code(500).send({message: err.message, stack: err.stack})
      else reply.code(202).send()
    })
  }
})

const port = process.env.PORT || 8080
fastify.listen(port, '0.0.0.0', function (err) {
  if (err) throw err
  flumelog.append({id: nanoid(16), time: Date.now(), name: 'Booted'}, ifErr)
})

process.on('SIGINT', () => {
  flumelog.append({id: nanoid(16), time: Date.now(), name: 'Stopped'}, (err) => {
    if (err) log.error(err)
    flumelog.close(() => {
      process.exit(0)
    })
  })
})

process.on('uncaughtException', (err) => {
  log.error(err)
  flumelog.append({id: nanoid(16), time: Date.now(), name: 'Crashed', data: {
    message: err.message,
    stack: err.stack,
    code: err.code
  }}, (err) => {
    if (err) log.error(err)
    flumelog.close(() => {
      process.exit(1)
    })
  })
})
