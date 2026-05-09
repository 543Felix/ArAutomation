const crypto = require('crypto');

function requestIdMiddleware(req, res, next) {
  const headerName = process.env.REQUEST_ID_HEADER || 'x-request-id';
  const incoming = req.get(headerName);
  const id = incoming && String(incoming).trim() ? String(incoming).trim() : crypto.randomUUID();

  req.id = id;
  res.setHeader(headerName, id);
  next();
}

module.exports = requestIdMiddleware;
