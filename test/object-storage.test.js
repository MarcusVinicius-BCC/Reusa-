const assert = require('node:assert/strict');
const { test } = require('node:test');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { S3Client } = require('@aws-sdk/client-s3');
const { createObjectStorage } = require('../distributed/object-storage');

const config = { bucket: 'test-images', endpoint: 'https://test-account.r2.cloudflarestorage.com', publicBaseUrl: 'https://pub-test.r2.dev', accessKeyId: 'test-key', secretAccessKey: 'test-secret' };

test('R2 verifies access and uploads without requesting unsupported bucket policies', async t => {
  const sent = [];
  const regions = [];
  t.mock.method(console, 'info', () => {});
  t.mock.method(S3Client.prototype, 'send', async function (command) { sent.push(command); regions.push(await this.config.region()); return {}; });
  const storage = createObjectStorage(config);
  await storage.ensureBucket();
  const image = Buffer.from('test image');
  const url = await storage.put({ key: 'uploads/foto escola.png', body: image, contentType: 'image/png' });
  assert.deepEqual(sent.map(command => command.constructor.name), ['HeadBucketCommand', 'PutObjectCommand']);
  assert.deepEqual(regions, ['auto', 'auto']);
  assert.equal(sent[1].input.Body, image);
  assert.equal(sent[1].input.ContentType, 'image/png');
  assert.equal(url, 'https://pub-test.r2.dev/uploads/foto%20escola.png');
});

test('R2 requires a public image domain and rejects the authenticated S3 endpoint as a public URL', () => {
  assert.throws(() => createObjectStorage({ ...config, publicBaseUrl: undefined }), /S3_PUBLIC_BASE_URL/);
  assert.throws(() => createObjectStorage({ ...config, publicBaseUrl: config.endpoint }), /public image domain/);
  assert.throws(() => createObjectStorage({ ...config, publicBaseUrl: 'ftp://images.example.test' }), /public image domain/);
  assert.equal(createObjectStorage({}), null);
});

test('stored objects can be removed and deletion failures remain visible to the caller', async t => {
  const sent = [];
  const send = t.mock.method(S3Client.prototype, 'send', async command => { sent.push(command); return {}; });
  const storage = createObjectStorage(config);
  await storage.remove({ key: 'uploads/video.webm' });
  assert.equal(sent[0].constructor.name, 'DeleteObjectCommand');
  assert.deepEqual(sent[0].input, { Bucket: config.bucket, Key: 'uploads/video.webm' });
  send.mock.mockImplementation(async () => { throw Object.assign(new Error('deletion denied'), { $metadata: { httpStatusCode: 403 } }); });
  await assert.rejects(storage.remove({ key: 'uploads/video.webm' }), /deletion denied/);
});

test('a missing bucket is created, while permission and service errors are preserved', async t => {
  const sent = [];
  t.mock.method(console, 'info', () => {});
  const send = t.mock.method(S3Client.prototype, 'send', async command => {
    sent.push(command.constructor.name);
    if (command.constructor.name === 'HeadBucketCommand') throw Object.assign(new Error('missing'), { $metadata: { httpStatusCode: 404 } });
    return {};
  });
  await createObjectStorage(config).ensureBucket();
  assert.deepEqual(sent, ['HeadBucketCommand', 'CreateBucketCommand']);
  for (const code of [403, 500]) {
    send.mock.mockImplementation(async () => { throw Object.assign(new Error(`storage ${code}`), { $metadata: { httpStatusCode: code } }); });
    await assert.rejects(createObjectStorage(config).ensureBucket(), new RegExp(`storage ${code}`));
  }
});

test('compatible providers keep bucket policies; only unsupported operations are informational', async t => {
  const generic = { ...config, endpoint: 'http://minio:9000', publicBaseUrl: 'https://images.example.test' };
  const sent = [];
  const send = t.mock.method(S3Client.prototype, 'send', async command => { sent.push(command.constructor.name); return {}; });
  await createObjectStorage(generic).ensureBucket();
  assert.deepEqual(sent, ['HeadBucketCommand', 'PutBucketPolicyCommand']);
  const info = t.mock.method(console, 'info', () => {});
  for (const code of [501, 403, 500]) {
    send.mock.mockImplementation(async command => {
      if (command.constructor.name === 'PutBucketPolicyCommand') throw Object.assign(new Error(`policy ${code}`), { $metadata: { httpStatusCode: code } });
      return {};
    });
    if (code === 501) await createObjectStorage(generic).ensureBucket();
    else await assert.rejects(createObjectStorage(generic).ensureBucket(), new RegExp(`policy ${code}`));
  }
  assert.equal(info.mock.callCount(), 1);
});

test('the real S3 SDK uploads image bytes and video streams with readable public URLs', async t => {
  const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const objects = new Map();
  const server = http.createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'HEAD') { res.writeHead(200); return res.end(); }
    if (req.method === 'PUT') {
      assert.match(req.headers.authorization || '', /^AWS4-HMAC-SHA256/);
      const body = [];
      for await (const chunk of req) body.push(chunk);
      objects.set(path, { body: Buffer.concat(body), contentType: req.headers['content-type'], contentLength: req.headers['content-length'], contentEncoding: req.headers['content-encoding'] });
      res.writeHead(200); return res.end();
    }
    const stored = objects.get(path.replace('/public/', '/test-images/'));
    if (!stored) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': stored.contentType }); res.end(stored.body);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const storage = createObjectStorage({ ...config, endpoint, publicBaseUrl: `${endpoint}/public`, forcePathStyle: true });
  await storage.ensureBucket();
  const url = await storage.put({ key: 'uploads/foto.png', body: image, contentType: 'image/png' });
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), image);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reusa-s3-stream-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const video = Buffer.from([0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0]);
  const videoFile = path.join(directory, 'video.mp4');
  fs.writeFileSync(videoFile, video);
  const videoUrl = await storage.put({ key: 'uploads/video.mp4', body: fs.createReadStream(videoFile), contentType: 'video/mp4', contentLength: video.length });
  const videoResponse = await fetch(videoUrl);
  assert.equal(videoResponse.status, 200);
  assert.equal(videoResponse.headers.get('content-type'), 'video/mp4');
  assert.deepEqual(Buffer.from(await videoResponse.arrayBuffer()), video);
  const uploadedVideo = objects.get('/test-images/uploads/video.mp4');
  assert.equal(uploadedVideo.contentLength, String(video.length));
  assert.equal(uploadedVideo.contentEncoding, undefined, 'compatible providers receive the media bytes directly, without aws-chunked framing');
});
