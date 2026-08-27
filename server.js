const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'reusa-plus-dev-secret';
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'state.json');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DIST_DIR = path.join(ROOT, 'dist');

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
  '/onboarding': 'onboarding_1_desapegue/code.html',
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

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(createDefaultState(), null, 2));
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function passwordHash(password) {
  return sha256(`reusa:${password}`);
}

function createDefaultState() {
  return {
    users: [
      {
        id: 'user-mariana',
        name: 'Mariana Silva',
        email: 'mariana@reusa.com',
        password: '12345678',
        city: 'Santarém, PA',
        interests: ['Eletrônicos', 'Livros', 'Móveis'],
        avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDfKn67wUHUzena6GPilhlMnfDTrX-AWCwJhpH14zxiCoejXVjCmxTucAueuPpn8n-U7rlurleOutdAv9CDYPpbq_d_piVERXOSL9LlJEldAYneOM-xWur8isWTqBuxA_ft7dzi7Timk6eUEJCDUm4nfvwZJ8jrPK8xrShXRX2SD8w4XW2jVbrB8or5gfnOPiF82d6nji601xBCm_Ngt9MkRuR_c4rTOstyZqS4B3TfM7ejEF6ZgsGV',
        rating: 4.8,
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
        avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAsueseVHwikfjZUPneZMx0rqtlGEAvV11CkF3ZlPKviIATzLTOhR-p7j1TYIeuMpJlGbMLawmQBHL60XAkrmqGp5wt-6D68qh_PsiHSJ2uhVyXDqdisWv0hZfQa58Vsnhew_Uvhh1Zqhvu6ZkmmlXBd9A2k_o_9WllEYGBTuKxQXdlrXCtW-yj3DPzIeS3OFZUVpbfTsEnzDWcO-IU5Ej2wAfYjCRbwv5EdJ3FDoH7F0kTWGkvJnB'
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
    ],
    posts: [
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
    ],
    threads: [
      {
        id: 'thread-ana-notebook',
        postId: 'post-ana-notebook',
        participants: ['user-mariana', 'user-ana'],
        messages: [
          { id: 'msg-1', senderId: 'user-mariana', text: 'Olá! Tenho interesse nesse aparelho. Ainda está disponível?', sentAt: '2026-08-26T10:42:00.000Z', status: 'read' },
          { id: 'msg-2', senderId: 'user-ana', text: 'Sim, ainda está disponível.', sentAt: '2026-08-26T10:45:00.000Z', status: 'read' },
          { id: 'msg-3', senderId: 'user-ana', text: 'Pode retirar comigo em um ponto público?', sentAt: '2026-08-26T10:45:00.000Z', status: 'read' }
        ],
        unreadCount: 2,
        lastMessageAt: '2026-08-26T10:45:00.000Z'
      },
      {
        id: 'thread-carlos-chair',
        postId: 'post-carlos-chair',
        participants: ['user-mariana', 'user-carlos'],
        messages: [
          { id: 'msg-4', senderId: 'user-carlos', text: 'Pode retirar comigo.', sentAt: '2026-08-25T18:10:00.000Z', status: 'read' },
          { id: 'msg-5', senderId: 'user-mariana', text: 'Obrigado pela oferta! Vou confirmar o horário.', sentAt: '2026-08-25T18:20:00.000Z', status: 'read' }
        ],
        unreadCount: 0,
        lastMessageAt: '2026-08-25T18:20:00.000Z'
      }
    ],
    collectionPoints: [
      { id: 'point-1', name: 'EcoCentro Santarém', categories: ['Eletrônicos', 'plástico', 'metal'], hours: '08:00 – 17:00', location: 'Santarém, Pará, Brasil', status: 'Aberto' },
      { id: 'point-2', name: 'Central Recicla Belém', categories: ['Pilhas', 'óleo', 'Cooperativas'], hours: '09:00 – 18:00', location: 'Belém, Pará, Brasil', status: 'Aberto' }
    ]
  };
}

function loadState() {
  ensureDataFile();
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const state = JSON.parse(raw);
  state.users = (state.users || []).map((user) => {
    if (!user.passwordHash) {
      const sourcePassword = user.password || '12345678';
      return { ...user, passwordHash: passwordHash(sourcePassword), password: undefined };
    }
    return user;
  });
  return state;
}

function saveState(state) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

function createToken(user) {
  return jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '7d' });
}

function getUserById(state, userId) {
  return state.users.find((user) => user.id === userId) || null;
}

function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  const { passwordHash, password, ...safeUser } = user;
  return safeUser;
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const state = loadState();
    const user = getUserById(state, payload.sub);

    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function publicPost(state, post) {
  const author = getUserById(state, post.authorId);
  return {
    ...post,
    author: author ? { id: author.id, name: author.name, city: author.city, avatar: author.avatar } : null
  };
}

function findThreadById(state, threadId) {
  return state.threads.find((thread) => thread.id === threadId) || null;
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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/assets', express.static(PUBLIC_DIR));

if (buildExists()) {
  app.use(express.static(DIST_DIR));
}

app.get('/', (_req, res) => res.redirect('/splash'));

if (buildExists()) {
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
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

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/auth/register', (req, res) => {
  const { name, email, password, city, interests = [] } = req.body || {};

  if (!name || !email || !password || !city) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const state = loadState();
  const existingUser = state.users.find((user) => user.email.toLowerCase() === String(email).toLowerCase());

  if (existingUser) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const user = {
    id: `user-${crypto.randomUUID()}`,
    name,
    email,
    passwordHash: passwordHash(password),
    city,
    interests: Array.isArray(interests) ? interests : [interests].filter(Boolean),
    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=00d67d&color=ffffff&bold=true`,
    rating: 4.8,
    donations: 0,
    received: 0,
    carbonSavedPercent: 0,
    achievements: ['Novo membro']
  };

  state.users.push(user);
  saveState(state);

  return res.status(201).json({ token: createToken(user), user: sanitizeUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const state = loadState();
  const user = state.users.find((entry) => entry.email.toLowerCase() === String(email).toLowerCase());

  if (!user || user.passwordHash !== passwordHash(password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  return res.json({ token: createToken(user), user: sanitizeUser(user) });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});

app.get('/api/feed', (_req, res) => {
  const state = loadState();
  res.json({ posts: state.posts.map((post) => publicPost(state, post)) });
});

app.get('/api/posts/:id', (req, res) => {
  const state = loadState();
  const post = state.posts.find((entry) => entry.id === req.params.id);

  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }

  res.json({ post: publicPost(state, post) });
});

app.post('/api/posts', authMiddleware, (req, res) => {
  const { title, description, category, condition, goal, location, imageUrl, chipLabel, chipIcon } = req.body || {};

  if (!title || !description || !category) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const state = loadState();
  const post = {
    id: `post-${crypto.randomUUID()}`,
    authorId: req.user.id,
    title,
    description,
    category,
    condition: condition || 'Bom estado',
    goal: goal || 'Doação',
    imageUrl: imageUrl || 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=1200&q=80',
    likes: 0,
    comments: 0,
    location: location || req.user.city,
    createdAt: new Date().toISOString(),
    chipLabel: chipLabel || goal || 'Disponível',
    chipIcon: chipIcon || 'devices'
  };

  state.posts.unshift(post);

  const createdThread = {
    id: `thread-${post.id}`,
    postId: post.id,
    participants: [req.user.id],
    messages: [],
    unreadCount: 0,
    lastMessageAt: post.createdAt
  };

  state.threads.unshift(createdThread);
  saveState(state);

  res.status(201).json({ post: publicPost(state, post) });
});

app.get('/api/messages/threads', authMiddleware, (req, res) => {
  const state = loadState();
  const threads = state.threads.map((thread) => {
    const otherParticipantId = thread.participants.find((participantId) => participantId !== req.user.id) || thread.participants[0];
    const otherUser = getUserById(state, otherParticipantId);
    const post = state.posts.find((entry) => entry.id === thread.postId);
    const lastMessage = thread.messages[thread.messages.length - 1] || null;

    return {
      id: thread.id,
      threadId: thread.id,
      unreadCount: thread.unreadCount,
      title: otherUser ? otherUser.name : 'Conversa',
      subtitle: lastMessage ? lastMessage.text : post ? post.title : 'Sem mensagens',
      time: lastMessage ? new Date(lastMessage.sentAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
      avatar: otherUser ? otherUser.avatar : null,
      route: '/mensagens/ana'
    };
  });

  res.json({ threads });
});

app.get('/api/messages/threads/:id', authMiddleware, (req, res) => {
  const state = loadState();
  const thread = findThreadById(state, req.params.id);

  if (!thread) {
    return res.status(404).json({ error: 'Thread not found' });
  }

  const participants = thread.participants.map((participantId) => sanitizeUser(getUserById(state, participantId)));
  res.json({ thread, participants });
});

app.post('/api/messages/threads/:id/messages', authMiddleware, (req, res) => {
  const { text } = req.body || {};

  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: 'Message text is required' });
  }

  const state = loadState();
  const thread = findThreadById(state, req.params.id);

  if (!thread) {
    return res.status(404).json({ error: 'Thread not found' });
  }

  const message = {
    id: `msg-${crypto.randomUUID()}`,
    senderId: req.user.id,
    text: String(text).trim(),
    sentAt: new Date().toISOString(),
    status: 'sent'
  };

  thread.messages.push(message);
  thread.lastMessageAt = message.sentAt;
  saveState(state);

  res.status(201).json({ message });
});

app.get('/api/collection-points', (_req, res) => {
  const state = loadState();
  res.json({ collectionPoints: state.collectionPoints });
});

app.get('/api/profile', authMiddleware, (req, res) => {
  const state = loadState();
  const user = sanitizeUser(req.user);
  const posts = state.posts.filter((post) => post.authorId === req.user.id);

  res.json({
    user,
    stats: {
      donations: req.user.donations || posts.length,
      received: req.user.received || 0,
      rating: req.user.rating || 4.8,
      carbonSavedPercent: req.user.carbonSavedPercent || 0
    },
    achievements: req.user.achievements || []
  });
});

app.put('/api/profile', authMiddleware, (req, res) => {
  const { name, city, interests } = req.body || {};
  const state = loadState();
  const index = state.users.findIndex((user) => user.id === req.user.id);

  if (index === -1) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (name) {
    state.users[index].name = name;
  }
  if (city) {
    state.users[index].city = city;
  }
  if (Array.isArray(interests)) {
    state.users[index].interests = interests;
  }

  saveState(state);
  res.json({ user: sanitizeUser(state.users[index]) });
});

app.listen(PORT, () => {
  ensureDataFile();
  console.log(`REUSA+ running at http://localhost:${PORT}`);
});