const assert = require('node:assert/strict');
const { test } = require('node:test');
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const { postgresConfigured } = require('../storage/database-config');

const enabled = postgresConfigured();

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForHealth(url) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${url}/api/health`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('PostgreSQL backend did not start');
}

async function request(url, pathname, options = {}) {
  const response = await fetch(`${url}${pathname}`, options);
  return { response, payload: await response.json() };
}

test('PostgreSQL provider persists a post, thread, reservation and outbox event', { skip: !enabled }, async () => {
  const port = await availablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['backend.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(port), DATABASE_PROVIDER: 'postgres', JWT_SECRET: 'postgres-integration-test-secret' },
    stdio: 'ignore'
  });
  try {
    await waitForHealth(baseUrl);
    const suffix = Date.now();
    const headers = { 'Content-Type': 'application/json' };
    const owner = await request(baseUrl, '/api/auth/register', { method: 'POST', headers, body: JSON.stringify({ name: 'Owner PostgreSQL', email: `owner-${suffix}@example.test`, password: 'senha-segura-123', city: 'Sao Paulo, SP' }) });
    const interested = await request(baseUrl, '/api/auth/register', { method: 'POST', headers, body: JSON.stringify({ name: 'Interested PostgreSQL', email: `interested-${suffix}@example.test`, password: 'senha-segura-123', city: 'Sao Paulo, SP' }) });
    assert.equal(owner.response.status, 201);
    assert.equal(interested.response.status, 201);
    const auth = (token) => ({ ...headers, Authorization: `Bearer ${token}` });
    const created = await request(baseUrl, '/api/posts', { method: 'POST', headers: auth(owner.payload.token), body: JSON.stringify({ title: 'Post PostgreSQL', description: 'Item de integração.', category: 'Móveis', goal: 'Venda', location: 'Belem, PA', imageUrl: 'https://example.test/item.jpg' }) });
    assert.equal(created.response.status, 201);
    const postId = created.payload.post.id;
    assert.equal(created.payload.post.goal, 'Venda');
    assert.equal(created.payload.post.chipIcon, 'sell');
    assert.equal(created.payload.post.location, 'Belem, PA');
    assert.equal(created.payload.post.author.city, 'Sao Paulo, SP');
    const feed = await request(baseUrl, '/api/feed');
    const feedPost = feed.payload.posts.find((post) => post.id === postId);
    assert.equal(feedPost.location, 'Belem, PA');
    assert.equal(feedPost.author.city, 'Sao Paulo, SP');
    const thread = await request(baseUrl, '/api/messages/threads', { method: 'POST', headers: auth(interested.payload.token), body: JSON.stringify({ postId }) });
    assert.equal(thread.response.status, 201);
    const threadId = thread.payload.thread.id;
    const negotiation = await request(baseUrl, `/api/posts/${postId}/negotiation`, { headers: auth(interested.payload.token) });
    assert.equal(negotiation.response.status, 200);
    const proposal = await request(baseUrl, `/api/negotiations/${negotiation.payload.negotiation.id}/proposal`, {
      method: 'POST', headers: auth(interested.payload.token), body: JSON.stringify({ amountCents: 2500, method: 'pix' })
    });
    assert.equal(proposal.response.status, 201);
    const firstMessage = await request(baseUrl, `/api/messages/threads/${threadId}/messages`, { method: 'POST', headers: auth(owner.payload.token), body: JSON.stringify({ text: 'Mensagem antes da limpeza.' }) });
    assert.equal(firstMessage.response.status, 201);

    const clear = await request(baseUrl, '/api/messages/threads', { method: 'DELETE', headers: auth(interested.payload.token) });
    assert.equal(clear.response.status, 200);
    assert.equal(clear.payload.ok, true);
    const clearedInbox = await request(baseUrl, '/api/messages/threads', { headers: auth(interested.payload.token) });
    assert.deepEqual(clearedInbox.payload.threads, []);
    const clearedThread = await request(baseUrl, `/api/messages/threads/${threadId}`, { headers: auth(interested.payload.token) });
    assert.deepEqual(clearedThread.payload.messages, []);
    const ownerThread = await request(baseUrl, `/api/messages/threads/${threadId}`, { headers: auth(owner.payload.token) });
    assert.equal(ownerThread.payload.messages.length, 1);

    await new Promise((resolve) => setTimeout(resolve, 5));
    const nextMessage = await request(baseUrl, `/api/messages/threads/${threadId}/messages`, { method: 'POST', headers: auth(owner.payload.token), body: JSON.stringify({ text: 'Mensagem após a limpeza.' }) });
    assert.equal(nextMessage.response.status, 201);
    const restoredInbox = await request(baseUrl, '/api/messages/threads', { headers: auth(interested.payload.token) });
    assert.equal(restoredInbox.payload.threads.length, 1);
    assert.equal(restoredInbox.payload.threads[0].id, threadId);
    const reserved = await request(baseUrl, `/api/posts/${postId}/reserve`, { method: 'POST', headers: auth(owner.payload.token), body: JSON.stringify({ interestedId: interested.payload.user.id }) });
    assert.equal(reserved.response.status, 200);
    assert.equal(reserved.payload.post.status, 'Reservado');
    const payment = await request(baseUrl, `/api/negotiations/${negotiation.payload.negotiation.id}/payment`, {
      method: 'POST', headers: auth(interested.payload.token), body: JSON.stringify({ amountCents: 2500, currency: 'BRL', method: 'pix', idempotencyKey: `postgres-${suffix}-payment` })
    });
    assert.equal(payment.response.status, 201);
    const completed = await request(baseUrl, `/api/posts/${postId}/complete`, { method: 'POST', headers: auth(owner.payload.token), body: JSON.stringify({ outcome: 'Vendido' }) });
    assert.equal(completed.response.status, 200);
    assert.equal(completed.payload.post.status, 'Vendido');
    const outbox = await request(baseUrl, '/api/distributed/status');
    assert.equal(outbox.response.status, 200);
    assert.ok(outbox.payload.pendingEvents >= 2);
  } finally {
    server.kill();
  }
});
