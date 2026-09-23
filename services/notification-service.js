const path = require('path');
const express = require('express');
const { connectAmqp } = require('../distributed/amqp');
const { NotificationStore, usePostgres } = require('./persistence');

const PORT = +process.env.PORT || 3001;
const URL = process.env.AMQP_URL || 'amqp://rabbitmq:5672';
const EX = process.env.EVENT_EXCHANGE || 'reusa.events';
const QUEUE = 'reusa.notifications.v2';
const SERVICE_AUTH_TOKEN = String(process.env.SERVICE_AUTH_TOKEN || '').trim();
const store = new NotificationStore({
  file: path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data', 'notifications'), 'notifications.sqlite'),
  locateFile: (file) => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file)
});
let connected = false;
let connecting = false;
let timer;

function notice(event) {
  const data = event.data;
  const mapping = {
    'negotiation.reserved': [data.interestedId, 'negotiation', 'Item reservado para você', `Você foi selecionado para ${data.postTitle}.`],
    'negotiation.completed': [data.interestedId, 'negotiation', 'Negociação concluída', `A negociação de ${data.postTitle} foi concluída.`],
    'negotiation.interested': [data.ownerId, 'interest', 'Novo interessado', `${data.interestedName || 'Uma pessoa'} demonstrou interesse em ${data.postTitle}.`],
    'message.sent': [data.recipientId, 'message', 'Nova mensagem', `${data.senderName || 'Uma pessoa'} enviou uma mensagem.`],
    'review.created': [data.revieweeId, 'review', 'Você recebeu uma avaliação', `${data.reviewerName || 'Uma pessoa'} avaliou uma negociação com você.`]
  };
  const value = mapping[event.type];
  return value && { userId: value[0], type: value[1], title: value[2], text: value[3], link: data.link || `/anuncios/${data.postId || ''}` };
}

function retry() {
  if (connected || connecting || timer) return;
  timer = setTimeout(async () => {
    timer = null;
    connecting = true;
    try {
      await consume();
      connected = true;
    } catch (error) {
      console.error('[notifications] broker unavailable; retrying:', error.message);
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
  for (const key of ['negotiation.*', 'message.sent', 'review.created']) await channel.bindQueue(QUEUE, EX, key);
  await channel.consume(QUEUE, (message) => {
    if (!message) return;
    Promise.resolve().then(() => {
      const event = JSON.parse(message.content);
      return store.process(event, notice(event));
    })
      .then(() => channel.ack(message))
      .catch((error) => {
        console.error('[notifications] event processing failed:', error);
        channel.nack(message, false, false);
      });
  });
  console.log(`[notifications] consuming ${QUEUE} (${usePostgres ? 'postgres' : 'sqlite'})`);
}

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  if (!SERVICE_AUTH_TOKEN || req.path === '/health') return next();
  if (req.get('authorization') !== `Bearer ${SERVICE_AUTH_TOKEN}`) return res.status(401).json({ error: 'Unauthorized service request' });
  return next();
});
app.get('/health', async (_, res) => res.json({ ok: true, service: 'notifications', processedEvents: await store.processedCount() }));
app.get('/notifications/:id', async (req, res) => res.json({ notifications: await store.notificationsFor(req.params.id) }));
app.post('/notifications/:user/:id/read', async (req, res) => {
  await store.markRead(req.params.user, req.params.id);
  res.json({ ok: true });
});

store.open().then(() => {
  app.listen(PORT, () => console.log('[notifications] listening'));
  retry();
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
