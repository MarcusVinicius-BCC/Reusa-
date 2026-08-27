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
