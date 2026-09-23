const { createClient } = require('redis');

async function connectRedis(url, logger = console) {
  if (!url) return null;
  const client = createClient({ url });
  client.on('error', (error) => logger.error(`[redis] ${error.message}`));
  await client.connect();
  return client;
}

module.exports = { connectRedis };
