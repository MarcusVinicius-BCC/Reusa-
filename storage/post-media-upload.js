const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const multer = require('multer');

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Map([
  ['image/jpeg', '.jpg'], ['image/png', '.png'], ['image/gif', '.gif'],
  ['image/webp', '.webp'], ['image/avif', '.avif']
]);
const VIDEO_EXTENSIONS = new Map([['video/mp4', '.mp4'], ['video/webm', '.webm']]);

function invalidMedia(message) {
  return Object.assign(new Error(message), { status: 400, code: 'INVALID_POST_MEDIA' });
}

function uploadErrorMessage(error) {
  if (error.code === 'LIMIT_FILE_SIZE') {
    return error.field === 'images' ? 'Cada foto pode ter até 5 MB.' : 'Cada vídeo pode ter até 50 MB.';
  }
  if (['LIMIT_FILE_COUNT', 'LIMIT_UNEXPECTED_FILE'].includes(error.code)) {
    return 'Envie até 8 fotos e 2 vídeos por publicação, nos campos de mídia permitidos.';
  }
  return 'O envio de mídia excedeu os limites da publicação.';
}

async function validateVideo(file) {
  const handle = await fs.promises.open(file.path, 'r');
  try {
    const header = Buffer.alloc(16);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const valid = file.mimetype === 'video/mp4'
      ? bytesRead >= 12 && header.toString('ascii', 4, 8) === 'ftyp'
      : bytesRead >= 4 && header.readUInt32BE(0) === 0x1a45dfa3;
    if (!valid) throw invalidMedia('O vídeo não é um arquivo MP4 ou WebM válido.');
  } finally {
    await handle.close();
  }
}

async function moveFile(source, target) {
  try {
    await fs.promises.rename(source, target);
  } catch (error) {
    if (error.code !== 'EXDEV') throw error;
    await fs.promises.copyFile(source, target, fs.constants.COPYFILE_EXCL);
    await fs.promises.unlink(source);
  }
}

function createPostUpload({ uploadDir, objectStorage }) {
  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, _file, callback) => callback(null, req.postMediaStage),
      filename: (_req, file, callback) => callback(null, `${crypto.randomUUID()}${IMAGE_EXTENSIONS.get(file.mimetype) || VIDEO_EXTENSIONS.get(file.mimetype)}`)
    }),
    limits: { fileSize: VIDEO_MAX_BYTES, files: 10, fields: 100, fieldSize: 100 * 1024, parts: 110 },
    fileFilter: (_req, file, callback) => {
      if (file.fieldname === 'images' && IMAGE_EXTENSIONS.has(file.mimetype)) return callback(null, true);
      if (file.fieldname === 'videos' && VIDEO_EXTENSIONS.has(file.mimetype)) return callback(null, true);
      return callback(invalidMedia(file.fieldname === 'videos'
        ? 'Use vídeos MP4 ou WebM.'
        : 'Use fotos JPG, PNG, GIF, WebP ou AVIF. Os vídeos devem ser adicionados no campo de vídeos.'));
    }
  }).fields([{ name: 'images', maxCount: 8 }, { name: 'videos', maxCount: 2 }]);

  return async (req, res, next) => {
    if (!req.is('multipart/form-data')) {
      req.files = { images: [], videos: [] };
      return next();
    }

    let stage;
    const localFiles = new Set();
    const remoteKeys = new Set();
    let discardUploads = false;
    let handedOff = false;
    const removeStage = () => stage ? fs.promises.rm(stage, { recursive: true, force: true }).catch(() => {}) : Promise.resolve();
    const discardStoredFiles = () => {
      discardUploads = true;
      const files = [...localFiles], keys = [...remoteKeys];
      // Claim each object before awaiting deletion: finish, close and abort can
      // fire for the same failed response without deleting it multiple times.
      localFiles.clear();
      remoteKeys.clear();
      return Promise.all([
        ...files.map(file => fs.promises.unlink(file).catch(() => {})),
        ...keys.map(key => Promise.resolve().then(() => objectStorage?.remove?.({ key })).catch(() => {}))
      ]);
    };
    const cleanupResponse = () => {
      void removeStage();
      if (req.postMediaCommitted) return;
      // Once the business handler starts, a closed connection does not tell us
      // whether its database transaction will commit. Never delete its media
      // while that transaction may still be saving a valid publication.
      if (handedOff && !res.writableFinished) return;
      if (!res.writableFinished || res.statusCode >= 400) void discardStoredFiles();
    };

    try {
      stage = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'reusa-post-media-'));
      req.postMediaStage = stage;
      res.once('finish', cleanupResponse);
      res.once('close', cleanupResponse);
      req.once('aborted', cleanupResponse);
      upload(req, res, async (error) => {
        try {
          if (error) throw error;
          req.files = { images: req.files?.images || [], videos: req.files?.videos || [] };
          const files = [...req.files.images, ...req.files.videos];
          // Validate the complete batch before exposing any file publicly.
          for (const file of files) {
            const maxBytes = file.fieldname === 'images' ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES;
            if (!file.size || file.size > maxBytes) {
              throw invalidMedia(file.fieldname === 'images' ? 'Cada foto deve ter entre 1 byte e 5 MB.' : 'Cada vídeo deve ter entre 1 byte e 50 MB.');
            }
            if (file.fieldname === 'videos') await validateVideo(file);
          }
          await fs.promises.mkdir(uploadDir, { recursive: true });
          for (const file of files) {
            const filename = `${Date.now()}-${crypto.randomUUID()}${IMAGE_EXTENSIONS.get(file.mimetype) || VIDEO_EXTENSIONS.get(file.mimetype)}`;
            if (objectStorage) {
              const key = `uploads/${filename}`;
              const body = fs.createReadStream(file.path);
              try {
                file.location = await objectStorage.put({ key, body, contentType: file.mimetype, contentLength: file.size });
                remoteKeys.add(key);
              } finally {
                body.destroy();
              }
              file.filename = key;
            } else {
              const destination = path.join(uploadDir, filename);
              await moveFile(file.path, destination);
              localFiles.add(destination);
              file.filename = filename;
              file.path = destination;
              file.destination = uploadDir;
            }
            if (discardUploads || req.aborted || res.destroyed) {
              await discardStoredFiles();
              await removeStage();
              return;
            }
          }
          await removeStage();
          delete req.postMediaStage;
          handedOff = true;
          return next();
        } catch (uploadError) {
          await removeStage();
          await discardStoredFiles();
          delete req.postMediaStage;
          if (req.aborted || res.destroyed) return;
          if (uploadError instanceof multer.MulterError) return res.status(400).json({ error: uploadErrorMessage(uploadError) });
          if (uploadError.code === 'INVALID_POST_MEDIA') return res.status(400).json({ error: uploadError.message });
          return next(uploadError);
        }
      });
    } catch (error) {
      await removeStage();
      return next(error);
    }
  };
}

module.exports = { createPostUpload, IMAGE_MAX_BYTES, VIDEO_MAX_BYTES };
