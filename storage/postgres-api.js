const { postExtras } = require('./community-api');
// 
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { isLikelyResidentialAddress } = require('./location-validation');
const { buildCollectionPointAddress, geocodeCollectionPoint } = require('./collection-point-geocoding');
const stripe = require('../services/stripe-payments');

const DONATION_GOAL = 'Doa\u00e7\u00e3o';
const SALE_GOAL = 'Venda';
const POST_GOALS = new Set([DONATION_GOAL, 'Troca', SALE_GOAL]);

function isValidEmailFormat(value) {
  const email = String(value || '').trim();
  if (email.length > 254 || email.includes('..')) return false;
  const match = email.match(/^([^@\s]+)@([^@\s]+)$/);
  if (!match) return false;
  const [, localPart, domain] = match;
  if (localPart.length > 64 || localPart.startsWith('.') || localPart.endsWith('.')) return false;
  const labels = domain.split('.');
  return labels.length >= 2
    && labels.every((label) => label.length >= 1 && label.length <= 63 && !label.startsWith('-') && !label.endsWith('-') && /^[a-zA-Z0-9-]+$/.test(label))
    && labels[labels.length - 1].length >= 2;
}

function id(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function json(value, fallback = []) {
  try {
    const parsed = JSON.parse(value || 'null');
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function parseMoneyToCents(value) {
  const normalized = String(value ?? '').trim().replace(/^R\$\s*/i, '').replace(/\./g, '').replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

async function requestedPostImages(db, postId, fallbackImage, imageOrder, files) {
  const existing = new Set((await db.many('SELECT image_url FROM post_images WHERE post_id=$1', [postId])).map((row) => row.image_url));
  if (fallbackImage) existing.add(fallbackImage);
  const uploaded = files || [];
  const order = Array.isArray(imageOrder) ? imageOrder : uploaded.map((_file, index) => `new:${index}`);
  const urls = order.map((entry) => {
    const token = String(entry || '');
    if (token.startsWith('existing:')) {
      const url = token.slice('existing:'.length);
      return existing.has(url) ? url : null;
    }
    if (token.startsWith('new:')) {
      const file = uploaded[Number(token.slice('new:'.length))];
      return file ? (file.location || `/uploads/${file.filename}`) : null;
    }
    return null;
  }).filter(Boolean);
  return urls.length <= 8 ? urls : null;
}

function userView(row) {
  if (!row) return null;
  return {
    id: row.id, name: row.name, email: row.email, city: row.city,
    emailVerified: row.email_verified !== false,
    neighborhood: row.neighborhood || '', cep: row.cep || '', address: row.address || '',
    accountType: row.account_type || 'person', businessName: row.business_name || '',
    cnpj: row.cnpj || '', interests: json(row.interests_json), avatar: row.avatar || '',
    rating: Number(row.rating || 0), donations: Number(row.donations || 0),
    received: Number(row.received || 0), carbonSavedPercent: Number(row.carbon_saved_percent || 0),
    achievements: json(row.achievements_json), role: row.role || 'user',
    suspended: Boolean(row.suspended), notificationPreferences: json(row.notification_preferences_json),
    stripeConnected: Boolean(row.stripe_account_id),
    stripeDemoMode: stripe.demoEnabled(),
    stripeTestMode: stripe.isTestEnvironment(),
    stripePixEnabled: stripe.configured() && process.env.STRIPE_PIX_ENABLED === 'true'
  };
}

function paymentView(payment) {
  return {
    id: payment.id,
    negotiationId: payment.negotiation_id,
    payerId: payment.payer_id,
    payeeId: payment.payee_id,
    amountCents: payment.amount_cents,
    currency: payment.currency,
    method: payment.method,
    status: payment.status,
    providerReference: payment.provider_reference,
    checkoutUrl: payment.checkout_url,
    failureCode: payment.failure_code,
    createdAt: payment.created_at,
    updatedAt: payment.updated_at,
    paidAt: payment.paid_at
  };
}

async function postView(db, row, viewerId) {
  const [author, interest, reputation, saved, liked, offer, images] = await Promise.all([
    db.one('SELECT id,name,city,neighborhood,account_type,business_name,avatar FROM users WHERE id=$1', [row.author_id]),
    db.one("SELECT COUNT(*)::int AS count FROM negotiations WHERE post_id=$1 AND status IN ('interested','reserved','completed')", [row.id]),
    db.one('SELECT COALESCE(ROUND(AVG(rating),1),0)::float AS average, COUNT(*)::int AS count FROM reviews WHERE reviewee_id=$1', [row.author_id]),
    viewerId ? db.one('SELECT 1 FROM favorites WHERE user_id=$1 AND post_id=$2', [viewerId, row.id]) : null,
    viewerId ? db.one('SELECT 1 FROM post_likes WHERE user_id=$1 AND post_id=$2', [viewerId, row.id]) : null,
    viewerId ? db.one('SELECT proposal_status,proposal_amount_cents,proposal_method FROM negotiations WHERE post_id=$1 AND interested_id=$2 ORDER BY updated_at DESC LIMIT 1', [row.id, viewerId]) : null,
    db.many('SELECT image_url FROM post_images WHERE post_id=$1 ORDER BY sort_order,created_at', [row.id])
  ]);
  return {
    transport: JSON.parse(row.transport_json || '{}'), hasApproximateLocation: row.area_lat != null && row.area_lng != null,
    id: row.id, authorId: row.author_id,
    author: author && { id: author.id, name: author.name, city: author.city, neighborhood: author.neighborhood || '', accountType: author.account_type, businessName: author.business_name || '', avatar: author.avatar || '' },
    title: row.title, description: row.description, category: row.category, condition: row.condition,
    goal: row.goal, imageUrl: row.image_url, imageUrls: images.length ? images.map((image) => image.image_url) : [row.image_url], likes: Number(row.likes), comments: Number(row.comments),
    location: row.location, createdAt: row.created_at, chipIcon: row.chip_icon, chipLabel: row.chip_label,
    status: row.status, views: Number(row.views || 0), interestedCount: Number(interest?.count || 0),
    saved: Boolean(saved), liked: Boolean(liked), updatedAt: row.updated_at || row.created_at,
    authorReputation: Number(reputation?.average || 0), authorReviewCount: Number(reputation?.count || 0),
    offerStatus: offer?.proposal_status || 'none',
    offerAmountCents: offer?.proposal_amount_cents || null,
    offerMethod: offer?.proposal_method || null
  };
}

function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(String(password), salt, 64).toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [algorithm, salt, digest] = String(stored || '').split('$');
  if (algorithm !== 'scrypt' || !salt || !digest) return false;
  const actual = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(digest, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
}

function registerPostgresRoutes(app, { db, jwtSecret, createToken, uid, publisher, upload, sendVerificationEmail, sendPasswordResetEmail, verificationToken, sha256, isConfiguredAdminEmail = () => false }) {
  const authenticate = async (req, res, next) => {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/, '');
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    try {
      const payload = jwt.verify(token, jwtSecret);
      const row = await db.one('SELECT * FROM users WHERE id=$1', [payload.sub]);
      if (!row) return res.status(401).json({ error: 'Invalid token' });
      if (row.suspended) return res.status(403).json({ error: 'This account is suspended' });
      req.user = userView(row);
      return next();
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
  const optional = async (req, _res, next) => {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/, '');
    if (token) {
      try {
        const payload = jwt.verify(token, jwtSecret);
        const row = await db.one('SELECT * FROM users WHERE id=$1 AND suspended=false', [payload.sub]);
        if (row) req.user = userView(row);
      } catch {
        // Public routes deliberately ignore invalid optional sessions.
      }
    }
    return next();
  };
  const emit = async (client, type, data, correlationId) => {
    const event = { id: id('event'), type, occurredAt: new Date().toISOString(), correlationId, data };
    await client.query('INSERT INTO event_outbox(id,type,payload_json,correlation_id,created_at) VALUES($1,$2,$3,$4,$5)', [event.id, type, JSON.stringify(data), correlationId || 'system', event.occurredAt]);
    return event;
  };

  app.post('/api/auth/register', async (req, res, next) => {
    try {
      const { name, email, password, city, neighborhood = '', cep = '', address = '', interests = [], accountType = 'person', businessName = '', cnpj = '' } = req.body || {};
      const normalizedName = String(name || '').trim();
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const normalizedPassword = String(password || '');
      const normalizedCity = String(city || '').trim();
      const normalizedAccountType = String(accountType || 'person').trim();
      const normalizedBusinessName = String(businessName || '').trim();
      const normalizedCnpj = String(cnpj || '').replace(/\D/g, '');
      if (!normalizedName || !normalizedEmail || !normalizedPassword || !normalizedCity) return res.status(400).json({ error: 'Informe nome, e-mail, senha e cidade para criar a conta.' });
      if (normalizedPassword.length < 8) return res.status(400).json({ error: 'A senha precisa ter pelo menos 8 caracteres.' });
      if (!isValidEmailFormat(normalizedEmail)) return res.status(400).json({ error: 'Informe um e-mail válido, como nome@gmail.com, nome@outlook.com ou outro domínio existente.' });
      const verification = verificationToken();
      const user = { id: id('user'), name: normalizedName, email: normalizedEmail, password_hash: passwordHash(normalizedPassword), city: normalizedCity, neighborhood: String(neighborhood).trim(), cep: String(cep).trim(), address: String(address).trim(), account_type: normalizedAccountType, business_name: normalizedBusinessName, cnpj: normalizedCnpj, interests_json: JSON.stringify(Array.isArray(interests) ? interests : []), avatar: '', achievements_json: JSON.stringify(['Novo membro']), email_verified: false, email_verification_token_hash: verification.hash, email_verification_expires_at: verification.expiresAt, created_at: new Date().toISOString(), last_active_at: new Date().toISOString() };
      const created = await db.transaction(async (client) => {
        if (await client.query('SELECT 1 FROM users WHERE lower(email)=lower($1)', [normalizedEmail]).then((r) => r.rowCount)) throw Object.assign(new Error('Este e-mail já está cadastrado.'), { status: 409 });
        await client.query(`INSERT INTO users (id,name,email,password_hash,city,neighborhood,cep,address,account_type,business_name,cnpj,interests_json,avatar,achievements_json,email_verified,email_verification_token_hash,email_verification_expires_at,created_at,last_active_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`, Object.values(user));
        return client.query('SELECT * FROM users WHERE id=$1', [user.id]).then((r) => r.rows[0]);
      });
      try {
        await sendVerificationEmail(created.email, created.name, verification.raw, `${req.protocol}://${req.get('host')}`);
      } catch (error) {
        const requestId = req.correlationId || id('request');
        console.error(`[registration-email-error] ${requestId}:`, error);
        return res.status(503).json({
          error: 'A conta foi criada, mas não foi possível enviar o e-mail de confirmação. Configure SMTP_HOST, SMTP_USER, SMTP_PASSWORD e EMAIL_FROM e solicite um novo envio.',
          requestId
        });
      }
      return res.status(201).json({ token: createToken(created.id), user: userView(created), verificationRequired: true });
    } catch (error) { return next(error); }
  });

  app.post('/api/auth/login', async (req, res, next) => {
    try {
      const row = await db.one('SELECT * FROM users WHERE lower(email)=lower($1)', [String(req.body?.email || '').trim()]);
      if (!row || !verifyPassword(req.body?.password, row.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
      if (row.email_verified === false) return res.status(403).json({ error: 'Confirme seu e-mail antes de entrar' });
      await db.query('UPDATE users SET last_active_at=now() WHERE id=$1', [row.id]);
      return res.json({ token: createToken(row.id), user: userView(row) });
    } catch (error) { return next(error); }
  });
  app.post('/api/auth/forgot-password', async (req, res, next) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const generic = { message: 'Se existir uma conta com este e-mail, enviaremos um link para redefinir a senha.' };
      if (!email || !isValidEmailFormat(email)) return res.json(generic);
      const user = await db.one('SELECT id,name,email FROM users WHERE lower(email)=lower($1)', [email]);
      if (!user) return res.json(generic);
      const rawToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await db.query('UPDATE users SET password_reset_token_hash=$1,password_reset_expires_at=$2 WHERE id=$3', [sha256(rawToken), expiresAt, user.id]);
      try {
        await sendPasswordResetEmail(user.email, user.name, rawToken, `${req.protocol}://${req.get('host')}`);
      } catch (error) {
        const requestId = req.correlationId || id('request');
        console.error(`[password-reset-email-error] ${requestId}:`, error);
        return res.status(503).json({ error: 'Não foi possível enviar o e-mail de redefinição. Tente novamente mais tarde.', requestId });
      }
      return res.json(generic);
    } catch (error) { return next(error); }
  });
  app.post('/api/auth/reset-password', async (req, res, next) => {
    try {
      const password = String(req.body?.password || '');
      if (password.length < 8) return res.status(400).json({ error: 'A senha precisa ter pelo menos 8 caracteres.' });
      const tokenHash = sha256(String(req.body?.token || ''));
      const user = await db.one('SELECT id FROM users WHERE password_reset_token_hash=$1 AND password_reset_expires_at>now()', [tokenHash]);
      if (!user) return res.status(400).json({ error: 'O link de redefinição é inválido ou expirou. Solicite um novo link.' });
      await db.query('UPDATE users SET password_hash=$1,email_verified=true,password_reset_token_hash=NULL,password_reset_expires_at=NULL WHERE id=$2', [passwordHash(password), user.id]);
      return res.json({ ok: true });
    } catch (error) { return next(error); }
  });
  app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: req.user }));
  app.get('/api/auth/verify-email', async (req, res, next) => {
    try {
      const tokenHash = sha256(String(req.query.token || ''));
      const user = await db.one('SELECT id,email FROM users WHERE email_verification_token_hash=$1 AND email_verification_expires_at > now()', [tokenHash]);
      if (!user) return res.status(400).send('Link de verificação inválido ou expirado. Solicite um novo link pelo aplicativo.');
      await db.query('UPDATE users SET email_verified=true,email_verification_token_hash=NULL,email_verification_expires_at=NULL WHERE id=$1', [user.id]);
      if (isConfiguredAdminEmail(user.email)) await db.query("UPDATE users SET role='admin' WHERE id=$1", [user.id]);
      return res.redirect('/login#email_verified=1');
    } catch (error) { return next(error); }
  });
  app.post('/api/auth/resend-verification', authenticate, async (req, res, next) => {
    try {
      const user = await db.one('SELECT * FROM users WHERE id=$1', [req.user.id]);
      if (user.email_verified) return res.json({ emailVerified: true });
      const verification = verificationToken();
      await db.query('UPDATE users SET email_verification_token_hash=$1,email_verification_expires_at=$2 WHERE id=$3', [verification.hash, verification.expiresAt, user.id]);
      await sendVerificationEmail(user.email, user.name, verification.raw, `${req.protocol}://${req.get('host')}`);
      return res.json({ emailVerified: false, emailDelivered: true });
    } catch (error) { return next(error); }
  });

  app.get('/api/feed', optional, async (req, res, next) => {
    try { const rows = await db.many("SELECT * FROM posts WHERE status <> 'Encerrado' ORDER BY created_at DESC"); return res.json({ posts: await Promise.all(rows.map((row) => postView(db, row, req.user?.id))) }); } catch (error) { return next(error); }
  });
  app.get('/api/posts/:id', optional, async (req, res, next) => {
    try {
      const row = await db.one('SELECT * FROM posts WHERE id=$1', [req.params.id]);
      if (!row) return res.status(404).json({ error: 'Post not found' });
      if (req.user && req.user.id !== row.author_id) await db.query('INSERT INTO post_views(post_id,user_id,viewed_at) VALUES($1,$2,now()) ON CONFLICT DO NOTHING', [row.id, req.user.id]);
      return res.json({ post: await postView(db, row, req.user?.id) });
    } catch (error) { return next(error); }
  });
  app.get('/api/favorites', authenticate, async (req, res, next) => {
    try { const rows = await db.many("SELECT p.* FROM favorites f JOIN posts p ON p.id=f.post_id WHERE f.user_id=$1 AND p.status <> 'Encerrado' ORDER BY f.created_at DESC", [req.user.id]); return res.json({ posts: await Promise.all(rows.map((row) => postView(db, row, req.user.id))) }); } catch (error) { return next(error); }
  });
  app.post('/api/posts/:id/favorite', authenticate, async (req, res, next) => {
    try { const exists = await db.one('SELECT 1 FROM favorites WHERE user_id=$1 AND post_id=$2', [req.user.id, req.params.id]); if (exists) await db.query('DELETE FROM favorites WHERE user_id=$1 AND post_id=$2', [req.user.id, req.params.id]); else await db.query('INSERT INTO favorites(user_id,post_id,created_at) VALUES($1,$2,now()) ON CONFLICT DO NOTHING', [req.user.id, req.params.id]); return res.json({ saved: !exists }); } catch (error) { return next(error); }
  });
  app.post('/api/posts/:id/like', authenticate, async (req, res, next) => {
    try {
      const result = await db.transaction(async (client) => {
        const exists = await client.query('SELECT 1 FROM post_likes WHERE user_id=$1 AND post_id=$2', [req.user.id, req.params.id]);
        if (exists.rowCount) await client.query('DELETE FROM post_likes WHERE user_id=$1 AND post_id=$2', [req.user.id, req.params.id]);
        else await client.query('INSERT INTO post_likes(post_id,user_id,created_at) VALUES($1,$2,now()) ON CONFLICT DO NOTHING', [req.params.id, req.user.id]);
        return client.query('UPDATE posts SET likes=GREATEST(likes + $1,0) WHERE id=$2 RETURNING likes', [exists.rowCount ? -1 : 1, req.params.id]).then((r) => ({ liked: !exists.rowCount, likes: r.rows[0]?.likes || 0 }));
      });
      return res.json(result);
    } catch (error) { return next(error); }
  });
  app.post('/api/posts', authenticate, upload.array('images', 8), async (req, res, next) => {
    try {
      let extras; try {extras=postExtras(req.body);} catch(error){return res.status(error.status||400).json({error:error.message});}
      const body = req.body || {};
      const imageUrl = req.files?.[0] ? (req.files[0].location || `/uploads/${req.files[0].filename}`) : String(body.imageUrl || '').trim();
      if (!String(body.title || '').trim() || !String(body.description || '').trim() || !String(body.category || '').trim()) return res.status(400).json({ error: 'Informe o título, a descrição e a categoria do item.' });
      if (!imageUrl) return res.status(400).json({ error: 'Adicione pelo menos uma foto do item.' });
      const goal = String(body.goal || DONATION_GOAL).trim() || DONATION_GOAL;
      if (!POST_GOALS.has(goal)) return res.status(400).json({ error: 'Goal must be Doação, Troca or Venda' });
      const post = { id: id('post'), author_id: req.user.id, title: String(body.title).trim(), description: String(body.description).trim(), category: String(body.category).trim(), condition: String(body.condition || 'Bom estado'), goal, image_url: imageUrl, location: String(body.location || req.user.city), created_at: new Date().toISOString(), chip_icon: String(body.chipIcon || (goal === 'Troca' ? 'swap_horiz' : goal === SALE_GOAL ? 'sell' : 'volunteer_activism')), chip_label: String(body.chipLabel || goal) };
      if (isLikelyResidentialAddress(post.location)) return res.status(400).json({ error: 'Location must be a city or neighborhood, not an exact address' });
      const created = await db.transaction(async (client) => {
        await client.query('INSERT INTO posts(id,author_id,title,description,category,condition,goal,image_url,location,created_at,chip_icon,chip_label) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', Object.values(post));
        await client.query('UPDATE posts SET transport_json=$1,area_lat=$2,area_lng=$3 WHERE id=$4',[extras.json,extras.lat,extras.lng,post.id]);
        const files = req.files?.length ? req.files : [{ location: imageUrl }];
        for (const [index, file] of files.entries()) await client.query('INSERT INTO post_images(id,post_id,image_url,sort_order) VALUES($1,$2,$3,$4)', [id('post-image'), post.id, file.location || `/uploads/${file.filename}`, index]);
        await client.query('INSERT INTO threads(id,post_id,participants_json,last_message_at) VALUES($1,$2,$3,$4)', [id('thread'), post.id, JSON.stringify([req.user.id]), post.created_at]);
        return client.query('SELECT * FROM posts WHERE id=$1', [post.id]).then((r) => r.rows[0]);
      });
      return res.status(201).json({ post: await postView(db, created, req.user.id) });
    } catch (error) { return next(error); }
  });
  app.delete('/api/posts/:id', authenticate, async (req, res, next) => {
    try {
      const post = await db.one('SELECT id,author_id FROM posts WHERE id=$1', [req.params.id]);
      if (!post) return res.status(404).json({ error: 'Post not found' });
      if (post.author_id !== req.user.id) return res.status(403).json({ error: 'You can only delete your own posts' });
      await db.transaction(async (client) => {
        // Most relations cascade from posts, but reports do not have a foreign key.
        await client.query('DELETE FROM reports WHERE target_type=$1 AND target_id=$2', ['post', post.id]);
        await client.query('DELETE FROM posts WHERE id=$1', [post.id]);
      });
      return res.json({ ok: true });
    } catch (error) { return next(error); }
  });
  app.put('/api/posts/:id', authenticate, upload.array('images', 8), async (req, res, next) => {
    try {
      const post = await db.one('SELECT * FROM posts WHERE id=$1', [req.params.id]);
      if (!post) return res.status(404).json({ error: 'Post not found' });
      if (post.author_id !== req.user.id) return res.status(403).json({ error: 'You can only edit your own posts' });
      if (['Doado', 'Trocado', 'Vendido', 'Encerrado'].includes(post.status)) return res.status(400).json({ error: 'Completed posts cannot be edited' });
      const value = (key, fallback) => typeof req.body?.[key] === 'string' ? req.body[key].trim() : fallback;
      const title = value('title', post.title);
      const description = value('description', post.description);
      const category = value('category', post.category);
      const condition = value('condition', post.condition);
      const goal = value('goal', post.goal);
      const location = value('location', post.location);
      if (!title || !description || !category) return res.status(400).json({ error: 'Title, description and category are required' });
      if (title.length > 140 || description.length > 3000 || category.length > 60 || condition.length > 60 || goal.length > 40 || location.length > 160) return res.status(400).json({ error: 'One or more fields exceed the allowed length' });
      if (!POST_GOALS.has(goal)) return res.status(400).json({ error: 'Goal must be Doação, Troca or Venda' });
      if (isLikelyResidentialAddress(location)) return res.status(400).json({ error: 'Location must be a city or neighborhood, not an exact address' });
      const imageUrl = req.files?.[0] ? (req.files[0].location || `/uploads/${req.files[0].filename}`) : post.image_url;
      const updated = await db.one('UPDATE posts SET title=$1,description=$2,category=$3,condition=$4,goal=$5,location=$6,image_url=$7,updated_at=now() WHERE id=$8 RETURNING *', [title, description, category, condition, goal, location, imageUrl, post.id]);
      let requestedImages = null;
      if (req.body?.imageOrder !== undefined || req.files?.length) {
        let imageOrder;
        try {
          imageOrder = req.body?.imageOrder ? JSON.parse(req.body.imageOrder) : undefined;
        } catch {
          return res.status(400).json({ error: 'Invalid image order' });
        }
        requestedImages = await requestedPostImages(db, post.id, post.image_url, imageOrder, req.files);
        if (!requestedImages?.length) return res.status(400).json({ error: 'An image is required for every post' });
      }
      if (requestedImages) {
        await db.transaction(async (client) => {
          await client.query('DELETE FROM post_images WHERE post_id=$1', [post.id]);
          for (const [index, url] of requestedImages.entries()) await client.query('INSERT INTO post_images(id,post_id,image_url,sort_order) VALUES($1,$2,$3,$4)', [id('post-image'), post.id, url, index]);
          await client.query('UPDATE posts SET image_url=$1 WHERE id=$2', [requestedImages[0], post.id]);
        });
      }
      const refreshed = requestedImages ? await db.one('SELECT * FROM posts WHERE id=$1', [post.id]) : updated;
      return res.json({ post: await postView(db, refreshed, req.user.id) });
    } catch (error) { return next(error); }
  });
  app.patch('/api/posts/:id/status', authenticate, async (req, res, next) => {
    try {
      const status = String(req.body?.status || '').trim();
      if (!['Disponível', 'Encerrado'].includes(status)) return res.status(400).json({ error: 'Use the reservation or completion flow for this status' });
      const post = await db.one('SELECT * FROM posts WHERE id=$1', [req.params.id]);
      if (!post) return res.status(404).json({ error: 'Post not found' });
      if (post.author_id !== req.user.id) return res.status(403).json({ error: 'Only the owner can change this status' });
      const updated = await db.one(
        'UPDATE posts SET status=$1,reserved_by=CASE WHEN $1=$2 THEN NULL ELSE reserved_by END,updated_at=now() WHERE id=$3 RETURNING *',
        [status, 'Disponível', post.id]
      );
      if (status === 'Encerrado') await db.query('DELETE FROM favorites WHERE post_id=$1', [post.id]);
      return res.json({ post: await postView(db, updated, req.user.id) });
    } catch (error) { return next(error); }
  });
  app.get('/api/posts/:id/interested', authenticate, async (req, res, next) => {
    try {
      const post = await db.one('SELECT id,author_id FROM posts WHERE id=$1', [req.params.id]);
      if (!post) return res.status(404).json({ error: 'Post not found' });
      if (post.author_id !== req.user.id) return res.status(403).json({ error: 'Only the owner can view interested users' });
      const rows = await db.many('SELECT n.id,n.status,NOT EXISTS(SELECT 1 FROM collection_deliveries d WHERE d.negotiation_id=n.id) AND NOT EXISTS(SELECT 1 FROM payments p WHERE p.negotiation_id=n.id) AS can_cancel_acceptance,n.proposal_status,n.proposal_amount_cents,n.proposal_method,n.proposal_created_at,n.created_at,n.thread_id,u.id AS user_id,u.name,u.city,u.avatar FROM negotiations n JOIN users u ON u.id=n.interested_id WHERE n.post_id=$1 ORDER BY n.created_at DESC', [post.id]);
      return res.json({ negotiations: rows.map((row) => ({ id: row.id, status: row.status, canCancelAcceptance: row.status === 'reserved' && row.proposal_status === 'accepted' && Boolean(row.can_cancel_acceptance), proposalStatus: row.proposal_status || 'none', proposalAmountCents: row.proposal_amount_cents || null, proposalMethod: row.proposal_method || null, proposalCreatedAt: row.proposal_created_at || null, createdAt: row.created_at, threadId: row.thread_id, user: { id: row.user_id, name: row.name, city: row.city, avatar: row.avatar || '' } })) });
    } catch (error) { return next(error); }
  });
  app.get('/api/posts/:id/negotiation', authenticate, async (req, res, next) => {
    try {
      const post = await db.one('SELECT id,goal FROM posts WHERE id=$1', [req.params.id]);
      if (!post) return res.status(404).json({ error: 'Post not found' });
      const negotiation = await db.one("SELECT id,status,thread_id,owner_id,interested_id,completed_at,proposal_status,proposal_amount_cents,proposal_method,proposal_created_at FROM negotiations WHERE post_id=$1 AND (owner_id=$2 OR interested_id=$2) ORDER BY CASE WHEN status='reserved' THEN 0 WHEN status='completed' THEN 1 ELSE 2 END, updated_at DESC LIMIT 1", [post.id, req.user.id]);
      const canCancelOffer=Boolean(negotiation&&post.goal===SALE_GOAL&&negotiation.interested_id===req.user.id&&negotiation.status==='interested'&&negotiation.proposal_status==='pending'&&!await db.one('SELECT id FROM collection_deliveries WHERE negotiation_id=$1',[negotiation.id])&&!await db.one('SELECT id FROM payments WHERE negotiation_id=$1 LIMIT 1',[negotiation.id]));
      return res.json({ negotiation: negotiation ? { id: negotiation.id, status: negotiation.status, threadId: negotiation.thread_id, ownerId: negotiation.owner_id, interestedId: negotiation.interested_id, canCancelOffer, completedAt: negotiation.completed_at, proposalStatus: negotiation.proposal_status || 'none', proposalAmountCents: negotiation.proposal_amount_cents || null, proposalMethod: negotiation.proposal_method || null, proposalCreatedAt: negotiation.proposal_created_at || null } : null });
    } catch (error) { return next(error); }
  });
  app.post('/api/negotiations/:id/proposal', authenticate, async (req, res, next) => {
    try {
      const amountCents = req.body?.amountCents !== undefined
        ? Number(req.body.amountCents)
        : parseMoneyToCents(req.body?.amount);
      const method = String(req.body?.method || '').trim().toLowerCase();
      if (!Number.isSafeInteger(amountCents) || amountCents < 100 || amountCents > 100000000) return res.status(400).json({ error: 'Amount must be between R$ 1,00 and R$ 1.000.000,00' });
      if (!['pix', 'card'].includes(method)) return res.status(400).json({ error: 'Use pix ou cartão' });
      if (method === 'pix' && process.env.STRIPE_PIX_ENABLED !== 'true') return res.status(409).json({ error: 'Pix ainda não está habilitado nesta integração Stripe. Escolha cartão.' });
      const updated = await db.transaction(async (client) => {
        const target=(await client.query('SELECT post_id FROM negotiations WHERE id=$1',[req.params.id])).rows[0];
        if(!target)throw Object.assign(new Error('Negotiation not found'),{status:404});
        const post=(await client.query('SELECT title,goal,status FROM posts WHERE id=$1 FOR UPDATE',[target.post_id])).rows[0];
        const negotiation=(await client.query('SELECT * FROM negotiations WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
        if(negotiation.interested_id!==req.user.id)throw Object.assign(new Error('Only the interested user can send this proposal'),{status:403});
        const resending=negotiation.status==='cancelled'&&negotiation.proposal_status==='cancelled';
        if(negotiation.proposal_status&&negotiation.proposal_status!=='none'&&!resending)throw Object.assign(new Error('Você já enviou uma oferta para este anúncio.'),{status:409});
        if(negotiation.status!=='interested'&&!resending)throw Object.assign(new Error('This negotiation is no longer accepting proposals'),{status:400});
        if(!post||post.goal!==SALE_GOAL)throw Object.assign(new Error('Money offers are only available for items marked for sale'),{status:400});
        if(resending&&(post.status!=='Disponível'||(await client.query("SELECT id FROM collection_deliveries WHERE negotiation_id=$1 AND status<>'cancelled'",[negotiation.id])).rows[0]||(await client.query("SELECT id FROM payments WHERE negotiation_id=$1 AND status IN ('processing','succeeded') LIMIT 1",[negotiation.id])).rows[0]))throw Object.assign(new Error('Esta negociação não está disponível para uma nova oferta.'),{status:409});
        const previousCreatedAt=new Date(negotiation.proposal_created_at||0).getTime();
        const createdAt=new Date(Math.max(Date.now(),Number.isFinite(previousCreatedAt)?previousCreatedAt+1:0)).toISOString();
        const result = await client.query("UPDATE negotiations SET status='interested',proposal_status=$1,proposal_amount_cents=$2,proposal_method=$3,proposal_created_at=$4,updated_at=$4 WHERE id=$5 RETURNING *", ['pending', amountCents, method, createdAt, negotiation.id]);
        await emit(client, 'negotiation.proposal_created', { negotiationId: negotiation.id, postId: negotiation.post_id, postTitle: post.title || 'anúncio', ownerId: negotiation.owner_id, interestedId: negotiation.interested_id, amountCents, method }, req.correlationId);
        return result.rows[0];
      });
      queueMicrotask(() => publisher?.flush?.());
      return res.status(201).json({ proposal: { negotiationId: updated.id, status: updated.proposal_status, amountCents: updated.proposal_amount_cents, method: updated.proposal_method, createdAt: updated.proposal_created_at } });
    } catch (error) { if(error?.status)return res.status(error.status).json({error:error.message});return next(error); }
  });
  app.patch('/api/negotiations/:id/proposal', authenticate, async (req, res, next) => {
    try {
      const decision = String(req.body?.decision || '').trim().toLowerCase();
      if (!['accepted', 'rejected'].includes(decision)) return res.status(400).json({ error: 'Decision must be accepted or rejected' });
      const result = await db.transaction(async (client) => {
        // Lock the post before the negotiation so competing offers cannot both reserve it.
        const target = (await client.query('SELECT post_id FROM negotiations WHERE id=$1', [req.params.id])).rows[0];
        if (!target) throw Object.assign(new Error('Negotiation not found'), { status: 404 });
        const post = (await client.query('SELECT * FROM posts WHERE id=$1 FOR UPDATE', [target.post_id])).rows[0];
        if (!post) throw Object.assign(new Error('Post not found'), { status: 404 });
        const negotiation = (await client.query('SELECT * FROM negotiations WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
        if (negotiation.owner_id !== req.user.id || post.author_id !== req.user.id) throw Object.assign(new Error('Only the seller can decide this proposal'), { status: 403 });
        if (post.goal === SALE_GOAL) {
          const expected = typeof req.body?.expectedProposalCreatedAt === 'string' ? Date.parse(req.body.expectedProposalCreatedAt) : NaN;
          if (!Number.isFinite(expected)) throw Object.assign(new Error('Atualize a oferta antes de responder.'), { status: 400 });
          if (new Date(negotiation.proposal_created_at).getTime() !== expected) throw Object.assign(new Error('A oferta foi atualizada. Confira o valor e a forma de pagamento antes de responder.'), { status: 409 });
        }
        if (negotiation.proposal_status !== 'pending' && !(decision === 'accepted' && negotiation.proposal_status === 'rejected')) throw Object.assign(new Error('There is no pending proposal to decide'), { status: 400 });
        if (decision === 'accepted') {
          if (post.goal !== SALE_GOAL) throw Object.assign(new Error('Only sale offers can be accepted here'), { status: 400 });
          if (!['Disponível', 'Reservado'].includes(post.status) ||
              (post.status === 'Reservado' && post.reserved_by !== negotiation.interested_id) ||
              !['interested', 'reserved'].includes(negotiation.status)) {
            throw Object.assign(new Error('Este anúncio já está reservado para outra pessoa ou não está disponível.'), { status: 409 });
          }
          if (stripe.configured() && !stripe.demoEnabled()) {
            const seller = (await client.query('SELECT stripe_account_id FROM users WHERE id=$1', [req.user.id])).rows[0];
            if (!seller?.stripe_account_id) throw Object.assign(new Error('Conecte sua conta Stripe para receber pagamentos.'), { status: 409 });
          }
          await client.query("UPDATE negotiations SET status='interested',proposal_status=CASE WHEN proposal_status='pending' THEN 'rejected' ELSE proposal_status END,updated_at=now() WHERE post_id=$1 AND id<>$2 AND status='reserved'", [post.id, negotiation.id]);
          await client.query("UPDATE negotiations SET proposal_status='accepted',status='reserved',updated_at=now() WHERE id=$1", [negotiation.id]);
          await client.query("UPDATE posts SET status='Reservado',reserved_by=$1,updated_at=now() WHERE id=$2", [negotiation.interested_id, post.id]);
          await emit(client, 'negotiation.reserved', { negotiationId: negotiation.id, postId: post.id, postTitle: post.title, ownerId: post.author_id, interestedId: negotiation.interested_id, status: 'reserved' }, req.correlationId);
        } else {
          await client.query("UPDATE negotiations SET proposal_status='rejected',updated_at=now() WHERE id=$1", [negotiation.id]);
        }
        return { negotiation, decision };
      });
      queueMicrotask(() => publisher?.flush?.());
      return res.json({ proposal: { negotiationId: result.negotiation.id, status: result.decision, amountCents: result.negotiation.proposal_amount_cents, method: result.negotiation.proposal_method, createdAt: result.negotiation.proposal_created_at }, reserved: decision === 'accepted' });
    } catch (error) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      return next(error);
    }
  });
  app.get('/api/profile/payment-items', authenticate, async (req, res, next) => {
    try {
      const rows = await db.many(`SELECT n.id AS negotiation_id,n.status,n.proposal_status,n.proposal_amount_cents,n.proposal_method,n.proposal_created_at,p.id AS post_id,p.title,p.image_url,p.location
        FROM negotiations n JOIN posts p ON p.id=n.post_id
        WHERE p.status <> 'Encerrado' AND n.interested_id=$1 AND n.proposal_status IN ('pending','accepted') AND n.status IN ('interested','reserved')
        ORDER BY n.updated_at DESC`, [req.user.id]);
      const payments = await db.many(`SELECT negotiation_id,status,checkout_url FROM payments WHERE payer_id=$1 AND status IN ('processing','failed') ORDER BY created_at DESC`, [req.user.id]);
      const paymentByNegotiation = new Map(payments.map((payment) => [payment.negotiation_id, payment]));
      return res.json({ items: rows.map((row) => ({ negotiationId: row.negotiation_id, postId: row.post_id, title: row.title, imageUrl: row.image_url, location: row.location, negotiationStatus: row.status, proposalStatus: row.proposal_status, amountCents: row.proposal_amount_cents, method: row.proposal_method, createdAt: row.proposal_created_at, payment: paymentByNegotiation.get(row.negotiation_id) || null })) });
    } catch (error) { return next(error); }
  });
  app.post('/api/posts/:id/reserve', authenticate, async (req, res, next) => {
    try {
      const result = await db.transaction(async (client) => {
        const postResult = await client.query('SELECT * FROM posts WHERE id=$1 FOR UPDATE', [req.params.id]);
        const post = postResult.rows[0]; if (!post) throw Object.assign(new Error('Post not found'), { status: 404 });
        if (post.author_id !== req.user.id) throw Object.assign(new Error('Only the owner can reserve this post'), { status: 403 });
        if (post.goal === SALE_GOAL && stripe.configured() && !stripe.demoEnabled()) {
          const seller = (await client.query('SELECT stripe_account_id FROM users WHERE id=$1', [req.user.id])).rows[0];
          if (!seller?.stripe_account_id) throw Object.assign(new Error('Conecte sua conta Stripe antes de reservar o anúncio.'), { status: 409 });
        }
        if (!['Disponível', 'Reservado'].includes(post.status)) throw Object.assign(new Error('This post is no longer available'), { status: 400 });
        const negotiation = (await client.query("SELECT * FROM negotiations WHERE post_id=$1 AND interested_id=$2 AND status <> 'cancelled'", [post.id, req.body?.interestedId])).rows[0];
        if (!negotiation) throw Object.assign(new Error('Choose a user who demonstrated interest'), { status: 400 });
        if (post.goal === SALE_GOAL) {
          const expected = typeof req.body?.expectedProposalCreatedAt === 'string' ? Date.parse(req.body.expectedProposalCreatedAt) : NaN;
          if (!Number.isFinite(expected)) throw Object.assign(new Error('Atualize a oferta antes de reservar o item.'), { status: 400 });
          if (new Date(negotiation.proposal_created_at).getTime() !== expected) throw Object.assign(new Error('A oferta foi atualizada. Confira o valor e a forma de pagamento antes de reservar.'), { status: 409 });
        }
        await client.query("UPDATE negotiations SET status='interested',updated_at=now() WHERE post_id=$1 AND status='reserved'", [post.id]);
        await client.query("UPDATE negotiations SET status='reserved',proposal_status=CASE WHEN proposal_status='pending' THEN 'accepted' ELSE proposal_status END,updated_at=now() WHERE id=$1", [negotiation.id]);
        await client.query("UPDATE posts SET status='Reservado',reserved_by=$1,updated_at=now() WHERE id=$2", [negotiation.interested_id, post.id]);
        await emit(client, 'negotiation.reserved', { negotiationId: negotiation.id, postId: post.id, postTitle: post.title, ownerId: post.author_id, interestedId: negotiation.interested_id, status: 'reserved' }, req.correlationId);
        return client.query('SELECT * FROM posts WHERE id=$1', [post.id]).then((r) => r.rows[0]);
      });
      queueMicrotask(() => publisher?.flush?.());
      return res.json({ post: await postView(db, result, req.user.id) });
    } catch (error) { if (error.status) return res.status(error.status).json({ error: error.message }); return next(error); }
  });
  app.post('/api/messages/threads', authenticate, async (req, res, next) => {
    try {
      const post = await db.one('SELECT * FROM posts WHERE id=$1', [req.body?.postId]);
      if (!post) return res.status(404).json({ error: 'Post not found' });
      if (post.author_id === req.user.id) return res.status(400).json({ error: 'You cannot contact yourself' });
      const participants = JSON.stringify([req.user.id, post.author_id]);
      const existing = await db.one('SELECT * FROM threads WHERE post_id=$1 AND participants_json::jsonb @> $2::jsonb AND participants_json::jsonb <@ $2::jsonb', [post.id, participants]);
      if (existing) return res.json({ thread: existing });
      const thread = { id: id('thread'), post_id: post.id, participants_json: participants, last_message_at: new Date().toISOString() };
      await db.transaction(async (client) => {
        await client.query('INSERT INTO threads(id,post_id,participants_json,last_message_at) VALUES($1,$2,$3,$4)', Object.values(thread));
        await client.query('INSERT INTO negotiations(id,post_id,owner_id,interested_id,thread_id,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$6)', [id('negotiation'), post.id, post.author_id, req.user.id, thread.id, thread.last_message_at]);
        await emit(client, 'negotiation.interested', { postId: post.id, postTitle: post.title, ownerId: post.author_id, interestedId: req.user.id, interestedName: req.user.name }, req.correlationId);
      });
      queueMicrotask(() => publisher?.flush?.());
      return res.status(201).json({ thread });
    } catch (error) { return next(error); }
  });
  app.get('/api/messages/threads', authenticate, async (req, res, next) => {
    try {
      const rows = await db.many(`SELECT t.id,t.post_id,t.last_message_at,t.unread_count,
        p.title AS post_title, u.id AS other_user_id,u.name AS other_user_name,u.avatar AS other_user_avatar,
        last_message.text AS last_message_text,last_message.sent_at AS last_message_sent_at
        FROM threads t
        JOIN posts p ON p.id=t.post_id
        JOIN LATERAL jsonb_array_elements_text(t.participants_json::jsonb) participant ON true
        JOIN users u ON u.id=participant AND u.id <> $1
        LEFT JOIN message_clears cleared ON cleared.user_id=$1 AND cleared.thread_id=t.id
        LEFT JOIN LATERAL (
          SELECT text,sent_at FROM messages
          WHERE thread_id=t.id AND (cleared.cleared_at IS NULL OR sent_at > cleared.cleared_at)
          ORDER BY sent_at DESC LIMIT 1
        ) last_message ON true
        WHERE t.participants_json::jsonb @> $2::jsonb
          AND (cleared.cleared_at IS NULL OR last_message.sent_at IS NOT NULL)
        ORDER BY COALESCE(last_message.sent_at, t.last_message_at) DESC`, [req.user.id, JSON.stringify([req.user.id])]);
      return res.json({ threads: rows.map((row) => ({
        id: row.id,
        postId: row.post_id,
        title: row.other_user_name,
        avatar: row.other_user_avatar || '',
        subtitle: row.last_message_text || row.post_title,
        time: row.last_message_sent_at || row.last_message_at,
        unreadCount: Number(row.unread_count || 0)
      })) });
    } catch (error) { return next(error); }
  });
  app.get('/api/messages/threads/:id', authenticate, async (req, res, next) => {
    try {
      const thread = await db.one('SELECT * FROM threads WHERE id=$1 AND participants_json::jsonb @> $2::jsonb', [req.params.id, JSON.stringify([req.user.id])]);
      if (!thread) return res.status(404).json({ error: 'Thread not found' });
      const clear = await db.one('SELECT cleared_at FROM message_clears WHERE user_id=$1 AND thread_id=$2', [req.user.id, thread.id]);
      const messages = clear
        ? await db.many('SELECT * FROM messages WHERE thread_id=$1 AND sent_at > $2 ORDER BY sent_at ASC', [thread.id, clear.cleared_at])
        : await db.many('SELECT * FROM messages WHERE thread_id=$1 ORDER BY sent_at ASC', [thread.id]);
      await db.query('UPDATE threads SET unread_count=0 WHERE id=$1', [thread.id]);
      const otherUserId = json(thread.participants_json).find((item) => item !== req.user.id);
      const otherUser = otherUserId ? await db.one('SELECT id,name,avatar FROM users WHERE id=$1', [otherUserId]) : null;
      return res.json({ thread: { ...thread, title: otherUser?.name || 'Conversa', avatar: otherUser?.avatar || '' }, participants: json(thread.participants_json), messages });
    } catch (error) { return next(error); }
  });
  app.delete('/api/messages/threads/:id/messages', authenticate, async (req, res, next) => {
    try {
      const thread = await db.one('SELECT id FROM threads WHERE id=$1 AND participants_json::jsonb @> $2::jsonb', [req.params.id, JSON.stringify([req.user.id])]);
      if (!thread) return res.status(404).json({ error: 'Thread not found' });
      await db.query(`INSERT INTO message_clears(user_id,thread_id,cleared_at) VALUES($1,$2,now())
        ON CONFLICT(user_id,thread_id) DO UPDATE SET cleared_at=EXCLUDED.cleared_at`, [req.user.id, thread.id]);
      return res.json({ ok: true });
    } catch (error) { return next(error); }
  });
  app.delete('/api/messages/threads', authenticate, async (req, res, next) => {
    try {
      await db.query(`INSERT INTO message_clears(user_id,thread_id,cleared_at)
        SELECT $1,t.id,now() FROM threads t
        WHERE t.participants_json::jsonb @> $2::jsonb
        ON CONFLICT(user_id,thread_id) DO UPDATE SET cleared_at=EXCLUDED.cleared_at`, [req.user.id, JSON.stringify([req.user.id])]);
      return res.json({ ok: true });
    } catch (error) { return next(error); }
  });
  app.post('/api/messages/threads/:id/messages', authenticate, async (req, res, next) => {
    try {
      const text = String(req.body?.text || '').trim();
      const thread = await db.one('SELECT * FROM threads WHERE id=$1 AND participants_json::jsonb @> $2::jsonb', [req.params.id, JSON.stringify([req.user.id])]);
      if (!thread) return res.status(404).json({ error: 'Thread not found' });
      if (!text || text.length > 1000) return res.status(400).json({ error: 'Message must contain between 1 and 1000 characters' });
      const message = { id: id('msg'), thread_id: thread.id, sender_id: req.user.id, text, sent_at: new Date().toISOString(), status: 'sent' };
      const recipientId = json(thread.participants_json).find((item) => item !== req.user.id);
      await db.transaction(async (client) => {
        await client.query('INSERT INTO messages(id,thread_id,sender_id,text,sent_at,status) VALUES($1,$2,$3,$4,$5,$6)', Object.values(message));
        await client.query('UPDATE threads SET last_message_at=$1,unread_count=unread_count+1 WHERE id=$2', [message.sent_at, thread.id]);
        if (recipientId) await emit(client, 'message.sent', { messageId: message.id, threadId: thread.id, postId: thread.post_id, senderId: req.user.id, senderName: req.user.name, recipientId }, req.correlationId);
      });
      queueMicrotask(() => publisher?.flush?.());
      return res.status(201).json({ message });
    } catch (error) { return next(error); }
  });
  app.get('/api/notifications', authenticate, async (req, res, next) => {
    try {
      const rows = await db.many('SELECT id,type,title,text,link,created_at AS "createdAt",read_at AS "readAt" FROM (SELECT id,type,title,text,link,created_at,read_at FROM notifications WHERE user_id=$1 UNION ALL SELECT id,type,title,text,link,created_at,read_at FROM notification_service_notifications WHERE user_id=$1) notices ORDER BY created_at DESC LIMIT 100', [req.user.id]);
      return res.json({ notifications: rows });
    } catch (error) { return next(error); }
  });
  app.post('/api/notifications/:id/read', authenticate, async (req, res, next) => {
    try {
      for (const table of ['notifications', 'notification_service_notifications']) await db.query(`UPDATE ${table} SET read_at=now() WHERE id=$1 AND user_id=$2`, [req.params.id, req.user.id]);
      return res.json({ ok: true });
    } catch (error) { return next(error); }
  });
  app.post('/api/notifications/read-thread/:threadId', authenticate, async (req, res, next) => {
    try {
      for (const table of ['notifications', 'notification_service_notifications']) await db.query(`UPDATE ${table} SET read_at=now() WHERE user_id=$1 AND type='message' AND link LIKE $2 AND read_at IS NULL`, [req.user.id, `%thread=${req.params.threadId}`]);
      return res.json({ ok: true });
    } catch (error) { return next(error); }
  });
  app.get('/api/posts/:id/comments', async (req, res, next) => {
    try { return res.json({ comments: await db.many('SELECT c.id,c.text,c.created_at,u.name,u.avatar FROM comments c JOIN users u ON u.id=c.author_id WHERE c.post_id=$1 ORDER BY c.created_at ASC', [req.params.id]) }); } catch (error) { return next(error); }
  });
  app.post('/api/posts/:id/comments', authenticate, async (req, res, next) => {
    try {
      const text = String(req.body?.text || '').trim();
      if (!text || text.length > 500) return res.status(400).json({ error: 'Comment must have between 1 and 500 characters' });
      const comment = { id: id('comment'), post_id: req.params.id, author_id: req.user.id, text, created_at: new Date().toISOString() };
      await db.transaction(async (client) => { await client.query('INSERT INTO comments(id,post_id,author_id,text,created_at) VALUES($1,$2,$3,$4,$5)', Object.values(comment)); await client.query('UPDATE posts SET comments=comments+1 WHERE id=$1', [comment.post_id]); });
      return res.status(201).json({ comment: { ...comment, name: req.user.name, avatar: req.user.avatar } });
    } catch (error) { return next(error); }
  });
  app.get('/api/profile', authenticate, async (req, res, next) => {
    try {
      const profile = await db.one('SELECT * FROM users WHERE id=$1', [req.user.id]);
      const posts = await db.many("SELECT * FROM posts WHERE author_id=$1 AND status <> 'Encerrado' ORDER BY created_at DESC", [req.user.id]);
      const reputation = await db.one('SELECT COALESCE(ROUND(AVG(rating),1),0)::float AS rating, COUNT(*)::int AS count FROM reviews WHERE reviewee_id=$1', [req.user.id]);
      return res.json({ user: userView(profile), stats: { donations: Number(profile.donations || 0), received: Number(profile.received || 0), rating: Number(reputation?.rating || 0), carbonSavedPercent: Number(profile.carbon_saved_percent || 0) }, achievements: json(profile.achievements_json), reputation, reviews: [], posts: await Promise.all(posts.map((row) => postView(db, row, req.user.id))) });
    } catch (error) { return next(error); }
  });
  app.post('/api/profile/avatar', authenticate, upload.single('avatar'), async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Choose an image for your profile' });
      const avatar = req.file.location || `/uploads/${req.file.filename}`;
      const row = await db.one('UPDATE users SET avatar=$1 WHERE id=$2 RETURNING *', [avatar, req.user.id]);
      return res.json({ user: userView(row) });
    } catch (error) { return next(error); }
  });

  app.put('/api/profile', authenticate, async (req, res, next) => {
    try {
      const body = req.body || {};
      const name = String(body.name || req.user.name || '').trim();
      const city = String(body.city || req.user.city || '').trim();
      const neighborhood = String(body.neighborhood ?? req.user.neighborhood ?? '').trim();
      const cep = String(body.cep ?? req.user.cep ?? '').trim();
      const address = String(body.address ?? req.user.address ?? '').trim();
      const accountType = String(body.accountType || req.user.accountType || 'person').trim();
      const businessName = String(body.businessName ?? req.user.businessName ?? '').trim();
      const cnpj = String(body.cnpj ?? req.user.cnpj ?? '').replace(/\D/g, '');
      const interests = Array.isArray(body.interests)
        ? body.interests.slice(0, 20).map((item) => String(item).trim()).filter(Boolean)
        : Array.isArray(req.user.interests)
          ? [...req.user.interests]
          : [];
      if (!name || !city) return res.status(400).json({ error: 'Name and city are required' });
      if (!['person', 'business'].includes(accountType)) return res.status(400).json({ error: 'Selecione um tipo de conta válido.' });
      if (accountType === 'business' && (!businessName || cnpj.length !== 14)) return res.status(400).json({ error: 'Contas empresariais precisam de razão social e CNPJ válido.' });
      await db.query(`UPDATE users SET name=$1, city=$2, neighborhood=$3, cep=$4, address=$5, account_type=$6, business_name=$7, cnpj=$8, interests_json=$9, last_active_at=now() WHERE id=$10`, [name, city, neighborhood, cep, address, accountType, businessName, cnpj, JSON.stringify(interests), req.user.id]);
      const refreshed = await db.one('SELECT * FROM users WHERE id=$1', [req.user.id]);
      return res.json({ user: userView(refreshed) });
    } catch (error) { return next(error); }
  });

  app.put('/api/profile/preferences', authenticate, async (req, res, next) => {
    try {
      const valid = new Set(['Curtidas', 'Comentários', 'Interesse', 'Mensagens', 'Negociações', 'Avaliações', 'Sistema']);
      const preferences = Array.isArray(req.body?.preferences)
        ? req.body.preferences.map((item) => String(item)).filter((item) => valid.has(item))
        : [];
      await db.query('UPDATE users SET notification_preferences_json=$1 WHERE id=$2', [JSON.stringify([...new Set(preferences)]), req.user.id]);
      return res.json({ preferences: [...new Set(preferences)] });
    } catch (error) { return next(error); }
  });

  app.put('/api/profile/password', authenticate, async (req, res, next) => {
    try {
      const currentPassword = String(req.body?.currentPassword || '');
      const newPassword = String(req.body?.newPassword || '');
      const row = await db.one('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
      if (!row || !verifyPassword(currentPassword, row.password_hash)) return res.status(400).json({ error: 'Current password is incorrect' });
      if (newPassword.length < 8 || newPassword.length > 200) return res.status(400).json({ error: 'New password must contain between 8 and 200 characters' });
      await db.query('UPDATE users SET password_hash=$1 WHERE id=$2', [passwordHash(newPassword), req.user.id]);
      return res.json({ ok: true });
    } catch (error) { return next(error); }
  });

  app.delete('/api/profile', authenticate, async (req, res, next) => {
    try {
      const confirmation = String(req.body?.confirmation || '').trim();
      const password = String(req.body?.password || '');
      const row = await db.one('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
      if (confirmation !== 'EXCLUIR' || !row || !verifyPassword(password, row.password_hash)) return res.status(400).json({ error: 'Confirm deletion with EXCLUIR and your current password' });

      await db.transaction(async (client) => {
        const posts = await client.query('SELECT id FROM posts WHERE author_id=$1', [req.user.id]);
        for (const post of posts.rows) {
          await client.query('DELETE FROM favorites WHERE post_id=$1', [post.id]);
          await client.query('DELETE FROM post_views WHERE post_id=$1', [post.id]);
          await client.query('DELETE FROM post_likes WHERE post_id=$1', [post.id]);
          await client.query('DELETE FROM comments WHERE post_id=$1', [post.id]);
          await client.query('DELETE FROM reviews WHERE negotiation_id IN (SELECT id FROM negotiations WHERE post_id=$1)', [post.id]);
          await client.query('DELETE FROM negotiations WHERE post_id=$1', [post.id]);
          await client.query('DELETE FROM reports WHERE target_type=$1 AND target_id=$2', ['post', post.id]);
        }
        await client.query('DELETE FROM favorites WHERE user_id=$1', [req.user.id]);
        await client.query('DELETE FROM post_views WHERE user_id=$1', [req.user.id]);
        await client.query('DELETE FROM post_likes WHERE user_id=$1', [req.user.id]);
        await client.query('DELETE FROM comments WHERE author_id=$1', [req.user.id]);
        await client.query('DELETE FROM notifications WHERE user_id=$1', [req.user.id]);
        await client.query('DELETE FROM reviews WHERE reviewer_id=$1 OR reviewee_id=$1', [req.user.id]);
        await client.query('DELETE FROM reports WHERE reporter_id=$1', [req.user.id]);
        await client.query('DELETE FROM blocked_users WHERE blocker_id=$1 OR blocked_id=$1', [req.user.id]);
        await client.query('DELETE FROM collection_point_suggestions WHERE user_id=$1', [req.user.id]);
        await client.query('DELETE FROM auth_identities WHERE user_id=$1', [req.user.id]);
        await client.query('DELETE FROM users WHERE id=$1', [req.user.id]);
      });
      return res.json({ ok: true });
    } catch (error) { return next(error); }
  });

  app.post('/api/reports', authenticate, async (req, res, next) => {
    try {
      const targetType = String(req.body?.targetType || 'post').trim();
      const targetId = String(req.body?.targetId || '').trim();
      const reason = String(req.body?.reason || '').trim();
      const details = String(req.body?.details || '').trim();
      if (!targetId || !reason) return res.status(400).json({ error: 'Target and reason are required' });
      const report = { id: id('report'), reporter_id: req.user.id, target_type: targetType, target_id: targetId, reason, details, status: 'pending', created_at: new Date().toISOString() };
      await db.query('INSERT INTO reports(id,reporter_id,target_type,target_id,reason,details,status,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING', [report.id, report.reporter_id, report.target_type, report.target_id, report.reason, report.details, report.status, report.created_at]);
      return res.status(201).json({ report });
    } catch (error) { return next(error); }
  });

  app.post('/api/users/:id/block', authenticate, async (req, res, next) => {
    try {
      if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot block yourself' });
      const target = await db.one('SELECT id FROM users WHERE id=$1', [req.params.id]);
      if (!target) return res.status(404).json({ error: 'User not found' });
      await db.query('INSERT INTO blocked_users(blocker_id,blocked_id,created_at) VALUES($1,$2,now()) ON CONFLICT DO NOTHING', [req.user.id, req.params.id]);
      return res.json({ blocked: true });
    } catch (error) { return next(error); }
  });

  app.get('/api/users/:id/reviews', async (req, res, next) => {
    try {
      const rows = await db.many('SELECT r.*, u.name AS reviewer_name, u.avatar AS reviewer_avatar FROM reviews r JOIN users u ON u.id = r.reviewer_id WHERE r.reviewee_id=$1 ORDER BY r.created_at DESC', [req.params.id]);
      return res.json({ reviews: rows.map((row) => ({ id: row.id, rating: Number(row.rating), comment: row.comment, createdAt: row.created_at, reviewer: { id: row.reviewer_id, name: row.reviewer_name, avatar: row.reviewer_avatar || '' } })) });
    } catch (error) { return next(error); }
  });

  app.post('/api/negotiations/:id/reviews', authenticate, async (req, res, next) => {
    try {
      const negotiation = await db.one('SELECT * FROM negotiations WHERE id=$1', [req.params.id]);
      if (!negotiation) return res.status(404).json({ error: 'Negotiation not found' });
      if (![negotiation.owner_id, negotiation.interested_id].includes(req.user.id)) return res.status(403).json({ error: 'Only negotiation participants can review it' });
      if (req.user.id === negotiation.owner_id && negotiation.owner_id === req.user.id) return res.status(400).json({ error: 'Review requires the counterparty' });
      const rating = Number(req.body?.rating || 0);
      const comment = String(req.body?.comment || '').trim();
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be between 1 and 5' });
      const existing = await db.one('SELECT 1 FROM reviews WHERE negotiation_id=$1 AND reviewer_id=$2', [negotiation.id, req.user.id]);
      if (existing) return res.status(409).json({ error: 'You already reviewed this negotiation' });
      const review = { id: id('review'), negotiation_id: negotiation.id, reviewer_id: req.user.id, reviewee_id: req.user.id === negotiation.owner_id ? negotiation.interested_id : negotiation.owner_id, rating, comment, created_at: new Date().toISOString() };
      await db.query('INSERT INTO reviews(id,negotiation_id,reviewer_id,reviewee_id,rating,comment,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)', [review.id, review.negotiation_id, review.reviewer_id, review.reviewee_id, review.rating, review.comment, review.created_at]);
      return res.status(201).json({ review });
    } catch (error) { return next(error); }
  });

  app.get('/api/admin/dashboard', authenticate, async (req, res, next) => {
    try {
      const adminCheck = await db.one('SELECT role FROM users WHERE id=$1', [req.user.id]);
      if (adminCheck.role !== 'admin') return res.status(403).json({ error: 'Administrator access required' });
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const totals = await db.one(`SELECT COUNT(*)::int AS total_users, (SELECT COUNT(*)::int FROM users WHERE suspended=false AND last_active_at >= $1)::int AS active_users, (SELECT COUNT(*)::int FROM posts WHERE status <> 'Encerrado')::int AS total_posts, (SELECT COUNT(*)::int FROM posts WHERE status IN ('Disponível','Reservado'))::int AS active_posts, (SELECT COUNT(*)::int FROM posts WHERE status='Doado')::int AS donations, (SELECT COUNT(*)::int FROM posts WHERE status='Trocado')::int AS exchanges, (SELECT COUNT(*)::int FROM collection_points)::int AS collection_points, (SELECT COUNT(*)::int FROM reports WHERE status='pending')::int AS reports, (SELECT COUNT(*)::int FROM users WHERE last_active_at >= $1)::int AS new_users FROM users`, [since]);
      const categories = await db.many("SELECT category, COUNT(*)::int AS count FROM posts WHERE status <> 'Encerrado' GROUP BY category ORDER BY count DESC LIMIT 8");
      return res.json({ totals: { totalUsers: totals.total_users, activeUsers: totals.active_users, totalPosts: totals.total_posts, activePosts: totals.active_posts, donations: totals.donations, exchanges: totals.exchanges, collectionPoints: totals.collection_points, reports: totals.reports, newUsers: totals.new_users }, categories, impact: { itemsReused: Number(totals.donations) + Number(totals.exchanges), beneficiaries: 0, estimated: true } });
    } catch (error) { return next(error); }
  });

  app.get('/api/admin/users', authenticate, async (req, res, next) => {
    try {
      const adminCheck = await db.one('SELECT role FROM users WHERE id=$1', [req.user.id]);
      if (adminCheck.role !== 'admin') return res.status(403).json({ error: 'Administrator access required' });
      const query = String(req.query.q || '').trim();
      const rows = query ? await db.many('SELECT id,name,email,city,role,suspended,created_at,last_active_at FROM users WHERE name ILIKE $1 OR email ILIKE $1 ORDER BY name ASC LIMIT 100', [`%${query}%`]) : await db.many('SELECT id,name,email,city,role,suspended,created_at,last_active_at FROM users ORDER BY name ASC LIMIT 100');
      return res.json({ users: rows.map((row) => ({ id: row.id, name: row.name, email: row.email, city: row.city, role: row.role || 'user', suspended: Boolean(row.suspended), createdAt: row.created_at, lastActiveAt: row.last_active_at })) });
    } catch (error) { return next(error); }
  });

  app.patch('/api/admin/users/:id/suspension', authenticate, async (req, res, next) => {
    try {
      const adminCheck = await db.one('SELECT role FROM users WHERE id=$1', [req.user.id]);
      if (adminCheck.role !== 'admin') return res.status(403).json({ error: 'Administrator access required' });
      if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot suspend your own account' });
      const user = await db.one('SELECT id FROM users WHERE id=$1', [req.params.id]);
      if (!user) return res.status(404).json({ error: 'User not found' });
      const suspended = Boolean(req.body?.suspended);
      await db.query('UPDATE users SET suspended=$1 WHERE id=$2', [suspended, req.params.id]);
      return res.json({ suspended });
    } catch (error) { return next(error); }
  });
  app.delete('/api/admin/users/:id', authenticate, async (req, res, next) => {
    try {
      if (!await requireAdmin(req, res)) return;
      if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
      const removed = await db.transaction(async (client) => {
        const user = (await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
        if (!user) return false;
        const financial = await client.query(`SELECT p.id FROM payments p
          WHERE p.payer_id=$1 OR p.payee_id=$1 OR p.negotiation_id IN
          (SELECT id FROM negotiations WHERE owner_id=$1 OR interested_id=$1 OR post_id IN (SELECT id FROM posts WHERE author_id=$1))
          LIMIT 1`, [user.id]);
        if (financial.rowCount) throw Object.assign(new Error('Este usuário possui pagamentos vinculados e não pode ser excluído para preservar o histórico financeiro.'), { status: 409 });
        await client.query('DELETE FROM reports WHERE reporter_id=$1 OR (target_type=$2 AND target_id IN (SELECT id FROM posts WHERE author_id=$1))', [user.id, 'post']);
        await client.query('DELETE FROM reviews WHERE reviewer_id=$1 OR reviewee_id=$1 OR negotiation_id IN (SELECT id FROM negotiations WHERE owner_id=$1 OR interested_id=$1 OR post_id IN (SELECT id FROM posts WHERE author_id=$1))', [user.id]);
        await client.query('DELETE FROM messages WHERE sender_id=$1 OR thread_id IN (SELECT thread_id FROM negotiations WHERE owner_id=$1 OR interested_id=$1)', [user.id]);
        await client.query('DELETE FROM delivery_incidents WHERE delivery_id IN (SELECT id FROM collection_deliveries WHERE negotiation_id IN (SELECT id FROM negotiations WHERE owner_id=$1 OR interested_id=$1 OR post_id IN (SELECT id FROM posts WHERE author_id=$1)))', [user.id]);
        await client.query('DELETE FROM collection_deliveries WHERE negotiation_id IN (SELECT id FROM negotiations WHERE owner_id=$1 OR interested_id=$1 OR post_id IN (SELECT id FROM posts WHERE author_id=$1))', [user.id]);
        await client.query('DELETE FROM negotiations WHERE owner_id=$1 OR interested_id=$1 OR post_id IN (SELECT id FROM posts WHERE author_id=$1)', [user.id]);
        await client.query('DELETE FROM post_images WHERE post_id IN (SELECT id FROM posts WHERE author_id=$1)', [user.id]);
        await client.query('DELETE FROM comments WHERE post_id IN (SELECT id FROM posts WHERE author_id=$1)', [user.id]);
        await client.query('DELETE FROM favorites WHERE post_id IN (SELECT id FROM posts WHERE author_id=$1)', [user.id]);
        await client.query('DELETE FROM post_views WHERE post_id IN (SELECT id FROM posts WHERE author_id=$1)', [user.id]);
        await client.query('DELETE FROM post_likes WHERE post_id IN (SELECT id FROM posts WHERE author_id=$1)', [user.id]);
        await client.query('DELETE FROM posts WHERE author_id=$1', [user.id]);
        await client.query('DELETE FROM favorites WHERE user_id=$1 OR post_id IN (SELECT id FROM posts WHERE author_id=$1)', [user.id]);
        await client.query('DELETE FROM post_views WHERE user_id=$1 OR post_id IN (SELECT id FROM posts WHERE author_id=$1)', [user.id]);
        await client.query('DELETE FROM post_likes WHERE user_id=$1 OR post_id IN (SELECT id FROM posts WHERE author_id=$1)', [user.id]);
        await client.query('DELETE FROM blocked_users WHERE blocker_id=$1 OR blocked_id=$1', [user.id]);
        await client.query('DELETE FROM notifications WHERE user_id=$1', [user.id]);
        await client.query('DELETE FROM collection_point_suggestions WHERE user_id=$1', [user.id]);
        await client.query('DELETE FROM users WHERE id=$1', [user.id]);
        return true;
      });
      if (!removed) return res.status(404).json({ error: 'User not found' });
      return res.json({ ok: true });
    } catch (error) { if (error?.status) return res.status(error.status).json({ error: error.message }); return next(error); }
  });

  app.post('/api/collection-points/suggestions', authenticate, async (req, res, next) => {
    try {
      const name = String(req.body?.name || '').trim();
      const address = buildCollectionPointAddress(req.body);
      const location = address.location;
      const hours = String(req.body?.hours || '').trim();
      const categories = Array.isArray(req.body?.categories)
        ? req.body.categories.map(String).map((item) => item.trim()).filter(Boolean)
        : [];
      const submittedLatitude = Number(req.body?.latitude);
      const submittedLongitude = Number(req.body?.longitude);

      if (
        !name ||
        !location ||
        !categories.length ||
        name.length > 120 ||
        location.length > 200 ||
        hours.length > 100 ||
        categories.length > 12 ||
        categories.some((item) => item.length > 40)
      ) {
        return res.status(400).json({ error: 'Provide a name, location and accepted materials' });
      }

      const duplicate = await db.one(
        "SELECT id FROM collection_point_suggestions WHERE user_id=$1 AND lower(name)=lower($2) AND lower(location)=lower($3) AND status='pending'",
        [req.user.id, name, location]
      );
      if (duplicate) return res.status(409).json({ error: 'You already suggested this collection point' });

      const geocoded = Number.isFinite(submittedLatitude) && Number.isFinite(submittedLongitude)
        ? { latitude: submittedLatitude, longitude: submittedLongitude }
        : await geocodeCollectionPoint(address);
      const suggestion = {
        id: id('point-suggestion'),
        userId: req.user.id,
        name,
        categoriesJson: JSON.stringify(categories),
        hours,
        location,
        latitude: geocoded?.latitude ?? null,
        longitude: geocoded?.longitude ?? null
      };
      const created = await db.one(
        `INSERT INTO collection_point_suggestions
          (id,user_id,name,categories_json,hours,location,latitude,longitude,status,created_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending',now())
         RETURNING *`,
        [
          suggestion.id,
          suggestion.userId,
          suggestion.name,
          suggestion.categoriesJson,
          suggestion.hours,
          suggestion.location,
          suggestion.latitude,
          suggestion.longitude
        ]
      );

      return res.status(201).json({
        suggestion: {
          id: created.id,
          userId: created.user_id,
          name: created.name,
          categories: json(created.categories_json),
          hours: created.hours,
          location: created.location,
          latitude: created.latitude,
          longitude: created.longitude,
          status: created.status,
          createdAt: created.created_at
        }
      });
    } catch (error) { return next(error); }
  });

  const requireAdmin = async (req, res) => {
    const admin = await db.one('SELECT role FROM users WHERE id=$1', [req.user.id]);
    if (admin?.role !== 'admin') {
      res.status(403).json({ error: 'Administrator access required' });
      return false;
    }
    return true;
  };

  app.get('/api/admin/posts', authenticate, async (req, res, next) => {
    try {
      if (!await requireAdmin(req, res)) return;
      const rows = await db.many("SELECT * FROM posts WHERE status <> 'Encerrado' ORDER BY created_at DESC LIMIT 200");
      return res.json({ posts: await Promise.all(rows.map((row) => postView(db, row, req.user.id))) });
    } catch (error) { return next(error); }
  });

  app.delete('/api/admin/posts/:id', authenticate, async (req, res, next) => {
    try {
      if (!await requireAdmin(req, res)) return;
      const removed = await db.transaction(async (client) => {
        const post = await client.query('SELECT id FROM posts WHERE id=$1 FOR UPDATE', [req.params.id]);
        if (!post.rowCount) return false;
        const financial = await client.query('SELECT p.id FROM payments p JOIN negotiations n ON n.id=p.negotiation_id WHERE n.post_id=$1 LIMIT 1', [req.params.id]);
        if (financial.rowCount) {
          await client.query("UPDATE posts SET status='Encerrado', reserved_by=NULL, updated_at=now() WHERE id=$1", [req.params.id]);
          await client.query('DELETE FROM favorites WHERE post_id=$1', [req.params.id]);
          await client.query("DELETE FROM reports WHERE target_type='post' AND target_id=$1", [req.params.id]);
          return 'archived';
        }
        await client.query("DELETE FROM reports WHERE target_type='post' AND target_id=$1", [req.params.id]);
        await client.query('DELETE FROM posts WHERE id=$1', [req.params.id]);
        return true;
      });
      if (!removed) return res.status(404).json({ error: 'Post not found' });
      return res.json({ ok: true, archived: removed === 'archived' });
    } catch (error) { return next(error); }
  });

  app.get('/api/admin/reports', authenticate, async (req, res, next) => {
    try {
      if (!await requireAdmin(req, res)) return;
      const reports = await db.many("SELECT reports.*, users.name AS reporter_name FROM reports JOIN users ON users.id=reports.reporter_id ORDER BY CASE reports.status WHEN 'pending' THEN 0 ELSE 1 END, reports.created_at DESC LIMIT 200");
      return res.json({ reports: reports.map((item) => ({ id: item.id, targetType: item.target_type, targetId: item.target_id, reason: item.reason, details: item.details, status: item.status, createdAt: item.created_at, reporterName: item.reporter_name })) });
    } catch (error) { return next(error); }
  });

  app.patch('/api/admin/reports/:id', authenticate, async (req, res, next) => {
    try {
      if (!await requireAdmin(req, res)) return;
      const status = String(req.body?.status || '').trim();
      if (!['pending', 'reviewed', 'resolved', 'dismissed'].includes(status)) return res.status(400).json({ error: 'Invalid report status' });
      const report = await db.one('UPDATE reports SET status=$1, reviewed_at=now(), reviewed_by=$2 WHERE id=$3 RETURNING id', [status, req.user.id, req.params.id]);
      if (!report) return res.status(404).json({ error: 'Report not found' });
      return res.json({ ok: true });
    } catch (error) { return next(error); }
  });

  app.get('/api/admin/collection-points', authenticate, async (req, res, next) => {
    try {
      if (!await requireAdmin(req, res)) return;
      const points = await db.many('SELECT * FROM collection_points ORDER BY name ASC');
      const suggestions = await db.many('SELECT s.*,u.name AS user_name FROM collection_point_suggestions s JOIN users u ON u.id=s.user_id ORDER BY s.created_at DESC');
      return res.json({
        points: points.map((row) => ({ id: row.id, name: row.name, categories: json(row.categories_json), hours: row.hours, location: row.location, status: row.status, origin: row.origin, lastUpdated: row.last_updated, latitude: row.latitude, longitude: row.longitude })),
        suggestions: suggestions.map((row) => ({ id: row.id, name: row.name, categories: json(row.categories_json), hours: row.hours, location: row.location, status: row.status, createdAt: row.created_at, userName: row.user_name, latitude: row.latitude, longitude: row.longitude }))
      });
    } catch (error) { return next(error); }
  });
  app.post('/api/admin/collection-points', authenticate, async (req, res, next) => {
    try {
      if (!await requireAdmin(req, res)) return;
      const body = req.body || {};
      const name = String(body.name || '').trim();
      const address = buildCollectionPointAddress(body);
      const location = address.location;
      const hours = String(body.hours || 'Horário não informado').trim();
      const categories = Array.isArray(body.categories) ? body.categories.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 30) : [];
      if (!name || !location || name.length > 160 || location.length > 240 || hours.length > 160) return res.status(400).json({ error: 'Name and location are required' });
      const geocoded = await geocodeCollectionPoint(address);
      const point = await db.one('INSERT INTO collection_points(id,name,categories_json,hours,location,status,origin,last_updated,latitude,longitude) VALUES($1,$2,$3,$4,$5,$6,$7,now(),$8,$9) RETURNING *', [id('point'), name, JSON.stringify(categories), hours, location, String(body.status || 'Aberto').trim(), String(body.origin || 'ReUsa+').trim(), body.latitude ?? geocoded?.latitude ?? null, body.longitude ?? geocoded?.longitude ?? null]);
      return res.status(201).json({ point: { id: point.id, name: point.name, categories: json(point.categories_json), hours: point.hours, location: point.location, status: point.status, origin: point.origin, lastUpdated: point.last_updated, latitude: point.latitude, longitude: point.longitude } });
    } catch (error) { return next(error); }
  });
  const updateCollectionPoint = async (req, res, next) => {
    try {
      if (!await requireAdmin(req, res)) return;
      const current = await db.one('SELECT * FROM collection_points WHERE id=$1', [req.params.id]);
      if (!current) return res.status(404).json({ error: 'Collection point not found' });
      const body = req.body || {};
      const name = String(body.name ?? current.name).trim();
      const address = buildCollectionPointAddress({ ...body, location: body.location ?? current.location });
      const location = address.location;
      const hours = String(body.hours ?? current.hours).trim();
      const categories = Array.isArray(body.categories) ? body.categories.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 30) : json(current.categories_json);
      if (!name || !location || name.length > 160 || location.length > 240 || hours.length > 160) return res.status(400).json({ error: 'Name and location are required' });
      const geocoded = await geocodeCollectionPoint(address);
      const point = await db.one('UPDATE collection_points SET name=$1,categories_json=$2,hours=$3,location=$4,status=$5,origin=$6,last_updated=now(),latitude=$7,longitude=$8 WHERE id=$9 RETURNING *', [name, JSON.stringify(categories), hours, location, String(body.status ?? current.status).trim(), String(body.origin ?? current.origin).trim(), body.latitude ?? geocoded?.latitude ?? current.latitude, body.longitude ?? geocoded?.longitude ?? current.longitude, current.id]);
      return res.json({ point: { id: point.id, name: point.name, categories: json(point.categories_json), hours: point.hours, location: point.location, status: point.status, origin: point.origin, lastUpdated: point.last_updated, latitude: point.latitude, longitude: point.longitude } });
    } catch (error) { return next(error); }
  };
  app.put('/api/admin/collection-points/:id', authenticate, updateCollectionPoint);
  app.patch('/api/admin/collection-points/:id', authenticate, updateCollectionPoint);
  app.delete('/api/admin/collection-points/:id', authenticate, async (req, res, next) => {
    try {
      if (!await requireAdmin(req, res)) return;
      const result = await db.query('DELETE FROM collection_points WHERE id=$1', [req.params.id]);
      if (!result.rowCount) return res.status(404).json({ error: 'Collection point not found' });
      return res.json({ ok: true });
    } catch (error) { return next(error); }
  });
  app.patch('/api/admin/collection-point-suggestions/:id', authenticate, async (req, res, next) => {
    try {
      if (!await requireAdmin(req, res)) return;
      const decision = String(req.body?.decision || '').trim();
      if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'Invalid decision' });
      const suggestion = await db.one('SELECT * FROM collection_point_suggestions WHERE id=$1', [req.params.id]);
      if (!suggestion || suggestion.status !== 'pending') return res.status(404).json({ error: 'Pending suggestion not found' });
      const result = await db.transaction(async (client) => {
        let point = null;
        if (decision === 'approved') {
          point = (await client.query('SELECT * FROM collection_points WHERE lower(name)=lower($1) AND lower(location)=lower($2) LIMIT 1', [suggestion.name, suggestion.location])).rows[0];
          if (!point) {
            point = (await client.query('INSERT INTO collection_points(id,name,categories_json,hours,location,status,origin,last_updated,latitude,longitude) VALUES($1,$2,$3,$4,$5,$6,$7,now(),$8,$9) RETURNING *', [id('point'), suggestion.name, suggestion.categories_json, suggestion.hours || 'Horário não informado', suggestion.location, 'Aberto', 'Comunidade ReUsa+', suggestion.latitude, suggestion.longitude])).rows[0];
          }
        }
        await client.query('UPDATE collection_point_suggestions SET status=$1,reviewed_at=now(),reviewed_by=$2 WHERE id=$3', [decision, req.user.id, suggestion.id]);
        return point;
      });
      return res.json({ ok: true, point: result ? { id: result.id, name: result.name, categories: json(result.categories_json), hours: result.hours, location: result.location, status: result.status, origin: result.origin, lastUpdated: result.last_updated, latitude: result.latitude, longitude: result.longitude } : null });
    } catch (error) { return next(error); }
  });

  app.get('/api/distributed/status', async (_req, res, next) => {
    try { const pending = await db.one('SELECT COUNT(*)::int AS count FROM event_outbox WHERE published_at IS NULL'); const delivered = await db.one('SELECT COUNT(*)::int AS count FROM event_outbox WHERE published_at IS NOT NULL'); return res.json({ brokerConfigured: Boolean(process.env.AMQP_URL), delivery: 'at-least-once', pendingEvents: pending.count, deliveredEvents: delivered.count }); } catch (error) { return next(error); }
  });
}

module.exports = { registerPostgresRoutes };
