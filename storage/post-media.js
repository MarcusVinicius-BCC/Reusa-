const VIDEO_POSTER = '/media/video-placeholder.svg';

function mediaError(message) {
  return Object.assign(new Error(message), { status: 400, postMediaError: true });
}

function uploadedUrl(file) {
  return file.location || `/uploads/${file.filename}`;
}

function parseMediaOrder(value, label) {
  if (value === undefined) return undefined;
  let order;
  try { order = typeof value === 'string' ? JSON.parse(value) : value; }
  catch { throw mediaError(`A ordem de ${label} é inválida.`); }
  if (!Array.isArray(order)) throw mediaError(`A ordem de ${label} é inválida.`);
  return order;
}

// Existing URLs must belong to this post. A client can only add a new URL by
// uploading a file; the ordering fields never grant access to another post.
function orderedMedia(existing, uploaded, order, limit, label) {
  const entries = order === undefined
    ? [...existing.map((item) => `existing:${item.url}`), ...uploaded.map((_, index) => `new:${index}`)]
    : order;
  if (entries.length > limit) throw mediaError(`Use no máximo ${limit} ${label}.`);
  const known = new Map(existing.map((item) => [item.url, item]));
  const seen = new Set();
  return entries.map((entry) => {
    if (typeof entry !== 'string') throw mediaError(`A ordem de ${label} é inválida.`);
    let item;
    if (entry.startsWith('existing:')) item = known.get(entry.slice(9));
    else if (/^new:\d+$/.test(entry)) item = uploaded[Number(entry.slice(4))];
    if (!item || seen.has(item.url)) throw mediaError(`A ordem de ${label} contém arquivos inválidos ou repetidos.`);
    seen.add(item.url);
    return item;
  });
}

function rejectRemoteVideos(body) {
  if (body?.videoUrl !== undefined || body?.videoUrls !== undefined || body?.videos !== undefined) {
    throw mediaError('Envie o arquivo de vídeo em MP4 ou WebM pelo seletor de arquivos.');
  }
}

module.exports = { VIDEO_POSTER, mediaError, uploadedUrl, parseMediaOrder, orderedMedia, rejectRemoteVideos };
