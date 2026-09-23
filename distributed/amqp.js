const amqp = require('amqplib');

const AMQP_CONNECTION_OPTIONS = {
  frameMax: 131072
};

function connectAmqp(url) {
  return amqp.connect(url, AMQP_CONNECTION_OPTIONS);
}

module.exports = { connectAmqp };
