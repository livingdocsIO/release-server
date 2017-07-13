# Purpose of this repository

With the release-server you are able to apply a deployment on rancher with a simple HTTP request.


# How to use the release-server

#### start the release-server locally

In this example we configure two services which can be deployed over the release-server and start a release-server locally
```
docker run \
-e RANCHER_URL=https://hosted.livingdocs.io \
-e CATTLE_ACCESS_KEY=<access-key> \
-e CATTLE_SECRET_KEY=<secret-key> \
-e ld_mapping__<service1>__rancher_service_id=<service-id> \
-e ld_mapping__<service1>__docker_image=<docker-image-name> \
-e ld_mapping__<service2>__rancher_service_id=<service-id> \
-e ld_mapping__<service2>__docker_image=<docker-image-name> \
-v /var/run/docker.sock:/var/run/docker.sock \
-it -p 8080:8080 livingdocs/release-server:latest
```

`RANCHER_URL` / `CATTLE_ACCESS_KEY` / `CATTLE_SECRET_KEY` are rancher specific variables to have access to your rancher via the rancher API.
To configure a deployment you always have to pass 2 environment variables during startup.

* `ld_mapping__<service1>__rancher_service_id=<service-id>`
* `ld_mapping__<service1>__docker_image=<docker-image-name>`

`<service1>` is a serviceHandle and is later used as an identifier to make deployment. Every rancher stack has stacks and every stack has services. If you click on a stack in the rancher gui, you will see the `service-id` of a service in the url. `docker-image-name` is the tag of a docker image pushed to dockerhub.


#### apply a deployment
```bash
curl -XPOST -H 'Content-Type: application/json' \
  -d '{"serviceHandle": "service1", "dockerImageTag": "v1.2.2"}' http://localhost:8080/deploy
```

As mentioned before the `serviceHandle` identifies which rancher service and which docker image should be deployed.


#### check the deployment events
`http://localhost:8080/events`
