const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

let server;
let baseUrl;
let dataDir;

function availablePort() {
  return new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Backend did not start within 10 seconds');
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const payload = await response.json();
  return { response, payload };
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reusa-test-'));
  const port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['backend.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, JWT_SECRET: 'test-secret-not-for-production' },
    stdio: 'ignore'
  });
  await waitForServer();
});

after(() => {
  if (server && !server.killed) server.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('healthcheck is available', async () => {
  const { response, payload } = await request('/api/health');
  assert.equal(response.status, 200);
  assert.deepEqual(payload, { ok: true });
});

test('seeded user can authenticate and access protected data', async () => {
  const login = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'mariana@reusa.com', password: '12345678' })
  });

  assert.equal(login.response.status, 200);
  assert.ok(login.payload.token);

  const profile = await request('/api/profile', { headers: { Authorization: `Bearer ${login.payload.token}` } });
  assert.equal(profile.response.status, 200);
  assert.equal(profile.payload.user.id, 'user-mariana');
});

test('registration validates data and persists a new account', async () => {
  const invalid = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'A', email: 'invalid', password: 'short', city: 'SP' })
  });
  assert.equal(invalid.response.status, 400);

  const email = `test-${Date.now()}@example.test`;
  const registration = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Teste Automatizado', email, password: 'senha-segura-123', city: 'Sao Paulo, SP' })
  });
  assert.equal(registration.response.status, 201);

  const login = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'senha-segura-123' })
  });
  assert.equal(login.response.status, 200);
});

test('favorites, negotiation status and reviews persist with permission checks', async () => {
  const suffix = Date.now();
  const ownerEmail = `owner-${suffix}@example.test`;
  const interestedEmail = `interested-${suffix}@example.test`;

  const ownerRegistration = await request('/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Dono do item', email: ownerEmail, password: 'senha-segura-123', city: 'Sao Paulo, SP' })
  });
  assert.equal(ownerRegistration.response.status, 201);
  const ownerToken = ownerRegistration.payload.token;

  const created = await request('/api/posts', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ title: 'Mesa circular', description: 'Mesa em bom estado para doação.', category: 'Móveis', condition: 'Bom estado', goal: 'Doação', location: 'Centro, Sao Paulo, SP' })
  });
  assert.equal(created.response.status, 201);
  const postId = created.payload.post.id;
  assert.equal(created.payload.post.status, 'Disponível');

  const interestedRegistration = await request('/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Pessoa interessada', email: interestedEmail, password: 'senha-segura-123', city: 'Sao Paulo, SP' })
  });
  assert.equal(interestedRegistration.response.status, 201);
  const interestedToken = interestedRegistration.payload.token;
  const interestedId = interestedRegistration.payload.user.id;

  const favorite = await request(`/api/posts/${postId}/favorite`, { method: 'POST', headers: { Authorization: `Bearer ${interestedToken}` } });
  assert.equal(favorite.response.status, 200);
  assert.equal(favorite.payload.saved, true);
  const saved = await request('/api/favorites', { headers: { Authorization: `Bearer ${interestedToken}` } });
  assert.equal(saved.payload.posts[0].id, postId);

  const thread = await request('/api/messages/threads', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${interestedToken}` }, body: JSON.stringify({ postId }) });
  assert.equal(thread.response.status, 201);

  const reserve = await request(`/api/posts/${postId}/reserve`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` }, body: JSON.stringify({ interestedId }) });
  assert.equal(reserve.response.status, 200);
  assert.equal(reserve.payload.post.status, 'Reservado');

  const completed = await request(`/api/posts/${postId}/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` }, body: JSON.stringify({ outcome: 'Doado' }) });
  assert.equal(completed.response.status, 200);
  assert.equal(completed.payload.post.status, 'Doado');

  const negotiation = await request(`/api/posts/${postId}/negotiation`, { headers: { Authorization: `Bearer ${interestedToken}` } });
  assert.equal(negotiation.response.status, 200);
  assert.equal(negotiation.payload.negotiation.status, 'completed');

  const review = await request(`/api/negotiations/${negotiation.payload.negotiation.id}/reviews`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${interestedToken}` }, body: JSON.stringify({ rating: 5, comment: 'Tudo certo na entrega.' }) });
  assert.equal(review.response.status, 201);
  const reviews = await request(`/api/users/${ownerRegistration.payload.user.id}/reviews`);
  assert.equal(reviews.payload.reputation.count, 1);
  assert.equal(reviews.payload.reputation.rating, 5);
});
