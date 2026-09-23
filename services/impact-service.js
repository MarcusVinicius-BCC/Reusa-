const path = require('path');
const express = require('express');
const { connectAmqp } = require('../distributed/amqp');
const { ImpactStore, usePostgres } = require('./persistence');

const PORT = +process.env.PORT || 3002;
const URL = process.env.AMQP_URL || 'amqp://rabbitmq:5672';
const EX = process.env.EVENT_EXCHANGE || 'reusa.events';
const QUEUE = 'reusa.impact.v2';
const SERVICE_AUTH_TOKEN = String(process.env.SERVICE_AUTH_TOKEN || '').trim();
const store = new ImpactStore({
  file: path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data', 'impact'), 'impact.sqlite'),
  locateFile: (file) => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file)
});
let connected = false;
let connecting = false;
let timer;

function retry() {
  if (connected || connecting || timer) return;
  timer = setTimeout(async () => {
    timer = null;
    connecting = true;
    try {
      await consume();
      connected = true;
    } catch (error) {
      console.error('[impact] broker unavailable; retrying:', error.message);
    } finally {
      connecting = false;
      if (!connected) retry();
    }
  }, 3000);
}

async function consume() {
  const connection = await connectAmqp(URL);
  connection.on('error', () => {});
  connection.on('close', () => { connected = false; setTimeout(retry, 0); });
  const channel = await connection.createChannel();
  await channel.assertExchange(EX, 'topic', { durable: true });
  await channel.assertExchange(`${EX}.dlx`, 'topic', { durable: true });
  await channel.assertQueue(`${QUEUE}.dead`, { durable: true });
  await channel.bindQueue(`${QUEUE}.dead`, `${EX}.dlx`, '#');
  await channel.assertQueue(QUEUE, { durable: true, arguments: { 'x-dead-letter-exchange': `${EX}.dlx` } });
  await channel.bindQueue(QUEUE, EX, 'negotiation.completed');
  await channel.consume(QUEUE, (message) => {
    if (!message) return;
    Promise.resolve().then(() => {
      const event = JSON.parse(message.content);
      return store.process(event);
    })
      .then(() => channel.ack(message))
      .catch((error) => {
        console.error('[impact] event processing failed:', error);
        channel.nack(message, false, false);
      });
  });
  console.log(`[impact] consuming ${QUEUE} (${usePostgres ? 'postgres' : 'sqlite'})`);
}

const app = express();
app.use((req, res, next) => {
  if (!SERVICE_AUTH_TOKEN || req.path === '/health') return next();
  if (req.get('authorization') !== `Bearer ${SERVICE_AUTH_TOKEN}`) return res.status(401).json({ error: 'Unauthorized service request' });
  return next();
});
app.get('/health', async (_, res) => res.json({ ok: true, service: 'impact', processedEvents: await store.processedCount() }));
app.get('/impact', async (_, res) => res.json(await store.summary()));

store.open().then(() => {
  app.listen(PORT, () => console.log('[impact] listening'));
  retry();
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
