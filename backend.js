const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const initSqlJs = require('sql.js');

const app = express();
const PORT = process.env.PORT || 3000;
const hasConfiguredJwtSecret = Boolean(process.env.JWT_SECRET);
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const ROOT = __dirname;
// Railway exposes the path of an attached Volume through this variable.
// Without a Volume, development continues to use the local data folder.
const DATA_DIR = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'reusa.sqlite');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DIST_DIR = path.join(ROOT, 'dist');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const IMAGE_EXTENSIONS = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/gif', '.gif'],
  ['image/webp', '.webp'],
  ['image/avif', '.avif']
]);

const SCREEN_ROUTES = {
  SCREEN_2: '/criar-conta',
  SCREEN_4: '/login',
  SCREEN_5: '/configuracoes',
  SCREEN_6: '/mensagens/ana',
  SCREEN_7: '/mensagens',
  SCREEN_9: '/nova-publicacao',
  SCREEN_11: '/perfil',
  SCREEN_13: '/mapa',
  SCREEN_15: '/feed',
  SCREEN_17: '/splash'
};

const ROUTE_FILES = {
  '/splash': 'splash_screen/code.html',
  '/login': 'login/code.html',
  '/criar-conta': 'criar_conta/code.html',
  '/feed': 'feed_inicial_interligado/code.html',
  '/feed-base': 'feed_inicial/code.html',
  '/mensagens': 'mensagens/code.html',
  '/mensagens/ana': 'conversa_com_ana/code.html',
  '/nova-publicacao': 'nova_publica_o/code.html',
  '/perfil': 'meu_perfil_interligado/code.html',
  '/perfil-base-1': 'meu_perfil_1/code.html',
  '/perfil-base-2': 'meu_perfil_2/code.html',
  '/mapa': 'pontos_de_coleta_interligado/code.html',
  '/mapa-base': 'pontos_de_coleta/code.html',
  '/configuracoes': 'configura_es/code.html'
};

let db;

app.disable('x-powered-by');
if (process.env.RAILWAY_ENVIRONMENT_NAME) {
  app.set('trust proxy', 1);
}
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self)');
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://viacep.com.br https://nominatim.openstreetmap.org");
  next();
});

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function legacyPasswordHash(password) {
  return sha256(`reusa:${password}`);
}

function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  if (typeof storedHash !== 'string') {
    return false;
  }

  const [algorithm, salt, digest] = storedHash.split('$');
  if (algorithm === 'scrypt' && salt && digest) {
    const calculated = crypto.scryptSync(String(password), salt, 64);
    const expected = Buffer.from(digest, 'hex');
    return expected.length === calculated.length && crypto.timingSafeEqual(calculated, expected);
  }

  const legacyHash = Buffer.from(legacyPasswordHash(password), 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  return expected.length === legacyHash.length && crypto.timingSafeEqual(legacyHash, expected);
}

function uid(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function createRateLimiter({ windowMs, maxRequests }) {
  const attempts = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = `${req.ip}:${req.path}`;
    const record = attempts.get(key);
    const current = !record || now - record.startedAt >= windowMs
      ? { startedAt: now, count: 0 }
      : record;

    current.count += 1;
    attempts.set(key, current);

    if (current.count > maxRequests) {
      res.setHeader('Retry-After', Math.ceil((windowMs - (now - current.startedAt)) / 1000));
      return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }

    return next();
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`External request failed with status ${response.status}`);
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function loadDbBytes() {
  if (fs.existsSync(DB_FILE)) {
    return fs.readFileSync(DB_FILE);
  }
  return null;
}

function persistDb() {
  const data = db.export();
  const temporaryFile = `${DB_FILE}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporaryFile, Buffer.from(data));
    fs.renameSync(temporaryFile, DB_FILE);
  } finally {
    if (fs.existsSync(temporaryFile)) {
      fs.unlinkSync(temporaryFile);
    }
  }
}

function safeImageUrl(value, fallback) {
  const candidate = String(value || '').trim();
  if (!candidate) return fallback;

  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

function run(sql, params = []) {
  db.run(sql, params);
}

function get(sql, params = []) {
  const result = db.exec(sql, params);
  if (!result.length || !result[0].values.length) {
    return null;
  }

  return Object.fromEntries(result[0].columns.map((column, index) => [column, result[0].values[0][index]]));
}

function all(sql, params = []) {
  const result = db.exec(sql, params);
  if (!result.length) {
    return [];
  }

  const { columns, values } = result[0];
  return values.map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index]])));
}

function ensureColumn(table, column, definition) {
  const columns = all(`PRAGMA table_info(${table})`);
  if (!columns.some((item) => item.name === column)) {
    run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function jsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function userFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    city: row.city,
    cep: row.cep || '',
    address: row.address || '',
    interests: jsonArray(row.interests_json),
    avatar: safeAvatar(row.avatar),
    rating: row.rating,
    donations: row.donations,
    received: row.received,
    carbonSavedPercent: row.carbon_saved_percent,
    achievements: jsonArray(row.achievements_json),
    role: row.role || 'user',
    suspended: Boolean(row.suspended),
    notificationPreferences: jsonArray(row.notification_preferences_json)
  };
}

function safeAvatar(value) {
  const avatar = String(value || '').trim();
  return avatar.includes('ui-avatars.com') ? '' : avatar;
}

function isAdmin(user) {
  return user?.role === 'admin';
}

function adminMiddleware(req, res, next) {
  if (!isAdmin(req.user)) {
    return res.status(403).json({ error: 'Administrator access required' });
  }
  return next();
}

function notification(userId, type, title, text, link = '') {
  run(
    'INSERT INTO notifications (id, user_id, type, title, text, created_at, link) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [uid('notification'), userId, type, title, text, new Date().toISOString(), link]
  );
}

function publicPost(row, viewerId = null) {
  const author = get('SELECT id, name, city, avatar FROM users WHERE id = ?', [row.author_id]);
  const interestCount = get("SELECT COUNT(*) AS count FROM negotiations WHERE post_id = ? AND status IN ('interested', 'reserved', 'completed')", [row.id])?.count || 0;
  const saved = viewerId ? Boolean(get('SELECT post_id FROM favorites WHERE user_id = ? AND post_id = ?', [viewerId, row.id])) : false;
  const liked = viewerId ? Boolean(get('SELECT post_id FROM post_likes WHERE user_id = ? AND post_id = ?', [viewerId, row.id])) : false;
  const reputation = author ? get('SELECT ROUND(AVG(rating), 1) AS average, COUNT(*) AS count FROM reviews WHERE reviewee_id = ?', [author.id]) : null;
  return {
    id: row.id,
    authorId: row.author_id,
    author: author ? { id: author.id, name: author.name, city: author.city, avatar: safeAvatar(author.avatar) } : null,
    title: row.title,
    description: row.description,
    category: row.category,
    condition: row.condition,
    goal: row.goal,
    imageUrl: row.image_url,
    likes: row.likes,
    comments: row.comments,
    location: approximateLocation(row.location),
    createdAt: row.created_at,
    chipIcon: row.chip_icon,
    chipLabel: row.chip_label,
    status: row.status || 'Disponível',
    views: Number(row.views || 0),
    interestedCount: Number(interestCount),
    saved,
    liked,
    updatedAt: row.updated_at || row.created_at,
    authorReputation: Number(reputation?.average || 0),
    authorReviewCount: Number(reputation?.count || 0)
  };
}

function threadSummary(row, currentUserId) {
  const participants = JSON.parse(row.participants_json || '[]');
  const otherParticipantId = participants.find((participantId) => participantId !== currentUserId) || participants[0];
  const otherUser = otherParticipantId ? get('SELECT id, name, avatar FROM users WHERE id = ?', [otherParticipantId]) : null;
  const lastMessage = get('SELECT text, sent_at FROM messages WHERE thread_id = ? ORDER BY sent_at DESC LIMIT 1', [row.id]);
  const post = get('SELECT title FROM posts WHERE id = ?', [row.post_id]);

  return {
    id: row.id,
    threadId: row.id,
    unreadCount: row.unread_count,
    title: otherUser ? otherUser.name : 'Conversa',
    subtitle: lastMessage ? lastMessage.text : post ? post.title : 'Sem mensagens',
    time: lastMessage ? new Date(lastMessage.sent_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
    avatar: otherUser ? otherUser.avatar : null,
    route: '/mensagens/ana'
  };
}

function createToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = get('SELECT * FROM users WHERE id = ?', [payload.sub]);

    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    if (user.suspended) {
      return res.status(403).json({ error: 'This account is suspended' });
    }

    req.user = userFromRow(user);
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function seedDatabase() {
  run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      city TEXT NOT NULL,
      cep TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      interests_json TEXT NOT NULL DEFAULT '[]',
      avatar TEXT NOT NULL,
      rating REAL NOT NULL DEFAULT 4.8,
      donations INTEGER NOT NULL DEFAULT 0,
      received INTEGER NOT NULL DEFAULT 0,
      carbon_saved_percent INTEGER NOT NULL DEFAULT 0,
      achievements_json TEXT NOT NULL DEFAULT '[]',
      role TEXT NOT NULL DEFAULT 'user',
      suspended INTEGER NOT NULL DEFAULT 0,
      notification_preferences_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT
    );
  `);

  const userColumns = new Set(all('PRAGMA table_info(users)').map((column) => column.name));
  ['cep', 'address'].forEach((column) => {
    if (!userColumns.has(column)) {
      run(`ALTER TABLE users ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
    }
  });

  run(`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      condition TEXT NOT NULL,
      goal TEXT NOT NULL,
      image_url TEXT NOT NULL,
      likes INTEGER NOT NULL DEFAULT 0,
      comments INTEGER NOT NULL DEFAULT 0,
      location TEXT NOT NULL,
      created_at TEXT NOT NULL,
      chip_icon TEXT NOT NULL,
      chip_label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Disponível',
      reserved_by TEXT,
      completed_with TEXT,
      completed_at TEXT,
      views INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT,
      FOREIGN KEY(author_id) REFERENCES users(id)
    );
  `);

  run(`
    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      participants_json TEXT NOT NULL,
      unread_count INTEGER NOT NULL DEFAULT 0,
      last_message_at TEXT NOT NULL,
      FOREIGN KEY(post_id) REFERENCES posts(id)
    );
  `);

  run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      text TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      status TEXT NOT NULL,
      FOREIGN KEY(thread_id) REFERENCES threads(id),
      FOREIGN KEY(sender_id) REFERENCES users(id)
    );
  `);

  run(`
    CREATE TABLE IF NOT EXISTS collection_points (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      categories_json TEXT NOT NULL,
      hours TEXT NOT NULL,
      location TEXT NOT NULL,
      status TEXT NOT NULL,
      origin TEXT NOT NULL DEFAULT 'ReUsa+',
      last_updated TEXT,
      latitude REAL,
      longitude REAL
    );
  `);

  run(`
    CREATE TABLE IF NOT EXISTS inspiration_products (
      id TEXT PRIMARY KEY,
      creator_id TEXT NOT NULL,
      title TEXT NOT NULL,
      material TEXT NOT NULL,
      price TEXT NOT NULL,
      city TEXT NOT NULL,
      image_url TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(creator_id) REFERENCES users(id)
    );
  `);

  run(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(post_id) REFERENCES posts(id),
      FOREIGN KEY(author_id) REFERENCES users(id)
    );
  `);

  run(`
    CREATE TABLE IF NOT EXISTS post_likes (
      post_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (post_id, user_id),
      FOREIGN KEY(post_id) REFERENCES posts(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  run(`
    CREATE TABLE IF NOT EXISTS favorites (
      user_id TEXT NOT NULL,
      post_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, post_id),
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(post_id) REFERENCES posts(id)
    );
  `);

  run(`
    CREATE TABLE IF NOT EXISTS post_views (
      post_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      viewed_at TEXT NOT NULL,
      PRIMARY KEY (post_id, user_id),
      FOREIGN KEY(post_id) REFERENCES posts(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  run(`
    CREATE TABLE IF NOT EXISTS negotiations (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      interested_id TEXT NOT NULL,
      thread_id TEXT,
      status TEXT NOT NULL DEFAULT 'interested',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      UNIQUE(post_id, interested_id),
      FOREIGN KEY(post_id) REFERENCES posts(id),
      FOREIGN KEY(owner_id) REFERENCES users(id),
      FOREIGN KEY(interested_id) REFERENCES users(id)
    );
  `);

  run(`
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      negotiation_id TEXT NOT NULL,
      reviewer_id TEXT NOT NULL,
      reviewee_id TEXT NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      UNIQUE(negotiation_id, reviewer_id),
      FOREIGN KEY(negotiation_id) REFERENCES negotiations(id),
      FOREIGN KEY(reviewer_id) REFERENCES users(id),
      FOREIGN KEY(reviewee_id) REFERENCES users(id)
    );
  `);

  run(`
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      reviewed_at TEXT,
      reviewed_by TEXT,
      UNIQUE(reporter_id, target_type, target_id),
      FOREIGN KEY(reporter_id) REFERENCES users(id)
    );
  `);

  run(`
    CREATE TABLE IF NOT EXISTS blocked_users (
      blocker_id TEXT NOT NULL,
      blocked_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (blocker_id, blocked_id),
      FOREIGN KEY(blocker_id) REFERENCES users(id),
      FOREIGN KEY(blocked_id) REFERENCES users(id)
    );
  `);

  run(`
    CREATE TABLE IF NOT EXISTS collection_point_suggestions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      categories_json TEXT NOT NULL,
      hours TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      reviewed_at TEXT,
      reviewed_by TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      read_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  ensureColumn('users', 'role', "TEXT NOT NULL DEFAULT 'user'");
  ensureColumn('users', 'suspended', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('users', 'notification_preferences_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('users', 'last_active_at', 'TEXT');
  ensureColumn('users', 'created_at', 'TEXT');
  ensureColumn('posts', 'status', "TEXT NOT NULL DEFAULT 'Disponível'");
  ensureColumn('posts', 'reserved_by', 'TEXT');
  ensureColumn('posts', 'completed_with', 'TEXT');
  ensureColumn('posts', 'completed_at', 'TEXT');
  ensureColumn('posts', 'views', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('posts', 'updated_at', 'TEXT');
  ensureColumn('collection_points', 'origin', "TEXT NOT NULL DEFAULT 'ReUsa+'");
  ensureColumn('collection_points', 'last_updated', 'TEXT');
  ensureColumn('collection_points', 'latitude', 'REAL');
  ensureColumn('collection_points', 'longitude', 'REAL');
  ensureColumn('notifications', 'link', "TEXT NOT NULL DEFAULT ''");

  run(`UPDATE users SET rating = 0 WHERE donations = 0 AND received = 0 AND carbon_saved_percent = 0 AND achievements_json = '["Novo membro"]'`);
  run(`UPDATE users SET avatar = '' WHERE avatar LIKE '%ui-avatars.com%'`);
  run(`UPDATE users SET avatar = '' WHERE id = 'user-ana'`);
  run('UPDATE users SET created_at = COALESCE(created_at, ?)', [new Date().toISOString()]);

  const adminEmail = String(process.env.ADMIN_EMAIL || 'mariana@reusa.com').trim().toLowerCase();
  if (adminEmail) {
    run('UPDATE users SET role = ? WHERE lower(email) = lower(?)', ['admin', adminEmail]);
  }

  const userCount = get('SELECT COUNT(*) AS count FROM users')?.count || 0;
  if (userCount > 0) {
    return;
  }

  const seedUsers = [
    {
      id: 'user-mariana',
      name: 'Mariana Silva',
      email: 'mariana@reusa.com',
      password: '12345678',
      city: 'Santarém, PA',
      interests: ['Eletrônicos', 'Livros', 'Móveis'],
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDfKn67wUHUzena6GPilhlMnfDTrX-AWCwJhpH14zxiCoejXVjCmxTucAueuPpn8n-U7rlurleOutdAv9CDYPpbq_d_piVERXOSL9LlJEldAYneOM-xWur8isWTqBuxA_ft7dzi7Timk6eUEJCDUm4nfvwZJ8jrPK8xrShXRX2SD8w4XW2jVbrB8or5gfnOPiF82d6nji601xBCm_Ngt9MkRuR_c4rTOstyZqS4B3TfM7ejEF6ZgsGV',
      rating: 0,
      donations: 12,
      received: 5,
      carbonSavedPercent: 65,
      achievements: ['Doador Ativo', 'Parceiro Ambiental', 'Pioneiro']
    },
    {
      id: 'user-ana',
      name: 'Ana Costa',
      email: 'ana@reusa.com',
      password: '12345678',
      city: 'Santarém - PA',
      interests: ['Eletrônicos'],
      avatar: ''
    },
    {
      id: 'user-carlos',
      name: 'Carlos Eduardo',
      email: 'carlos@reusa.com',
      password: '12345678',
      city: 'Belém - PA',
      interests: ['Móveis'],
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAiQNpgXHXcxsqlUle1BD51S0EefNYNX04RVTyt0saBA8DRgBGuv_57hJHCLHG52ZGvF-H9WTCzDe68Ufjm4uAlEgryZWVFb2PNVrHS2-yMUF4POWIFsawtqpMXUqATzO51bEPkYjCRa_1TBJkX7LNkrIOIg7X1oZev-uKhXDeR178SmHGTAAwx8QKEywHcZAzXGkcdtSBu_YhT1ac28kZ3xyb0yrHpO1XzsgCYrIm6Xuq7ANzxu9aE'
    },
    {
      id: 'user-maria',
      name: 'Maria Silva',
      email: 'maria@reusa.com',
      password: '12345678',
      city: 'Santarém, PA',
      interests: ['Pilhas', 'Cooperativas'],
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD9NRHlC3dq7BBwbaGVyUiXLd5N4mQkLW3JB9vLMQFONxbw11AJQ7pnDIXN3PJv8CchCKfDUOtDgvXZelW_wTZiy3m-eKpu1nyPG_qwyrJcKW2j--yXPi2acaTIA8k66t0J3SFeg6Gl31xpNSEq8YjVnZ2537RlH2Soe6MKK8Cyi1G22lO9fGiw1e7UmyxbLvPUguyys1OvQAyRqQjLCXFaCPPzSX-SMeff2GRu42T7Wxp3AgXd3HJP'
    }
  ];

  seedUsers.forEach((user) => {
    run(
      `INSERT INTO users (id, name, email, password_hash, city, cep, address, interests_json, avatar, rating, donations, received, carbon_saved_percent, achievements_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.name,
        user.email,
        passwordHash(user.password),
        user.city,
        '',
        '',
        JSON.stringify(user.interests),
        user.avatar,
        user.rating || 4.8,
        user.donations || 0,
        user.received || 0,
        user.carbonSavedPercent || 0,
        JSON.stringify(user.achievements || [])
      ]
    );
  });

  const seedPosts = [
    {
      id: 'post-ana-notebook',
      authorId: 'user-ana',
      title: 'Notebook antigo para reaproveitamento',
      description: 'Notebook antigo que não utilizo mais. A tela funciona perfeitamente, mas o teclado precisa de reparos. Ideal para retirada de peças ou conserto simples.',
      category: 'Eletrônicos',
      condition: 'Para conserto',
      goal: 'Doação',
      imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAKZQEUXdT_Hr8jvwzGd8COIr3aOEpoPNRH21AJJW4XMCNqGnogNVe9-K0-oB040C5TRFGW7GZGwe0dbIs7xbzj6IPATaOF0vnOVAv8brlal2teQzm4N7Fts1tX2Yvq6JVnFLAUWiO6RhqAu4yMu54WGVKd-YLj60bm8VrXFYYYO3FWUXRaqv-7aCS5qjpK16baewAO3F_-Ki-FcKBj1e3T-I2h71ynhClmOOnF84mKiBYOL44WA3Nq',
      likes: 12,
      comments: 3,
      location: 'Santarém - PA',
      createdAt: '2026-08-26T10:42:00.000Z',
      chipIcon: 'devices',
      chipLabel: 'Para doação'
    },
    {
      id: 'post-carlos-chair',
      authorId: 'user-carlos',
      title: 'Cadeira de madeira maciça',
      description: 'Cadeira clássica de madeira, muito resistente. Possui algumas marcas de uso no verniz, mas a estrutura está intacta. Aceito troca por vasos de plantas grandes.',
      category: 'Móveis',
      condition: 'Bom estado',
      goal: 'Troca',
      imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCCiNbwxhEqOsxltDg6QfXsEHO8XzDAHo_3NNioJ8RRnN_TQ7rfWmKLWERa_BVBD1aF08AKQyd92tK3Jo1WrQzglnnm8EazHq65-0oDfEnYYBaPWh7y-1uLgTbE6WdYsWz7fvSZdWlJ24avEsZ3kiInD7j2-YNyJnlXDgl2DW6syKLZUCzF2MjthNP-GmWiicU3JNfZRBdnGSVVbvWhX6h66fnM9luYqcxJOLKLF0fL6jA6a2jHFdwn',
      likes: 24,
      comments: 8,
      location: 'Belém - PA',
      createdAt: '2026-08-25T09:15:00.000Z',
      chipIcon: 'chair',
      chipLabel: 'Troca'
    }
  ];

  seedPosts.forEach((post) => {
    run(
      `INSERT INTO posts (id, author_id, title, description, category, condition, goal, image_url, likes, comments, location, created_at, chip_icon, chip_label)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        post.id,
        post.authorId,
        post.title,
        post.description,
        post.category,
        post.condition,
        post.goal,
        post.imageUrl,
        post.likes,
        post.comments,
        post.location,
        post.createdAt,
        post.chipIcon,
        post.chipLabel
      ]
    );
  });

  const seedThreads = [
    {
      id: 'thread-ana-notebook',
      postId: 'post-ana-notebook',
      participants: ['user-mariana', 'user-ana'],
      unreadCount: 2,
      lastMessageAt: '2026-08-26T10:45:00.000Z',
      messages: [
        { id: 'msg-1', senderId: 'user-mariana', text: 'Olá! Tenho interesse nesse aparelho. Ainda está disponível?', sentAt: '2026-08-26T10:42:00.000Z', status: 'read' },
        { id: 'msg-2', senderId: 'user-ana', text: 'Sim, ainda está disponível.', sentAt: '2026-08-26T10:45:00.000Z', status: 'read' },
        { id: 'msg-3', senderId: 'user-ana', text: 'Pode retirar comigo em um ponto público?', sentAt: '2026-08-26T10:45:00.000Z', status: 'read' }
      ]
    },
    {
      id: 'thread-carlos-chair',
      postId: 'post-carlos-chair',
      participants: ['user-mariana', 'user-carlos'],
      unreadCount: 0,
      lastMessageAt: '2026-08-25T18:20:00.000Z',
      messages: [
        { id: 'msg-4', senderId: 'user-carlos', text: 'Pode retirar comigo.', sentAt: '2026-08-25T18:10:00.000Z', status: 'read' },
        { id: 'msg-5', senderId: 'user-mariana', text: 'Obrigado pela oferta! Vou confirmar o horário.', sentAt: '2026-08-25T18:20:00.000Z', status: 'read' }
      ]
    }
  ];

  seedThreads.forEach((thread) => {
    run(
      `INSERT INTO threads (id, post_id, participants_json, unread_count, last_message_at)
       VALUES (?, ?, ?, ?, ?)`,
      [thread.id, thread.postId, JSON.stringify(thread.participants), thread.unreadCount, thread.lastMessageAt]
    );

    thread.messages.forEach((message) => {
      run(
        `INSERT INTO messages (id, thread_id, sender_id, text, sent_at, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [message.id, thread.id, message.senderId, message.text, message.sentAt, message.status]
      );
    });
  });

  const seedPoints = [
    { id: 'point-1', name: 'EcoCentro Santarém', categories: ['Eletrônicos', 'plástico', 'metal'], hours: '08:00 – 17:00', location: 'Santarém, Pará, Brasil', status: 'Aberto' },
    { id: 'point-2', name: 'Central Recicla Belém', categories: ['Pilhas', 'óleo', 'Cooperativas'], hours: '09:00 – 18:00', location: 'Belém, Pará, Brasil', status: 'Aberto' }
  ];

  seedPoints.forEach((point) => {
    run(
      `INSERT INTO collection_points (id, name, categories_json, hours, location, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [point.id, point.name, JSON.stringify(point.categories), point.hours, point.location, point.status]
    );
  });

  if (adminEmail) {
    run('UPDATE users SET role = ? WHERE lower(email) = lower(?)', ['admin', adminEmail]);
  }

  persistDb();
}

function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = get('SELECT * FROM users WHERE id = ?', [payload.sub]);
    if (user && !user.suspended) req.user = userFromRow(user);
  } catch {
    // Public routes continue to work without a valid optional session.
  }
  return next();
}

function approximateLocation(value) {
  const parts = String(value || '').split(',').map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts.slice(-2).join(', ') : parts[0] || '';
}

function usersAreBlocked(firstUserId, secondUserId) {
  return Boolean(get(
    'SELECT blocker_id FROM blocked_users WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)',
    [firstUserId, secondUserId, secondUserId, firstUserId]
  ));
}

function impactForUser(userId) {
  const completed = all(
    `SELECT negotiations.*, posts.goal
     FROM negotiations JOIN posts ON posts.id = negotiations.post_id
     WHERE negotiations.status = 'completed' AND (negotiations.owner_id = ? OR negotiations.interested_id = ?)`,
    [userId, userId]
  );
  const donated = completed.filter((item) => item.owner_id === userId && item.goal === 'Doação').length;
  const received = completed.filter((item) => item.interested_id === userId && item.goal === 'Doação').length;
  const exchanges = completed.filter((item) => item.goal === 'Troca').length;
  const beneficiaries = new Set(completed.map((item) => item.owner_id === userId ? item.interested_id : item.owner_id)).size;
  const published = get('SELECT COUNT(*) AS count FROM posts WHERE author_id = ?', [userId])?.count || 0;
  return {
    itemsReused: completed.length,
    itemsDonated: donated,
    itemsReceived: received,
    exchanges,
    beneficiaries,
    publications: published,
    recycledMaterials: 0,
    divertedFromDisposal: completed.length,
    estimated: true
  };
}

function refreshUserMetrics(userId) {
  const impact = impactForUser(userId);
  const achievements = [];
  if (impact.publications >= 1) achievements.push('Primeiro Desapego');
  if (impact.itemsReused >= 5) achievements.push('Reutilizador');
  if (impact.itemsReused >= 10) achievements.push('Economia Circular');
  if ((get('SELECT COUNT(*) AS count FROM inspiration_products WHERE creator_id = ?', [userId])?.count || 0) >= 5) achievements.push('Criador Sustentável');
  if ((get("SELECT COUNT(*) AS count FROM collection_point_suggestions WHERE user_id = ? AND status = 'approved'", [userId])?.count || 0) >= 1) achievements.push('Colaborador');
  run('UPDATE users SET donations = ?, received = ?, carbon_saved_percent = ?, achievements_json = ? WHERE id = ?', [impact.itemsDonated, impact.itemsReceived, impact.itemsReused, JSON.stringify(achievements), userId]);
  return impact;
}

function communityImpact() {
  const completed = get("SELECT COUNT(*) AS count FROM negotiations WHERE status = 'completed'")?.count || 0;
  const exchanges = get("SELECT COUNT(*) AS count FROM negotiations JOIN posts ON posts.id = negotiations.post_id WHERE negotiations.status = 'completed' AND posts.goal = 'Troca'")?.count || 0;
  const beneficiaries = get("SELECT COUNT(DISTINCT interested_id) AS count FROM negotiations WHERE status = 'completed'")?.count || 0;
  return { itemsReused: completed, divertedFromDisposal: completed, exchanges, beneficiaries, estimated: true };
}

function routeForPath(pathname) {
  return ROUTE_FILES[pathname] || null;
}

function renderScreenFile(routePath) {
  const filePath = routeForPath(routePath);
  if (!filePath) {
    return null;
  }

  const absolutePath = path.join(ROOT, filePath);
  let html = fs.readFileSync(absolutePath, 'utf8');

  html = html.replace(/\{\{DATA:SCREEN:SCREEN_(\d+)\}\}/g, (_, screenNumber) => SCREEN_ROUTES[`SCREEN_${screenNumber}`] || '/feed');
  html = html.replace(/SCREEN_(\d+)\.html/g, (_, screenNumber) => SCREEN_ROUTES[`SCREEN_${screenNumber}`] || '/feed');

  if (html.includes('</body>')) {
    html = html.replace(/<\/body>/i, `<script>window.__REUSA_ROUTE__=${JSON.stringify(routePath)};window.__REUSA_ROUTES__=${JSON.stringify(SCREEN_ROUTES)};window.__REUSA_API__='/api';</script><script src="/assets/app.js" defer></script></body>`);
  }

  return html;
}

function buildExists() {
  return fs.existsSync(path.join(DIST_DIR, 'index.html'));
}

async function start() {
  if (!hasConfiguredJwtSecret) {
    console.warn('JWT_SECRET is not configured. A temporary secret was generated; sessions will end after a restart.');
  }

  ensureDir(DATA_DIR);
  ensureDir(PUBLIC_DIR);
  ensureDir(UPLOAD_DIR);

  const SQL = await initSqlJs({
    locateFile: (file) => path.join(ROOT, 'node_modules', 'sql.js', 'dist', file)
  });

  const bytes = loadDbBytes();
  db = bytes ? new SQL.Database(bytes) : new SQL.Database();
  seedDatabase();

  const uploadStorage = multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, UPLOAD_DIR),
    filename: (_req, file, callback) => {
      const ext = IMAGE_EXTENSIONS.get(file.mimetype) || '.img';
      callback(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
    }
  });

  const upload = multer({
    storage: uploadStorage,
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, callback) => {
      if (IMAGE_EXTENSIONS.has(file.mimetype)) {
        return callback(null, true);
      }
      return callback(new Error('Only JPEG, PNG, GIF, WebP or AVIF images are allowed'));
    }
  });

  const authRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 30 });

  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use('/assets', express.static(PUBLIC_DIR));
  app.use('/uploads', express.static(UPLOAD_DIR));

  if (buildExists()) {
    app.use(express.static(DIST_DIR));
  }

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.get('/api/auth/me', authMiddleware, (req, res) => {
    res.json({ user: req.user });
  });

  app.post('/api/auth/register', authRateLimit, (req, res) => {
    const { name, email, password, city, cep = '', address = '', interests = [] } = req.body || {};
    const normalizedName = String(name || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedPassword = String(password || '');
    const normalizedCity = String(city || '').trim();

    if (!normalizedName || !normalizedEmail || !normalizedPassword || !normalizedCity) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (normalizedName.length > 80 || normalizedCity.length > 100 || String(cep).length > 16 || String(address).length > 200) {
      return res.status(400).json({ error: 'One or more fields exceed the allowed length' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    if (normalizedPassword.length < 8) {
      return res.status(400).json({ error: 'Password must contain at least 8 characters' });
    }

    const existingUser = get('SELECT id FROM users WHERE lower(email) = lower(?)', [normalizedEmail]);
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const user = {
      id: uid('user'),
      name: normalizedName,
      email: normalizedEmail,
      passwordHash: passwordHash(normalizedPassword),
      city: normalizedCity,
      cep: String(cep).trim(),
      address: String(address).trim(),
      interests: Array.isArray(interests) ? interests : [interests].filter(Boolean),
      avatar: '',
      rating: 0,
      donations: 0,
      received: 0,
      carbonSavedPercent: 0,
      achievements: ['Novo membro']
    };

    run(
      `INSERT INTO users (id, name, email, password_hash, city, cep, address, interests_json, avatar, rating, donations, received, carbon_saved_percent, achievements_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.name,
        user.email,
        user.passwordHash,
        user.city,
        user.cep,
        user.address,
        JSON.stringify(user.interests),
        user.avatar,
        user.rating,
        user.donations,
        user.received,
        user.carbonSavedPercent,
        JSON.stringify(user.achievements)
      ]
    );
    run('UPDATE users SET last_active_at = ?, created_at = ? WHERE id = ?', [new Date().toISOString(), new Date().toISOString(), user.id]);
    persistDb();

    return res.status(201).json({ token: createToken(user.id), user: { ...user, passwordHash: undefined } });
  });

  app.post('/api/auth/login', authRateLimit, (req, res) => {
    const { email, password } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedPassword = String(password || '');

    if (!normalizedEmail || !normalizedPassword) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = get('SELECT * FROM users WHERE lower(email) = lower(?) LIMIT 1', [normalizedEmail]);
    if (!user || !verifyPassword(normalizedPassword, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const normalized = userFromRow(user);
    run('UPDATE users SET last_active_at = ? WHERE id = ?', [new Date().toISOString(), normalized.id]);
    persistDb();
    return res.json({ token: createToken(normalized.id), user: normalized });
  });

  app.get('/api/feed', optionalAuth, (req, res) => {
    const rows = all('SELECT * FROM posts ORDER BY created_at DESC');
    res.json({ posts: rows.map((row) => publicPost(row, req.user?.id)) });
  });

  app.get('/api/inspirations', (_req, res) => {
    const featured = [
      { id: 'inspiration-1', title: 'Luminária de garrafas', creator: 'Ateliê Recomeço', material: 'Garrafas de vidro', price: 'R$ 89,90', city: 'Santarém, PA', imageUrl: 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&w=900&q=80', description: 'Peças únicas feitas com garrafas reaproveitadas e iluminação LED.' },
      { id: 'inspiration-2', title: 'Banco de pallet', creator: 'Carlos Eduardo', material: 'Madeira de pallet', price: 'R$ 160,00', city: 'Belém, PA', imageUrl: 'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8?auto=format&fit=crop&w=900&q=80', description: 'Banco resistente com acabamento à base de água e madeira recuperada.' },
      { id: 'inspiration-3', title: 'Bolsa de banner', creator: 'Costura Circular', material: 'Banners vinílicos', price: 'R$ 54,00', city: 'Manaus, AM', imageUrl: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=80', description: 'Bolsas duráveis produzidas a partir de banners que seriam descartados.' },
      { id: 'inspiration-4', title: 'Cachepô de lata', creator: 'Maria Silva', material: 'Latas de alumínio', price: 'R$ 32,00', city: 'Santarém, PA', imageUrl: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=900&q=80', description: 'Cachepôs pintados à mão para dar vida nova às latas.' }
    ];
    const community = all('SELECT * FROM inspiration_products ORDER BY created_at DESC').map((product) => ({ id: product.id, title: product.title, creator: get('SELECT name FROM users WHERE id = ?', [product.creator_id])?.name || 'Criador Reusa+', material: product.material, price: product.price, city: product.city, imageUrl: product.image_url, description: product.description }));
    res.json({ products: [...community, ...featured] });
  });

  app.post('/api/inspirations', authMiddleware, (req, res) => {
    const { title, material, price, description, imageUrl } = req.body || {};
    const normalizedTitle = String(title || '').trim();
    const normalizedMaterial = String(material || '').trim();
    const normalizedPrice = String(price || '').trim();
    const normalizedDescription = String(description || '').trim();
    if (!normalizedTitle || !normalizedMaterial || !normalizedPrice || !normalizedDescription) return res.status(400).json({ error: 'Title, material, price and description are required' });
    if (normalizedTitle.length > 120 || normalizedMaterial.length > 120 || normalizedPrice.length > 40 || normalizedDescription.length > 2000) return res.status(400).json({ error: 'One or more fields exceed the allowed length' });
    const product = { id: uid('inspiration'), creator_id: req.user.id, title: normalizedTitle, material: normalizedMaterial, price: normalizedPrice, city: req.user.city, image_url: safeImageUrl(imageUrl, 'https://images.unsplash.com/photo-1528698827591-e19ccd7bc23d?auto=format&fit=crop&w=900&q=80'), description: normalizedDescription, created_at: new Date().toISOString() };
    run('INSERT INTO inspiration_products (id, creator_id, title, material, price, city, image_url, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', Object.values(product));
    persistDb();
    res.status(201).json({ product });
  });

  app.post('/api/ai/ideas', authMiddleware, (req, res) => {
    const prompt = String(req.body?.material || req.body?.prompt || '').trim();
    const quantity = String(req.body?.quantity || '').trim();
    const objective = String(req.body?.objective || '').trim();
    const difficulty = String(req.body?.difficulty || 'Fácil').trim();
    if (!prompt) return res.status(400).json({ error: 'Describe what you have available' });
    if (prompt.length > 1000) return res.status(400).json({ error: 'Prompt must contain at most 1000 characters' });
    if (quantity.length > 120 || objective.length > 300 || !['Fácil', 'Média', 'Avançada'].includes(difficulty)) return res.status(400).json({ error: 'Invalid idea preferences' });
    const text = prompt.toLowerCase();
    let idea;
    if (text.includes('garrafa') || text.includes('vidro')) {
      idea = { title: 'Luminária ou vaso de vidro', summary: 'Transforme garrafas limpas em uma peça decorativa útil.', materials: ['Garrafa de vidro', 'Lixa fina', 'Barbante ou tinta à base de água', 'Luz LED ou terra e muda'], steps: ['Lave e remova o rótulo com cuidado.', 'Lixe bordas cortadas ou mantenha a garrafa inteira.', 'Decore com materiais reaproveitados.', 'Teste a peça longe de calor e umidade excessiva.'], time: '30 a 60 minutos', care: 'Use luvas e nunca coloque vela de chama aberta dentro do vidro.' };
    } else if (text.includes('pallet') || text.includes('madeira')) {
      idea = { title: 'Prateleira ou banco de madeira', summary: 'Dê uma nova função à madeira com acabamento simples.', materials: ['Madeira reaproveitada', 'Lixa', 'Parafusos', 'Selador ou tinta à base de água'], steps: ['Verifique se a madeira está seca e sem pregos expostos.', 'Lixe até remover farpas.', 'Monte a estrutura e reforce as junções.', 'Aplique acabamento e aguarde a secagem completa.'], time: '2 a 4 horas', care: 'Use máscara ao lixar e confirme a resistência antes de sentar ou fixar na parede.' };
    } else if (text.includes('lata') || text.includes('alumínio') || text.includes('aluminio')) {
      idea = { title: 'Horta vertical em latas', summary: 'Converta latas em vasos para temperos e pequenas plantas.', materials: ['Latas limpas', 'Prego e martelo', 'Tinta', 'Terra e mudas'], steps: ['Lave as latas e remova rebarbas.', 'Faça furos de drenagem no fundo.', 'Pinte por fora e espere secar.', 'Plante mudas de pequeno porte.'], time: '45 a 90 minutos', care: 'Proteja as bordas cortantes e mantenha os furos livres para não acumular água.' };
    } else {
      idea = { title: 'Organizador modular reutilizado', summary: 'Comece com caixas, potes ou embalagens firmes e crie um organizador para sua rotina.', materials: ['Embalagens limpas e resistentes', 'Cola ou fita forte', 'Tesoura', 'Papel, tecido ou tinta para acabamento'], steps: ['Separe embalagens por tamanho e função.', 'Lave, seque e remova partes cortantes.', 'Monte os módulos antes de colar.', 'Personalize e identifique cada compartimento.'], time: '30 a 90 minutos', care: 'Não reutilize embalagens que armazenaram produtos tóxicos ou ficaram contaminadas.' };
    }
    res.json({ prompt, quantity, objective, idea: { ...idea, difficulty, reuse: idea.summary } });
  });

  app.get('/api/posts/:id', optionalAuth, (req, res) => {
    const row = get('SELECT * FROM posts WHERE id = ?', [req.params.id]);
    if (!row) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (req.user && req.user.id !== row.author_id && !get('SELECT post_id FROM post_views WHERE post_id = ? AND user_id = ?', [row.id, req.user.id])) {
      run('INSERT INTO post_views (post_id, user_id, viewed_at) VALUES (?, ?, ?)', [row.id, req.user.id, new Date().toISOString()]);
      run('UPDATE posts SET views = views + 1 WHERE id = ?', [row.id]);
      persistDb();
    }
    return res.json({ post: publicPost(get('SELECT * FROM posts WHERE id = ?', [row.id]), req.user?.id) });
  });

  app.get('/api/favorites', authMiddleware, (req, res) => {
    const rows = all('SELECT posts.* FROM favorites JOIN posts ON posts.id = favorites.post_id WHERE favorites.user_id = ? ORDER BY favorites.created_at DESC', [req.user.id]);
    res.json({ posts: rows.map((row) => publicPost(row, req.user.id)) });
  });

  app.post('/api/posts/:id/favorite', authMiddleware, (req, res) => {
    const post = get('SELECT id FROM posts WHERE id = ?', [req.params.id]);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const existing = get('SELECT post_id FROM favorites WHERE user_id = ? AND post_id = ?', [req.user.id, post.id]);
    if (existing) {
      run('DELETE FROM favorites WHERE user_id = ? AND post_id = ?', [req.user.id, post.id]);
    } else {
      run('INSERT INTO favorites (user_id, post_id, created_at) VALUES (?, ?, ?)', [req.user.id, post.id, new Date().toISOString()]);
    }
    persistDb();
    return res.json({ saved: !existing });
  });

  app.post('/api/posts/:id/like', authMiddleware, (req, res) => {
    const row = get('SELECT * FROM posts WHERE id = ?', [req.params.id]);
    if (!row) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const existingLike = get('SELECT post_id FROM post_likes WHERE post_id = ? AND user_id = ?', [req.params.id, req.user.id]);
    const now = new Date().toISOString();
    if (existingLike) {
      run('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?', [req.params.id, req.user.id]);
      run('UPDATE posts SET likes = MAX(likes - 1, 0) WHERE id = ?', [req.params.id]);
    } else {
      run('INSERT INTO post_likes (post_id, user_id, created_at) VALUES (?, ?, ?)', [req.params.id, req.user.id, now]);
      run('UPDATE posts SET likes = likes + 1 WHERE id = ?', [req.params.id]);
      if (row.author_id !== req.user.id) {
        run('INSERT INTO notifications (id, user_id, type, title, text, created_at) VALUES (?, ?, ?, ?, ?, ?)', [uid('notification'), row.author_id, 'like', 'Nova curtida', `${req.user.name} curtiu seu anúncio.`, now]);
      }
    }
    persistDb();
    const updated = get('SELECT likes FROM posts WHERE id = ?', [req.params.id]);
    return res.json({ likes: updated.likes, liked: !existingLike });
  });

  app.delete('/api/posts/:id', authMiddleware, (req, res) => {
    const post = get('SELECT author_id FROM posts WHERE id = ?', [req.params.id]);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.author_id !== req.user.id) return res.status(403).json({ error: 'You can only delete your own posts' });
    const threads = all('SELECT id FROM threads WHERE post_id = ?', [req.params.id]);
    threads.forEach((thread) => run('DELETE FROM messages WHERE thread_id = ?', [thread.id]));
    run('DELETE FROM threads WHERE post_id = ?', [req.params.id]);
    run('DELETE FROM comments WHERE post_id = ?', [req.params.id]);
    run('DELETE FROM post_likes WHERE post_id = ?', [req.params.id]);
    run('DELETE FROM favorites WHERE post_id = ?', [req.params.id]);
    run('DELETE FROM post_views WHERE post_id = ?', [req.params.id]);
    const negotiationIds = all('SELECT id FROM negotiations WHERE post_id = ?', [req.params.id]).map((item) => item.id);
    negotiationIds.forEach((id) => run('DELETE FROM reviews WHERE negotiation_id = ?', [id]));
    run('DELETE FROM negotiations WHERE post_id = ?', [req.params.id]);
    run('DELETE FROM reports WHERE target_type = ? AND target_id = ?', ['post', req.params.id]);
    run('DELETE FROM posts WHERE id = ?', [req.params.id]);
    persistDb();
    res.json({ ok: true });
  });

  app.put('/api/posts/:id', authMiddleware, upload.single('image'), (req, res) => {
    const post = get('SELECT * FROM posts WHERE id = ?', [req.params.id]);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.author_id !== req.user.id) return res.status(403).json({ error: 'You can only edit your own posts' });
    if (['Doado', 'Trocado', 'Encerrado'].includes(post.status)) return res.status(400).json({ error: 'Completed posts cannot be edited' });
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : post.title;
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : post.description;
    const category = typeof req.body?.category === 'string' ? req.body.category.trim() : post.category;
    const condition = typeof req.body?.condition === 'string' ? req.body.condition.trim() : post.condition;
    const goal = typeof req.body?.goal === 'string' ? req.body.goal.trim() : post.goal;
    const location = typeof req.body?.location === 'string' ? req.body.location.trim() : post.location;
    if (!title || !description || !category) return res.status(400).json({ error: 'Title, description and category are required' });
    if (title.length > 140 || description.length > 3000 || category.length > 60 || condition.length > 60 || goal.length > 40 || location.length > 160) return res.status(400).json({ error: 'One or more fields exceed the allowed length' });
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : post.image_url;
    const updatedAt = new Date().toISOString();
    run('UPDATE posts SET title = ?, description = ?, category = ?, condition = ?, goal = ?, location = ?, image_url = ?, updated_at = ? WHERE id = ?', [title, description, category, condition, goal, location, imageUrl, updatedAt, post.id]);
    persistDb();
    return res.json({ post: publicPost(get('SELECT * FROM posts WHERE id = ?', [post.id]), req.user.id) });
  });

  app.get('/api/posts/:id/interested', authMiddleware, (req, res) => {
    const post = get('SELECT * FROM posts WHERE id = ?', [req.params.id]);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.author_id !== req.user.id) return res.status(403).json({ error: 'Only the owner can view interested users' });
    const negotiations = all('SELECT * FROM negotiations WHERE post_id = ? ORDER BY created_at DESC', [post.id]).map((item) => {
      const user = get('SELECT id, name, city, avatar FROM users WHERE id = ?', [item.interested_id]);
      return { id: item.id, status: item.status, createdAt: item.created_at, threadId: item.thread_id, user: user ? { ...user, avatar: safeAvatar(user.avatar) } : null };
    });
    return res.json({ negotiations });
  });

  app.get('/api/posts/:id/negotiation', authMiddleware, (req, res) => {
    const post = get('SELECT id, author_id FROM posts WHERE id = ?', [req.params.id]);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const negotiation = get('SELECT * FROM negotiations WHERE post_id = ? AND (owner_id = ? OR interested_id = ?) ORDER BY updated_at DESC LIMIT 1', [post.id, req.user.id, req.user.id]);
    return res.json({ negotiation: negotiation ? { id: negotiation.id, status: negotiation.status, ownerId: negotiation.owner_id, interestedId: negotiation.interested_id, completedAt: negotiation.completed_at } : null });
  });

  app.post('/api/posts/:id/reserve', authMiddleware, (req, res) => {
    const post = get('SELECT * FROM posts WHERE id = ?', [req.params.id]);
    const interestedId = String(req.body?.interestedId || '');
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.author_id !== req.user.id) return res.status(403).json({ error: 'Only the owner can reserve this post' });
    if (!['Disponível', 'Reservado'].includes(post.status || 'Disponível')) return res.status(400).json({ error: 'This post is no longer available' });
    const negotiation = get('SELECT * FROM negotiations WHERE post_id = ? AND interested_id = ?', [post.id, interestedId]);
    if (!negotiation || negotiation.status === 'cancelled') return res.status(400).json({ error: 'Choose a user who demonstrated interest' });
    const now = new Date().toISOString();
    run("UPDATE negotiations SET status = 'interested', updated_at = ? WHERE post_id = ? AND status = 'reserved'", [now, post.id]);
    run("UPDATE negotiations SET status = 'reserved', updated_at = ? WHERE id = ?", [now, negotiation.id]);
    run("UPDATE posts SET status = 'Reservado', reserved_by = ?, updated_at = ? WHERE id = ?", [interestedId, now, post.id]);
    notification(interestedId, 'negotiation', 'Item reservado para você', `Você foi selecionado para ${post.title}.`, `/anuncios/${post.id}`);
    persistDb();
    return res.json({ post: publicPost(get('SELECT * FROM posts WHERE id = ?', [post.id]), req.user.id) });
  });

  app.post('/api/posts/:id/complete', authMiddleware, (req, res) => {
    const post = get('SELECT * FROM posts WHERE id = ?', [req.params.id]);
    const outcome = String(req.body?.outcome || '').trim();
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.author_id !== req.user.id) return res.status(403).json({ error: 'Only the owner can complete this post' });
    if (!post.reserved_by || post.status !== 'Reservado') return res.status(400).json({ error: 'Reserve the item before completing the negotiation' });
    if (!['Doado', 'Trocado'].includes(outcome)) return res.status(400).json({ error: 'Choose Doado or Trocado as the outcome' });
    const negotiation = get("SELECT * FROM negotiations WHERE post_id = ? AND interested_id = ? AND status = 'reserved'", [post.id, post.reserved_by]);
    if (!negotiation) return res.status(400).json({ error: 'Reserved negotiation not found' });
    const now = new Date().toISOString();
    run("UPDATE negotiations SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?", [now, now, negotiation.id]);
    run('UPDATE posts SET status = ?, completed_with = ?, completed_at = ?, updated_at = ? WHERE id = ?', [outcome, post.reserved_by, now, now, post.id]);
    refreshUserMetrics(post.author_id);
    refreshUserMetrics(post.reserved_by);
    notification(post.reserved_by, 'negotiation', 'Negociação concluída', `A negociação de ${post.title} foi concluída. Avalie a experiência.`, `/anuncios/${post.id}`);
    persistDb();
    return res.json({ post: publicPost(get('SELECT * FROM posts WHERE id = ?', [post.id]), req.user.id), negotiationId: negotiation.id });
  });

  app.patch('/api/posts/:id/status', authMiddleware, (req, res) => {
    const post = get('SELECT * FROM posts WHERE id = ?', [req.params.id]);
    const status = String(req.body?.status || '').trim();
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.author_id !== req.user.id) return res.status(403).json({ error: 'Only the owner can change this status' });
    if (!['Disponível', 'Encerrado'].includes(status)) return res.status(400).json({ error: 'Use the reservation or completion flow for this status' });
    const now = new Date().toISOString();
    run('UPDATE posts SET status = ?, reserved_by = CASE WHEN ? = ? THEN NULL ELSE reserved_by END, updated_at = ? WHERE id = ?', [status, status, 'Disponível', now, post.id]);
    if (status === 'Disponível') run("UPDATE negotiations SET status = 'interested', updated_at = ? WHERE post_id = ? AND status = 'reserved'", [now, post.id]);
    persistDb();
    return res.json({ post: publicPost(get('SELECT * FROM posts WHERE id = ?', [post.id]), req.user.id) });
  });

  app.post('/api/negotiations/:id/reviews', authMiddleware, (req, res) => {
    const negotiation = get('SELECT * FROM negotiations WHERE id = ?', [req.params.id]);
    const rating = Number(req.body?.rating);
    const comment = String(req.body?.comment || '').trim();
    if (!negotiation) return res.status(404).json({ error: 'Negotiation not found' });
    if (negotiation.status !== 'completed') return res.status(400).json({ error: 'Reviews are available after completion only' });
    if (![negotiation.owner_id, negotiation.interested_id].includes(req.user.id)) return res.status(403).json({ error: 'Only negotiation participants can review' });
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length > 500) return res.status(400).json({ error: 'Rating must be between 1 and 5 and comment up to 500 characters' });
    if (get('SELECT id FROM reviews WHERE negotiation_id = ? AND reviewer_id = ?', [negotiation.id, req.user.id])) return res.status(409).json({ error: 'You have already reviewed this negotiation' });
    const revieweeId = negotiation.owner_id === req.user.id ? negotiation.interested_id : negotiation.owner_id;
    const review = { id: uid('review'), negotiation_id: negotiation.id, reviewer_id: req.user.id, reviewee_id: revieweeId, rating, comment, created_at: new Date().toISOString() };
    run('INSERT INTO reviews (id, negotiation_id, reviewer_id, reviewee_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', Object.values(review));
    const aggregate = get('SELECT AVG(rating) AS average FROM reviews WHERE reviewee_id = ?', [revieweeId]);
    run('UPDATE users SET rating = ? WHERE id = ?', [Number(aggregate?.average || 0), revieweeId]);
    notification(revieweeId, 'review', 'Você recebeu uma avaliação', `${req.user.name} avaliou uma negociação com você.`, '/perfil');
    persistDb();
    return res.status(201).json({ review: { ...review, reviewerName: req.user.name } });
  });

  app.get('/api/users/:id/reviews', (req, res) => {
    const user = get('SELECT id, name FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const reviews = all('SELECT reviews.id, reviews.rating, reviews.comment, reviews.created_at, users.name AS reviewer_name FROM reviews JOIN users ON users.id = reviews.reviewer_id WHERE reviews.reviewee_id = ? ORDER BY reviews.created_at DESC LIMIT 50', [user.id]);
    const aggregate = get('SELECT ROUND(AVG(rating), 1) AS average, COUNT(*) AS count FROM reviews WHERE reviewee_id = ?', [user.id]);
    return res.json({ reputation: { rating: Number(aggregate?.average || 0), count: Number(aggregate?.count || 0) }, reviews: reviews.map((item) => ({ id: item.id, rating: item.rating, comment: item.comment, createdAt: item.created_at, reviewerName: item.reviewer_name })) });
  });

  app.post('/api/reports', authMiddleware, (req, res) => {
    const targetType = String(req.body?.targetType || '').trim();
    const targetId = String(req.body?.targetId || '').trim();
    const reason = String(req.body?.reason || '').trim();
    const details = String(req.body?.details || '').trim();
    const allowedTypes = ['post', 'comment', 'user', 'content'];
    const allowedReasons = ['Spam', 'Informação falsa', 'Conteúdo impróprio', 'Tentativa de golpe', 'Material proibido', 'Comportamento ofensivo', 'Outro'];
    if (!allowedTypes.includes(targetType) || !targetId || !allowedReasons.includes(reason) || details.length > 1000) return res.status(400).json({ error: 'Invalid report data' });
    if (get('SELECT id FROM reports WHERE reporter_id = ? AND target_type = ? AND target_id = ?', [req.user.id, targetType, targetId])) return res.status(409).json({ error: 'You have already reported this content' });
    run('INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [uid('report'), req.user.id, targetType, targetId, reason, details, 'pending', new Date().toISOString()]);
    persistDb();
    return res.status(201).json({ ok: true });
  });

  app.post('/api/users/:id/block', authMiddleware, (req, res) => {
    const blockedId = req.params.id;
    if (blockedId === req.user.id) return res.status(400).json({ error: 'You cannot block yourself' });
    if (!get('SELECT id FROM users WHERE id = ?', [blockedId])) return res.status(404).json({ error: 'User not found' });
    const existing = get('SELECT blocked_id FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?', [req.user.id, blockedId]);
    if (existing) run('DELETE FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?', [req.user.id, blockedId]);
    else run('INSERT INTO blocked_users (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)', [req.user.id, blockedId, new Date().toISOString()]);
    persistDb();
    return res.json({ blocked: !existing });
  });

  app.get('/api/posts/:id/comments', (_req, res) => {
    const post = get('SELECT id FROM posts WHERE id = ?', [_req.params.id]);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const comments = all('SELECT comments.id, comments.text, comments.created_at, users.name, users.avatar FROM comments JOIN users ON users.id = comments.author_id WHERE post_id = ? ORDER BY comments.created_at ASC', [_req.params.id]);
    res.json({ comments: comments.map((comment) => ({ ...comment, avatar: safeAvatar(comment.avatar) })) });
  });

  app.post('/api/posts/:id/comments', authMiddleware, (req, res) => {
    const text = String(req.body?.text || '').trim();
    const post = get('SELECT id FROM posts WHERE id = ?', [req.params.id]);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (!text || text.length > 500) return res.status(400).json({ error: 'Comment must have between 1 and 500 characters' });
    const comment = { id: uid('comment'), post_id: req.params.id, author_id: req.user.id, text, created_at: new Date().toISOString() };
    run('INSERT INTO comments (id, post_id, author_id, text, created_at) VALUES (?, ?, ?, ?, ?)', Object.values(comment));
    run('UPDATE posts SET comments = comments + 1 WHERE id = ?', [req.params.id]);
    const owner = get('SELECT author_id, title FROM posts WHERE id = ?', [req.params.id]);
    if (owner.author_id !== req.user.id) {
      run('INSERT INTO notifications (id, user_id, type, title, text, created_at) VALUES (?, ?, ?, ?, ?, ?)', [uid('notification'), owner.author_id, 'comment', 'Novo comentário', `${req.user.name} comentou em "${owner.title}".`, comment.created_at]);
    }
    persistDb();
    res.status(201).json({ comment: { ...comment, name: req.user.name, avatar: req.user.avatar }, comments: get('SELECT comments FROM posts WHERE id = ?', [req.params.id]).comments });
  });

  app.post('/api/posts', authMiddleware, upload.single('image'), (req, res) => {
    const { title, description, category, condition, goal, location, chipLabel, chipIcon } = req.body || {};
    const normalizedTitle = String(title || '').trim();
    const normalizedDescription = String(description || '').trim();
    const normalizedCategory = String(category || '').trim();

    if (!normalizedTitle || !normalizedDescription || !normalizedCategory) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (normalizedTitle.length > 140 || normalizedDescription.length > 3000 || normalizedCategory.length > 60) {
      return res.status(400).json({ error: 'One or more fields exceed the allowed length' });
    }

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : safeImageUrl(req.body.imageUrl, 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=1200&q=80');
    const createdAt = new Date().toISOString();
    const post = {
      id: uid('post'),
      author_id: req.user.id,
      title: normalizedTitle,
      description: normalizedDescription,
      category: normalizedCategory,
      condition: condition || 'Bom estado',
      goal: goal || 'Doação',
      image_url: imageUrl,
      likes: 0,
      comments: 0,
      location: location || req.user.city,
      created_at: createdAt,
      chip_icon: chipIcon || (goal === 'Troca' ? 'swap_horiz' : 'volunteer_activism'),
      chip_label: chipLabel || goal || 'Disponível'
    };

    run(
      `INSERT INTO posts (id, author_id, title, description, category, condition, goal, image_url, likes, comments, location, created_at, chip_icon, chip_label)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [post.id, post.author_id, post.title, post.description, post.category, post.condition, post.goal, post.image_url, post.likes, post.comments, post.location, post.created_at, post.chip_icon, post.chip_label]
    );

    const threadId = uid('thread');
    run(
      `INSERT INTO threads (id, post_id, participants_json, unread_count, last_message_at)
       VALUES (?, ?, ?, ?, ?)`,
      [threadId, post.id, JSON.stringify([req.user.id]), 0, createdAt]
    );

    persistDb();
    return res.status(201).json({ post: publicPost(get('SELECT * FROM posts WHERE id = ?', [post.id])) });
  });

  app.post('/api/messages/threads', authMiddleware, (req, res) => {
    const post = get('SELECT * FROM posts WHERE id = ?', [req.body?.postId]);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.author_id === req.user.id) return res.status(400).json({ error: 'You cannot contact yourself' });
    if ((post.status || 'Disponível') !== 'Disponível') return res.status(400).json({ error: 'This item is not available for new conversations' });
    if (usersAreBlocked(req.user.id, post.author_id)) return res.status(403).json({ error: 'A blocked user cannot start a conversation' });

    const rows = all('SELECT * FROM threads');
    const existing = rows.find((row) => {
      const participants = JSON.parse(row.participants_json || '[]');
      return row.post_id === post.id && participants.includes(req.user.id) && participants.includes(post.author_id);
    });
    if (existing) return res.json({ thread: threadSummary(existing, req.user.id) });

    const thread = { id: uid('thread'), post_id: post.id, participants_json: JSON.stringify([req.user.id, post.author_id]), unread_count: 0, last_message_at: new Date().toISOString() };
    run('INSERT INTO threads (id, post_id, participants_json, unread_count, last_message_at) VALUES (?, ?, ?, ?, ?)', [thread.id, thread.post_id, thread.participants_json, thread.unread_count, thread.last_message_at]);
    run("INSERT INTO negotiations (id, post_id, owner_id, interested_id, thread_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'interested', ?, ?)", [uid('negotiation'), post.id, post.author_id, req.user.id, thread.id, thread.last_message_at, thread.last_message_at]);
    notification(post.author_id, 'interest', 'Novo interessado', `${req.user.name} demonstrou interesse em "${post.title}".`, `/anuncios/${post.id}`);
    persistDb();
    return res.status(201).json({ thread: threadSummary(thread, req.user.id) });
  });

  app.get('/api/messages/threads', authMiddleware, (req, res) => {
    const rows = all('SELECT * FROM threads ORDER BY last_message_at DESC').filter((row) => JSON.parse(row.participants_json || '[]').includes(req.user.id));
    const threads = rows.map((row) => threadSummary(row, req.user.id));
    res.json({ threads });
  });

  app.get('/api/messages/threads/:id', authMiddleware, (req, res) => {
    const row = get('SELECT * FROM threads WHERE id = ?', [req.params.id]);
    if (!row) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    const participants = JSON.parse(row.participants_json || '[]');
    if (!participants.includes(req.user.id)) return res.status(403).json({ error: 'Thread access denied' });
    const messages = all('SELECT * FROM messages WHERE thread_id = ? ORDER BY sent_at ASC', [row.id]);
    res.json({ thread: row, participants: JSON.parse(row.participants_json || '[]'), messages });
  });

  app.post('/api/messages/threads/:id/messages', authMiddleware, (req, res) => {
    const { text } = req.body || {};
    const normalizedText = String(text || '').trim();
    if (!normalizedText) {
      return res.status(400).json({ error: 'Message text is required' });
    }
    if (normalizedText.length > 1000) return res.status(400).json({ error: 'Message must contain at most 1000 characters' });

    const thread = get('SELECT * FROM threads WHERE id = ?', [req.params.id]);
    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }
    if (!JSON.parse(thread.participants_json || '[]').includes(req.user.id)) {
      return res.status(403).json({ error: 'Thread access denied' });
    }
    const recipientId = JSON.parse(thread.participants_json || '[]').find((id) => id !== req.user.id);
    if (recipientId && usersAreBlocked(req.user.id, recipientId)) {
      return res.status(403).json({ error: 'You cannot message a blocked user' });
    }

    const sentAt = new Date().toISOString();
    const message = {
      id: uid('msg'),
      thread_id: thread.id,
      sender_id: req.user.id,
      text: normalizedText,
      sent_at: sentAt,
      status: 'sent'
    };

    run(
      `INSERT INTO messages (id, thread_id, sender_id, text, sent_at, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [message.id, message.thread_id, message.sender_id, message.text, message.sent_at, message.status]
    );
    run('UPDATE threads SET last_message_at = ? WHERE id = ?', [sentAt, thread.id]);
    if (recipientId) {
      notification(recipientId, 'message', 'Nova mensagem', `${req.user.name} enviou uma mensagem.`, `/mensagens/ana?thread=${thread.id}`);
    }
    persistDb();

    return res.status(201).json({ message });
  });

  app.get('/api/notifications', authMiddleware, (req, res) => {
    const notifications = all('SELECT id, type, title, text, link, created_at AS createdAt, read_at AS readAt FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [req.user.id]);
    res.json({ notifications, unreadCount: notifications.filter((notification) => !notification.readAt).length });
  });

  app.post('/api/notifications/read', authMiddleware, (req, res) => {
    run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', [new Date().toISOString(), req.user.id]);
    persistDb();
    res.json({ ok: true });
  });

  app.post('/api/notifications/:id/read', authMiddleware, (req, res) => {
    run('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL', [new Date().toISOString(), req.params.id, req.user.id]);
    persistDb();
    res.json({ ok: true });
  });

  app.get('/api/collection-points', (_req, res) => {
    const rows = all('SELECT * FROM collection_points ORDER BY name ASC');
    res.json({ collectionPoints: rows.map((row) => ({ id: row.id, name: row.name, categories: jsonArray(row.categories_json), hours: row.hours, location: row.location, status: row.status, origin: row.origin || 'ReUsa+', lastUpdated: row.last_updated || null, latitude: row.latitude, longitude: row.longitude, verified: (row.origin || '').includes('ReUsa') })) });
  });

  app.post('/api/collection-points/suggestions', authMiddleware, (req, res) => {
    const name = String(req.body?.name || '').trim();
    const location = String(req.body?.location || '').trim();
    const hours = String(req.body?.hours || '').trim();
    const categories = Array.isArray(req.body?.categories) ? req.body.categories.map((item) => String(item).trim()).filter(Boolean) : [];
    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);
    if (!name || !location || !categories.length || name.length > 120 || location.length > 200 || hours.length > 100 || categories.length > 12 || categories.some((item) => item.length > 40)) return res.status(400).json({ error: 'Provide a name, location and accepted materials' });
    const duplicate = get("SELECT id FROM collection_point_suggestions WHERE user_id = ? AND lower(name) = lower(?) AND lower(location) = lower(?) AND status = 'pending'", [req.user.id, name, location]);
    if (duplicate) return res.status(409).json({ error: 'You already suggested this collection point' });
    const suggestion = { id: uid('point-suggestion'), user_id: req.user.id, name, categories_json: JSON.stringify(categories), hours, location, latitude: Number.isFinite(latitude) ? latitude : null, longitude: Number.isFinite(longitude) ? longitude : null, status: 'pending', created_at: new Date().toISOString() };
    run('INSERT INTO collection_point_suggestions (id, user_id, name, categories_json, hours, location, latitude, longitude, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', Object.values(suggestion));
    persistDb();
    return res.status(201).json({ suggestion: { ...suggestion, categories } });
  });

  app.get('/api/collection-points/nearby', async (req, res) => {
    const city = String(req.query.city || '').trim();
    if (!city) return res.status(400).json({ error: 'City is required' });
    const cityName = city.split(',')[0].trim();
    const registered = all('SELECT * FROM collection_points WHERE lower(location) LIKE lower(?) ORDER BY name ASC', [`%${cityName}%`]).map((row) => ({ id: row.id, name: row.name, categories: jsonArray(row.categories_json), hours: row.hours, location: row.location, status: row.status, source: row.origin || 'Cadastrado no Reusa+', origin: row.origin || 'ReUsa+', lastUpdated: row.last_updated || null, latitude: row.latitude, longitude: row.longitude, verified: (row.origin || '').includes('ReUsa') }));
    try {
      const geocodeResponse = await fetchWithTimeout(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(city)}`, { headers: { 'User-Agent': 'ReusaPlus/1.0 contact@reusa.local' } });
      const places = await geocodeResponse.json();
      if (!places.length) return res.json({ city, source: 'Cadastrado no Reusa+', collectionPoints: registered });
      const latitude = Number(places[0].lat);
      const longitude = Number(places[0].lon);
      const query = `[out:json][timeout:10];(nwr["amenity"~"recycling|waste_transfer_station",i](around:15000,${latitude},${longitude});nwr["shop"="second_hand"](around:15000,${latitude},${longitude}););out center tags;`;
      const overpassResponse = await fetchWithTimeout('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'Content-Type': 'text/plain', 'User-Agent': 'ReusaPlus/1.0' }, body: query }, 12000);
      const overpass = await overpassResponse.json();
      const publicPoints = (overpass.elements || []).map((element) => {
        const tags = element.tags || {};
        const pointLatitude = element.lat || element.center?.lat;
        const pointLongitude = element.lon || element.center?.lon;
        return { id: `osm-${element.type}-${element.id}`, name: tags.name || 'Ponto de reciclagem', categories: [tags.recycling_type || (tags.shop === 'second_hand' ? 'Reutilização' : 'Reciclagem')], hours: tags.opening_hours || 'Horário não informado', location: [tags['addr:street'], tags['addr:housenumber'], tags['addr:city'] || cityName].filter(Boolean).join(', '), status: 'Encontrado no mapa', latitude: pointLatitude, longitude: pointLongitude, source: 'OpenStreetMap' };
      }).filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
      res.json({ city, center: [latitude, longitude], source: publicPoints.length ? 'OpenStreetMap' : 'Cadastrado no Reusa+', collectionPoints: [...publicPoints, ...registered] });
    } catch {
      res.json({ city, source: 'Cadastrado no Reusa+', collectionPoints: registered });
    }
  });

  app.get('/api/profile', authMiddleware, (req, res) => {
    const posts = all('SELECT * FROM posts WHERE author_id = ?', [req.user.id]);
    const impact = impactForUser(req.user.id);
    const reputation = get('SELECT ROUND(AVG(rating), 1) AS average, COUNT(*) AS count FROM reviews WHERE reviewee_id = ?', [req.user.id]);
    const reviews = all('SELECT reviews.id, reviews.rating, reviews.comment, reviews.created_at, users.name AS reviewer_name FROM reviews JOIN users ON users.id = reviews.reviewer_id WHERE reviews.reviewee_id = ? ORDER BY reviews.created_at DESC LIMIT 10', [req.user.id]);
    res.json({
      user: req.user,
      stats: {
        donations: impact.itemsDonated,
        received: impact.itemsReceived,
        rating: Number(reputation?.average || 0),
        carbonSavedPercent: req.user.carbonSavedPercent ?? 0
      },
      achievements: req.user.achievements || []
      , impact,
      reputation: { rating: Number(reputation?.average || 0), count: Number(reputation?.count || 0) },
      reviews: reviews.map((item) => ({ id: item.id, rating: item.rating, comment: item.comment, createdAt: item.created_at, reviewerName: item.reviewer_name })),
      posts: posts.map((post) => publicPost(post, req.user.id))
    });
  });

  app.get('/api/impact/community', (_req, res) => {
    res.json({ impact: communityImpact() });
  });

  app.put('/api/profile', authMiddleware, (req, res) => {
    const { name, city, cep, address, interests } = req.body || {};
    const nextName = typeof name === 'string' ? name.trim() || req.user.name : req.user.name;
    const nextCity = typeof city === 'string' ? city.trim() || req.user.city : req.user.city;
    const nextCep = typeof cep === 'string' ? cep.trim() : req.user.cep || '';
    const nextAddress = typeof address === 'string' ? address.trim() : req.user.address || '';
    const nextInterests = Array.isArray(interests) ? interests.map((item) => String(item).trim()).filter(Boolean) : req.user.interests;

    if (nextName.length > 80 || nextCity.length > 100 || nextCep.length > 16 || nextAddress.length > 200 || nextInterests.length > 20 || nextInterests.some((item) => item.length > 40)) {
      return res.status(400).json({ error: 'One or more fields exceed the allowed length' });
    }

    run('UPDATE users SET name = ?, city = ?, cep = ?, address = ?, interests_json = ? WHERE id = ?', [nextName, nextCity, nextCep, nextAddress, JSON.stringify(nextInterests), req.user.id]);
    persistDb();

    const updated = get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    return res.json({ user: userFromRow(updated) });
  });

  app.put('/api/profile/preferences', authMiddleware, (req, res) => {
    const preferences = Array.isArray(req.body?.preferences) ? req.body.preferences.map((item) => String(item)).filter((item) => ['Curtidas', 'Comentários', 'Interesse', 'Mensagens', 'Negociações', 'Avaliações', 'Sistema'].includes(item)) : [];
    run('UPDATE users SET notification_preferences_json = ? WHERE id = ?', [JSON.stringify([...new Set(preferences)]), req.user.id]);
    persistDb();
    return res.json({ preferences: [...new Set(preferences)] });
  });

  app.put('/api/profile/password', authMiddleware, (req, res) => {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    const user = get('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!user || !verifyPassword(currentPassword, user.password_hash)) return res.status(400).json({ error: 'Current password is incorrect' });
    if (newPassword.length < 8 || newPassword.length > 200) return res.status(400).json({ error: 'New password must contain between 8 and 200 characters' });
    run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash(newPassword), req.user.id]);
    persistDb();
    return res.json({ ok: true });
  });

  app.delete('/api/profile', authMiddleware, (req, res) => {
    const confirmation = String(req.body?.confirmation || '').trim();
    const password = String(req.body?.password || '');
    const user = get('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (confirmation !== 'EXCLUIR' || !user || !verifyPassword(password, user.password_hash)) return res.status(400).json({ error: 'Confirm deletion with EXCLUIR and your current password' });
    const ownedPosts = all('SELECT id FROM posts WHERE author_id = ?', [req.user.id]).map((post) => post.id);
    ownedPosts.forEach((postId) => {
      run('DELETE FROM favorites WHERE post_id = ?', [postId]);
      run('DELETE FROM post_views WHERE post_id = ?', [postId]);
      run('DELETE FROM post_likes WHERE post_id = ?', [postId]);
      run('DELETE FROM comments WHERE post_id = ?', [postId]);
      run('DELETE FROM reports WHERE target_type = ? AND target_id = ?', ['post', postId]);
      run('DELETE FROM negotiations WHERE post_id = ?', [postId]);
      run('DELETE FROM posts WHERE id = ?', [postId]);
    });
    run('DELETE FROM favorites WHERE user_id = ?', [req.user.id]);
    run('DELETE FROM post_views WHERE user_id = ?', [req.user.id]);
    run('DELETE FROM post_likes WHERE user_id = ?', [req.user.id]);
    run('DELETE FROM comments WHERE author_id = ?', [req.user.id]);
    run('DELETE FROM reviews WHERE reviewer_id = ? OR reviewee_id = ?', [req.user.id, req.user.id]);
    run('DELETE FROM reports WHERE reporter_id = ?', [req.user.id]);
    run('DELETE FROM blocked_users WHERE blocker_id = ? OR blocked_id = ?', [req.user.id, req.user.id]);
    run('DELETE FROM notifications WHERE user_id = ?', [req.user.id]);
    run('DELETE FROM collection_point_suggestions WHERE user_id = ?', [req.user.id]);
    run('DELETE FROM users WHERE id = ?', [req.user.id]);
    persistDb();
    return res.json({ ok: true });
  });

  app.get('/api/admin/dashboard', authMiddleware, adminMiddleware, (_req, res) => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const totalUsers = get('SELECT COUNT(*) AS count FROM users')?.count || 0;
    const activeUsers = get('SELECT COUNT(*) AS count FROM users WHERE suspended = 0 AND last_active_at >= ?', [since])?.count || 0;
    const totalPosts = get('SELECT COUNT(*) AS count FROM posts')?.count || 0;
    const activePosts = get("SELECT COUNT(*) AS count FROM posts WHERE status IN ('Disponível', 'Reservado')")?.count || 0;
    const donations = get("SELECT COUNT(*) AS count FROM posts WHERE status = 'Doado'")?.count || 0;
    const exchanges = get("SELECT COUNT(*) AS count FROM posts WHERE status = 'Trocado'")?.count || 0;
    const collectionPoints = get('SELECT COUNT(*) AS count FROM collection_points')?.count || 0;
    const reports = get("SELECT COUNT(*) AS count FROM reports WHERE status = 'pending'")?.count || 0;
    const newUsers = get('SELECT COUNT(*) AS count FROM users WHERE last_active_at >= ?', [since])?.count || 0;
    const categories = all('SELECT category, COUNT(*) AS count FROM posts GROUP BY category ORDER BY count DESC LIMIT 8');
    return res.json({ totals: { totalUsers, activeUsers, totalPosts, activePosts, donations, exchanges, collectionPoints, reports, newUsers }, categories, impact: communityImpact() });
  });

  app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
    const query = String(req.query.q || '').trim();
    const rows = query ? all('SELECT id, name, email, city, role, suspended, created_at, last_active_at FROM users WHERE name LIKE ? OR email LIKE ? ORDER BY name ASC LIMIT 100', [`%${query}%`, `%${query}%`]) : all('SELECT id, name, email, city, role, suspended, created_at, last_active_at FROM users ORDER BY name ASC LIMIT 100');
    return res.json({ users: rows.map((row) => ({ id: row.id, name: row.name, email: row.email, city: row.city, role: row.role || 'user', suspended: Boolean(row.suspended), createdAt: row.created_at || null, lastActiveAt: row.last_active_at || null })) });
  });

  app.patch('/api/admin/users/:id/suspension', authMiddleware, adminMiddleware, (req, res) => {
    const suspended = Boolean(req.body?.suspended);
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot suspend your own account' });
    const user = get('SELECT id FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    run('UPDATE users SET suspended = ? WHERE id = ?', [suspended ? 1 : 0, user.id]);
    persistDb();
    return res.json({ suspended });
  });

  app.get('/api/admin/posts', authMiddleware, adminMiddleware, (_req, res) => {
    const rows = all('SELECT * FROM posts ORDER BY created_at DESC LIMIT 200');
    return res.json({ posts: rows.map((row) => publicPost(row)) });
  });

  app.delete('/api/admin/posts/:id', authMiddleware, adminMiddleware, (req, res) => {
    const post = get('SELECT id FROM posts WHERE id = ?', [req.params.id]);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    run('DELETE FROM favorites WHERE post_id = ?', [post.id]);
    run('DELETE FROM post_views WHERE post_id = ?', [post.id]);
    run('DELETE FROM post_likes WHERE post_id = ?', [post.id]);
    run('DELETE FROM comments WHERE post_id = ?', [post.id]);
    const negotiationIds = all('SELECT id FROM negotiations WHERE post_id = ?', [post.id]).map((item) => item.id);
    negotiationIds.forEach((id) => run('DELETE FROM reviews WHERE negotiation_id = ?', [id]));
    run('DELETE FROM negotiations WHERE post_id = ?', [post.id]);
    run('DELETE FROM reports WHERE target_type = ? AND target_id = ?', ['post', post.id]);
    run('DELETE FROM posts WHERE id = ?', [post.id]);
    persistDb();
    return res.json({ ok: true });
  });

  app.get('/api/admin/reports', authMiddleware, adminMiddleware, (_req, res) => {
    const reports = all('SELECT reports.*, users.name AS reporter_name FROM reports JOIN users ON users.id = reports.reporter_id ORDER BY CASE reports.status WHEN \'pending\' THEN 0 ELSE 1 END, reports.created_at DESC LIMIT 200');
    return res.json({ reports: reports.map((item) => ({ id: item.id, targetType: item.target_type, targetId: item.target_id, reason: item.reason, details: item.details, status: item.status, createdAt: item.created_at, reporterName: item.reporter_name })) });
  });

  app.patch('/api/admin/reports/:id', authMiddleware, adminMiddleware, (req, res) => {
    const status = String(req.body?.status || '').trim();
    if (!['pending', 'reviewed', 'resolved', 'dismissed'].includes(status)) return res.status(400).json({ error: 'Invalid report status' });
    const report = get('SELECT id FROM reports WHERE id = ?', [req.params.id]);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    run('UPDATE reports SET status = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?', [status, new Date().toISOString(), req.user.id, report.id]);
    persistDb();
    return res.json({ ok: true });
  });

  app.get('/api/admin/collection-points', authMiddleware, adminMiddleware, (_req, res) => {
    const points = all('SELECT * FROM collection_points ORDER BY name ASC').map((row) => ({ id: row.id, name: row.name, categories: jsonArray(row.categories_json), hours: row.hours, location: row.location, status: row.status, origin: row.origin, lastUpdated: row.last_updated, latitude: row.latitude, longitude: row.longitude }));
    const suggestions = all('SELECT collection_point_suggestions.*, users.name AS user_name FROM collection_point_suggestions JOIN users ON users.id = collection_point_suggestions.user_id ORDER BY collection_point_suggestions.created_at DESC').map((row) => ({ id: row.id, name: row.name, categories: jsonArray(row.categories_json), hours: row.hours, location: row.location, status: row.status, createdAt: row.created_at, userName: row.user_name, latitude: row.latitude, longitude: row.longitude }));
    return res.json({ points, suggestions });
  });

  app.patch('/api/admin/collection-point-suggestions/:id', authMiddleware, adminMiddleware, (req, res) => {
    const decision = String(req.body?.decision || '').trim();
    if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'Invalid decision' });
    const suggestion = get('SELECT * FROM collection_point_suggestions WHERE id = ?', [req.params.id]);
    if (!suggestion || suggestion.status !== 'pending') return res.status(404).json({ error: 'Pending suggestion not found' });
    const now = new Date().toISOString();
    run('UPDATE collection_point_suggestions SET status = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?', [decision, now, req.user.id, suggestion.id]);
    if (decision === 'approved') {
      run('INSERT INTO collection_points (id, name, categories_json, hours, location, status, origin, last_updated, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [uid('point'), suggestion.name, suggestion.categories_json, suggestion.hours || 'Horário não informado', suggestion.location, 'Aberto', 'Comunidade ReUsa+', now, suggestion.latitude, suggestion.longitude]);
      refreshUserMetrics(suggestion.user_id);
      notification(suggestion.user_id, 'system', 'Ponto de coleta aprovado', `Sua sugestão ${suggestion.name} agora aparece no mapa.`, '/mapa');
    }
    persistDb();
    return res.json({ ok: true });
  });

  app.use((error, req, res, next) => {
    if (error?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }
    if (error instanceof multer.MulterError) {
      const message = error.code === 'LIMIT_FILE_SIZE' ? 'Image must be at most 5 MB' : 'Invalid upload';
      return res.status(400).json({ error: message });
    }
    if (error?.message === 'Only JPEG, PNG, GIF, WebP or AVIF images are allowed') {
      return res.status(400).json({ error: error.message });
    }
    if (req.path.startsWith('/api/')) {
      console.error(error);
      return res.status(500).json({ error: 'Internal server error' });
    }
    return next(error);
  });

  app.get('/', (_req, res) => res.redirect('/splash'));

  if (buildExists()) {
    app.use(express.static(DIST_DIR));
    app.get(/^\/(?!api|uploads|assets).*/, (_req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')));
  } else {
    Object.keys(ROUTE_FILES).forEach((routePath) => {
      app.get(routePath, (_req, res) => {
        const html = renderScreenFile(routePath);
        if (!html) {
          return res.status(404).send('Screen not found');
        }
        res.type('html').send(html);
      });
    });
  }

  app.listen(PORT, () => {
    console.log(`REUSA+ running at http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
