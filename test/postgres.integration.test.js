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
    const created = await request(baseUrl, '/api/posts', { method: 'POST', headers: auth(owner.payload.token), body: JSON.stringify({ title: 'Post PostgreSQL', description: 'Item de integração.', category: 'Móveis', imageUrl: 'https://example.test/item.jpg' }) });
    assert.equal(created.response.status, 201);
    const postId = created.payload.post.id;
    const thread = await request(baseUrl, '/api/messages/threads', { method: 'POST', headers: auth(interested.payload.token), body: JSON.stringify({ postId }) });
    assert.equal(thread.response.status, 201);
    const reserved = await request(baseUrl, `/api/posts/${postId}/reserve`, { method: 'POST', headers: auth(owner.payload.token), body: JSON.stringify({ interestedId: interested.payload.user.id }) });
    assert.equal(reserved.response.status, 200);
    assert.equal(reserved.payload.post.status, 'Reservado');
    const outbox = await request(baseUrl, '/api/distributed/status');
    assert.equal(outbox.response.status, 200);
    assert.ok(outbox.payload.pendingEvents >= 2);
  } finally {
    server.kill();
  }
});
