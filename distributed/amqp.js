const amqp = require('amqplib');

const AMQP_FRAME_MAX = 131072;

function connectAmqp(url) {
  const separator = String(url).includes('?') ? '&' : '?';
  const connectionUrl = String(url).includes('frameMax=')
    ? String(url)
    : `${url}${separator}frameMax=${AMQP_FRAME_MAX}`;
  return amqp.connect(connectionUrl);
}

module.exports = { connectAmqp };
