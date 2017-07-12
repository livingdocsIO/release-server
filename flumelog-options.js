module.exports = parseFlumelogOptions

function parseFlumelogOptions (query) {
  const opts = {limit: 10, reverse: false, seqs: true}
  if (!query) return opts

  if (query.limit) opts.limit = Math.min(query.limit || 10, 1000)
  if (query.reverse === 'true') opts.reverse = true

  const gt = query.gt && Math.floor(query.gt)
  const lt = query.lt && Math.floor(query.lt)
  const gte = query.gte && Math.floor(query.gte)
  const lte = query.lte && Math.floor(query.lte)

  if (gt) opts.gt = gt
  if (lt) opts.lt = lt
  if (gte) opts.gte = gte
  if (lte) opts.lte = lte

  return opts
}
