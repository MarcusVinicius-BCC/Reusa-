const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// These are real, short FFmpeg-generated videos, so byte/header checks use
// playable fixtures rather than files that only pretend to be a video.
const webm = fs.readFileSync(path.join(__dirname, 'fixtures/post-video.webm'));
const mp4 = fs.readFileSync(path.join(__dirname, 'fixtures/post-video.mp4'));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZYQAAAAASUVORK5CYII=', 'base64');

async function exercisePostMedia(request, { rawFetch }) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const json = { 'Content-Type': 'application/json' };
  const register = async role => {
    const result = await request('/api/auth/register', { method: 'POST', headers: json,
      body: JSON.stringify({ name: `Mídias ${role}`, email: `media-${role}-${suffix}@example.test`, password: 'senha-segura-123', city: 'Belém, PA' }) });
    assert.equal(result.response.status, 201);
    return { Authorization: `Bearer ${result.payload.token}` };
  };
  const owner = await register('owner'), other = await register('other');
  const fields = { title: `Mesa com vídeo ${suffix}`, description: 'Mesa em bom estado, mostrada em fotos e vídeos para reutilização.', category: 'Móveis', condition: 'Bom estado', goal: 'Doação', location: 'Belém, PA' };
  const form = (values = fields) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, Array.isArray(value) ? JSON.stringify(value) : value);
    return data;
  };
  const image = (data, name = 'mesa.png', bytes = png) => data.append('images', new Blob([bytes], { type: 'image/png' }), name);
  const video = (data, mime = 'video/webm', bytes = webm, name = 'mesa.webm') => data.append('videos', new Blob([bytes], { type: mime }), name);
  const create = data => request('/api/posts', { method: 'POST', headers: owner, body: data });
  const update = (id, body, headers = owner) => request(`/api/posts/${id}`, { method: 'PUT', headers, body });
  const getPost = async id => (await request(`/api/posts/${id}`, { headers: owner })).payload.post;
  const rejected = result => assert.equal(result.response.status, 400, JSON.stringify(result.payload));

  const single = form(); video(single);
  const created = await create(single);
  assert.equal(created.response.status, 201, JSON.stringify(created.payload));
  const onlyVideo = created.payload.post;
  assert.equal(onlyVideo.imageUrl, '/media/video-placeholder.svg');
  assert.deepEqual(onlyVideo.imageUrls, []);
  assert.equal(onlyVideo.videos.length, 1);
  assert.equal(onlyVideo.videos[0].mimeType, 'video/webm');
  assert.match(onlyVideo.videos[0].url, /^\/uploads\/.*\.webm$/);
  assert.deepEqual((await getPost(onlyVideo.id)).videos, onlyVideo.videos);
  for (const endpoint of ['/api/feed', '/api/profile']) {
    const result = await request(endpoint, { headers: owner });
    assert.equal(result.response.status, 200);
    const listed = result.payload.posts.find(post => post.id === onlyVideo.id);
    assert.ok(listed, `video-only item must appear in ${endpoint}`);
    assert.deepEqual(listed.imageUrls, []);
    assert.deepEqual(listed.videos, onlyVideo.videos);
  }
  const downloaded = await rawFetch(onlyVideo.videos[0].url);
  assert.equal(downloaded.status, 200);
  assert.match(downloaded.headers.get('content-type'), /^video\/webm\b/);
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), webm);
  const range = await rawFetch(onlyVideo.videos[0].url, { headers: { Range: 'bytes=0-15' } });
  assert.equal(range.status, 206, 'video delivery must support byte ranges');
  assert.match(range.headers.get('content-range'), /^bytes 0-15\//);
  assert.deepEqual(Buffer.from(await range.arrayBuffer()), webm.subarray(0, 16));

  const mixed = form(); image(mixed, 'mesa-1.png'); image(mixed, 'mesa-2.png'); video(mixed); video(mixed, 'video/mp4', mp4, 'mesa.mp4');
  const mixedResult = await create(mixed);
  assert.equal(mixedResult.response.status, 201, JSON.stringify(mixedResult.payload));
  let current = mixedResult.payload.post;
  const mixedId = current.id, originalImages = [...current.imageUrls], originalVideos = current.videos.map(v => ({ ...v }));
  assert.equal(current.imageUrls.length, 2); assert.equal(current.imageUrl, current.imageUrls[0]);
  assert.deepEqual(current.videos.map(v => v.mimeType), ['video/webm', 'video/mp4']);
  const description = await update(mixedId, JSON.stringify({ title: 'Mesa com descrição revisada' }), { ...owner, ...json });
  assert.equal(description.response.status, 200, JSON.stringify(description.payload));
  assert.deepEqual(description.payload.post.imageUrls, originalImages);
  assert.deepEqual(description.payload.post.videos, originalVideos, 'editing text must preserve videos');

  const beforeInvalid = await getPost(mixedId);
  const foreignOrder = form({ title: 'Título que não pode ser salvo', videoOrder: ['existing:https://foreign.example/video.mp4'] });
  rejected(await update(mixedId, foreignOrder));
  const duplicateOrder = form({ title: 'Outro título inválido', videoOrder: [`existing:${originalVideos[0].url}`, `existing:${originalVideos[0].url}`] });
  rejected(await update(mixedId, duplicateOrder));
  const invalidImageOrder = form({ title: 'Título com foto desconhecida', imageOrder: ['existing:https://foreign.example/foto.png'] });
  rejected(await update(mixedId, invalidImageOrder));
  current = await getPost(mixedId);
  assert.equal(current.title, beforeInvalid.title, 'invalid media edits must not partially update item details');
  assert.deepEqual(current.imageUrls, beforeInvalid.imageUrls); assert.deepEqual(current.videos, beforeInvalid.videos);

  const reordered = await update(mixedId, form({ imageOrder: originalImages.slice().reverse().map(url => `existing:${url}`), videoOrder: originalVideos.slice().reverse().map(v => `existing:${v.url}`) }));
  assert.equal(reordered.response.status, 200, JSON.stringify(reordered.payload));
  assert.deepEqual(reordered.payload.post.imageUrls, originalImages.slice().reverse());
  assert.equal(reordered.payload.post.imageUrl, originalImages[1]);
  assert.deepEqual(reordered.payload.post.videos, originalVideos.slice().reverse());
  const replace = form({ videoOrder: [`existing:${originalVideos[1].url}`, 'new:0'] }); video(replace);
  const replaced = await update(mixedId, replace);
  assert.equal(replaced.response.status, 200, JSON.stringify(replaced.payload));
  assert.equal(replaced.payload.post.videos.length, 2);
  assert.equal(replaced.payload.post.videos[0].url, originalVideos[1].url);
  assert.notEqual(replaced.payload.post.videos[1].url, originalVideos[0].url);
  const noPhotos = await update(mixedId, form({ imageOrder: [] }));
  assert.equal(noPhotos.response.status, 200, JSON.stringify(noPhotos.payload));
  assert.deepEqual(noPhotos.payload.post.imageUrls, []); assert.equal(noPhotos.payload.post.imageUrl, '/media/video-placeholder.svg');
  rejected(await update(mixedId, form({ title: 'Não pode ficar sem mídia', imageOrder: [], videoOrder: [] })));
  assert.notEqual((await getPost(mixedId)).title, 'Não pode ficar sem mídia');
  const singleRemaining = await update(mixedId, form({ videoOrder: [`existing:${replaced.payload.post.videos[1].url}`] }));
  assert.equal(singleRemaining.response.status, 200); assert.equal(singleRemaining.payload.post.videos.length, 1);
  const photoOnly = form({ videoOrder: [] }); image(photoOnly);
  const changedToPhoto = await update(mixedId, photoOnly);
  assert.equal(changedToPhoto.response.status, 200, JSON.stringify(changedToPhoto.payload));
  assert.equal(changedToPhoto.payload.post.imageUrls.length, 1); assert.deepEqual(changedToPhoto.payload.post.videos, []);

  const forbidden = await update(onlyVideo.id, JSON.stringify({ title: 'Edição de outra pessoa' }), { ...other, ...json });
  assert.equal(forbidden.response.status, 403); assert.equal((await getPost(onlyVideo.id)).title, onlyVideo.title);
  assert.equal((await update(onlyVideo.id, form(), {})).response.status, 401);
  rejected(await create(form()));
  const unsupported = form(); video(unsupported, 'video/x-msvideo', Buffer.from('RIFF unsupported'), 'mesa.avi'); rejected(await create(unsupported));
  const spoof = form(); video(spoof, 'video/mp4', Buffer.from('this is not an MP4 container'), 'falso.mp4'); rejected(await create(spoof));
  const wrongField = form(); wrongField.append('images', new Blob([webm], { type: 'video/webm' }), 'video-em-fotos.webm'); rejected(await create(wrongField));
  const manyVideos = form(); for (let i = 0; i < 3; i += 1) video(manyVideos, 'video/webm', webm, `video-${i}.webm`); rejected(await create(manyVideos));
  const manyImages = form(); for (let i = 0; i < 9; i += 1) image(manyImages, `foto-${i}.png`); rejected(await create(manyImages));
  const tooLargeImage = form(); image(tooLargeImage, 'foto-grande.png', Buffer.alloc(5 * 1024 * 1024 + 1)); rejected(await create(tooLargeImage));
  const tooLargeVideo = form(); video(tooLargeVideo, 'video/mp4', Buffer.alloc(50 * 1024 * 1024 + 1), 'video-grande.mp4'); rejected(await create(tooLargeVideo));
  const injected = await request('/api/posts', { method: 'POST', headers: { ...owner, ...json }, body: JSON.stringify({ ...fields, imageUrl: 'https://images.example.test/item.png', videos: [{ url: 'https://foreign.example/video.mp4', mimeType: 'video/mp4' }] }) });
  rejected(injected);
  const removed = await request(`/api/posts/${onlyVideo.id}`, { method: 'DELETE', headers: owner });
  assert.equal(removed.response.status, 200); assert.equal((await request(`/api/posts/${onlyVideo.id}`)).response.status, 404);
}

module.exports = { exercisePostMedia };
