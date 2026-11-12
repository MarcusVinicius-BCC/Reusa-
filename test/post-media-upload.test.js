const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createPostUpload } = require('../storage/post-media-upload');

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

test('media cleanup preserves committed files and files still being saved', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reusa-media-cleanup-'));
  const objects = new Map();
  let latestKey;
  const objectStorage = {
    async put({ key, body }) {
      const chunks = [];
      for await (const chunk of body) chunks.push(chunk);
      objects.set(key, Buffer.concat(chunks));
      latestKey = key;
      return `https://media.example.test/${key}`;
    },
    async remove({ key }) { objects.delete(key); }
  };
  const started = deferred(), closed = deferred(), commit = deferred(), saved = deferred();
  const app = express();
  app.post('/:outcome', createPostUpload({ uploadDir: directory, objectStorage }), async (req, res) => {
    if (req.params.outcome === 'rejected') return res.status(400).json({ error: 'Invalid publication' });
    if (req.params.outcome === 'committed-error') {
      req.postMediaCommitted = true;
      return res.status(500).json({ error: 'Response failed after saving' });
    }
    res.once('close', () => closed.resolve());
    started.resolve();
    await commit.promise;
    req.postMediaCommitted = true;
    saved.resolve();
    if (!res.destroyed) res.json({ ok: true });
  });
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const video = fs.readFileSync(path.join(__dirname, 'fixtures/post-video.webm'));
  const form = () => {
    const body = new FormData();
    body.append('videos', new Blob([video], { type: 'video/webm' }), 'item.webm');
    return body;
  };
  t.after(async () => {
    commit.resolve();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  });

  await t.test('a rejected publication discards its uploaded objects', async () => {
    const response = await fetch(`${base}/rejected`, { method: 'POST', body: form() });
    assert.equal(response.status, 400);
    await response.json();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(objects.has(latestKey), false);
  });

  await t.test('a response error after commit keeps the publication media', async () => {
    const response = await fetch(`${base}/committed-error`, { method: 'POST', body: form() });
    assert.equal(response.status, 500);
    await response.json();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(objects.get(latestKey), video);
  });

  await t.test('disconnecting during the transaction does not delete media being saved', async () => {
    const controller = new AbortController();
    const request = fetch(`${base}/pending`, { method: 'POST', body: form(), signal: controller.signal }).catch(error => error);
    await started.promise;
    const key = latestKey;
    controller.abort();
    await request;
    await closed.promise;
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(objects.get(key), video);
    commit.resolve();
    await saved.promise;
    assert.deepEqual(objects.get(key), video);
  });
});
