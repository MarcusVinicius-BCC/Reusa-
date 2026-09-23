const crypto = require('crypto');
const jwt = require('jsonwebtoken');

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

function userView(row) {
  if (!row) return null;
  return {
    id: row.id, name: row.name, email: row.email, city: row.city,
    neighborhood: row.neighborhood || '', cep: row.cep || '', address: row.address || '',
    accountType: row.account_type || 'person', businessName: row.business_name || '',
    cnpj: row.cnpj || '', interests: json(row.interests_json), avatar: row.avatar || '',
    rating: Number(row.rating || 0), donations: Number(row.donations || 0),
    received: Number(row.received || 0), carbonSavedPercent: Number(row.carbon_saved_percent || 0),
    achievements: json(row.achievements_json), role: row.role || 'user',
    suspended: Boolean(row.suspended), notificationPreferences: json(row.notification_preferences_json)
  };
}

async function postView(db, row, viewerId) {
  const [author, interest, reputation, saved, liked] = await Promise.all([
    db.one('SELECT id,name,city,neighborhood,account_type,business_name,avatar FROM users WHERE id=$1', [row.author_id]),
    db.one("SELECT COUNT(*)::int AS count FROM negotiations WHERE post_id=$1 AND status IN ('interested','reserved','completed')", [row.id]),
    db.one('SELECT COALESCE(ROUND(AVG(rating),1),0)::float AS average, COUNT(*)::int AS count FROM reviews WHERE reviewee_id=$1', [row.author_id]),
    viewerId ? db.one('SELECT 1 FROM favorites WHERE user_id=$1 AND post_id=$2', [viewerId, row.id]) : null,
    viewerId ? db.one('SELECT 1 FROM post_likes WHERE user_id=$1 AND post_id=$2', [viewerId, row.id]) : null
  ]);
  return {
    id: row.id, authorId: row.author_id,
    author: author && { id: author.id, name: author.name, city: author.city, neighborhood: author.neighborhood || '', accountType: author.account_type, businessName: author.business_name || '', avatar: author.avatar || '' },
    title: row.title, description: row.description, category: row.category, condition: row.condition,
    goal: row.goal, imageUrl: row.image_url, likes: Number(row.likes), comments: Number(row.comments),
    location: row.location, createdAt: row.created_at, chipIcon: row.chip_icon, chipLabel: row.chip_label,
    status: row.status, views: Number(row.views || 0), interestedCount: Number(interest?.count || 0),
    saved: Boolean(saved), liked: Boolean(liked), updatedAt: row.updated_at || row.created_at,
    authorReputation: Number(reputation?.average || 0), authorReviewCount: Number(reputation?.count || 0)
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

function registerPostgresRoutes(app, { db, jwtSecret, createToken, uid, publisher, upload }) {
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
      const normalizedEmail = String(email || '').trim().toLowerCase();
      if (!String(name || '').trim() || !normalizedEmail || String(password || '').length < 8 || !String(city || '').trim()) return res.status(400).json({ error: 'Missing required fields' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return res.status(400).json({ error: 'Invalid email address' });
      const user = { id: id('user'), name: String(name).trim(), email: normalizedEmail, password_hash: passwordHash(password), city: String(city).trim(), neighborhood: String(neighborhood).trim(), cep: String(cep).trim(), address: String(address).trim(), account_type: accountType, business_name: String(businessName).trim(), cnpj: String(cnpj).replace(/\D/g, ''), interests_json: JSON.stringify(Array.isArray(interests) ? interests : []), avatar: '', achievements_json: JSON.stringify(['Novo membro']), created_at: new Date().toISOString(), last_active_at: new Date().toISOString() };
      const created = await db.transaction(async (client) => {
        if (await client.query('SELECT 1 FROM users WHERE lower(email)=lower($1)', [normalizedEmail]).then((r) => r.rowCount)) throw Object.assign(new Error('Email already registered'), { status: 409 });
        await client.query(`INSERT INTO users (id,name,email,password_hash,city,neighborhood,cep,address,account_type,business_name,cnpj,interests_json,avatar,achievements_json,created_at,last_active_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`, Object.values(user));
        return client.query('SELECT * FROM users WHERE id=$1', [user.id]).then((r) => r.rows[0]);
      });
      return res.status(201).json({ token: createToken(created.id), user: userView(created) });
    } catch (error) { return next(error); }
  });

  app.post('/api/auth/login', async (req, res, next) => {
    try {
      const row = await db.one('SELECT * FROM users WHERE lower(email)=lower($1)', [String(req.body?.email || '').trim()]);
      if (!row || !verifyPassword(req.body?.password, row.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
      await db.query('UPDATE users SET last_active_at=now() WHERE id=$1', [row.id]);
      return res.json({ token: createToken(row.id), user: userView(row) });
    } catch (error) { return next(error); }
  });
  app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: req.user }));

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
    try { const rows = await db.many('SELECT p.* FROM favorites f JOIN posts p ON p.id=f.post_id WHERE f.user_id=$1 ORDER BY f.created_at DESC', [req.user.id]); return res.json({ posts: await Promise.all(rows.map((row) => postView(db, row, req.user.id))) }); } catch (error) { return next(error); }
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
  app.post('/api/posts', authenticate, upload.single('image'), async (req, res, next) => {
    try {
      const body = req.body || {};
      const imageUrl = req.file ? (req.file.location || `/uploads/${req.file.filename}`) : String(body.imageUrl || '').trim();
      if (!String(body.title || '').trim() || !String(body.description || '').trim() || !String(body.category || '').trim() || !imageUrl) return res.status(400).json({ error: 'Missing required fields' });
      const post = { id: id('post'), author_id: req.user.id, title: String(body.title).trim(), description: String(body.description).trim(), category: String(body.category).trim(), condition: String(body.condition || 'Bom estado'), goal: String(body.goal || 'Doação'), image_url: imageUrl, location: String(body.location || req.user.city), created_at: new Date().toISOString(), chip_icon: String(body.chipIcon || 'volunteer_activism'), chip_label: String(body.chipLabel || body.goal || 'Doação') };
      const created = await db.transaction(async (client) => { await client.query('INSERT INTO posts(id,author_id,title,description,category,condition,goal,image_url,location,created_at,chip_icon,chip_label) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', Object.values(post)); await client.query('INSERT INTO threads(id,post_id,participants_json,last_message_at) VALUES($1,$2,$3,$4)', [id('thread'), post.id, JSON.stringify([req.user.id]), post.created_at]); return client.query('SELECT * FROM posts WHERE id=$1', [post.id]).then((r) => r.rows[0]); });
      return res.status(201).json({ post: await postView(db, created, req.user.id) });
    } catch (error) { return next(error); }
  });
  app.post('/api/posts/:id/reserve', authenticate, async (req, res, next) => {
    try {
      const result = await db.transaction(async (client) => {
        const postResult = await client.query('SELECT * FROM posts WHERE id=$1 FOR UPDATE', [req.params.id]);
        const post = postResult.rows[0]; if (!post) throw Object.assign(new Error('Post not found'), { status: 404 });
        if (post.author_id !== req.user.id) throw Object.assign(new Error('Only the owner can reserve this post'), { status: 403 });
        if (!['Disponível', 'Reservado'].includes(post.status)) throw Object.assign(new Error('This post is no longer available'), { status: 400 });
        const negotiation = (await client.query("SELECT * FROM negotiations WHERE post_id=$1 AND interested_id=$2 AND status <> 'cancelled'", [post.id, req.body?.interestedId])).rows[0];
        if (!negotiation) throw Object.assign(new Error('Choose a user who demonstrated interest'), { status: 400 });
        await client.query("UPDATE negotiations SET status='interested',updated_at=now() WHERE post_id=$1 AND status='reserved'", [post.id]);
        await client.query("UPDATE negotiations SET status='reserved',updated_at=now() WHERE id=$1", [negotiation.id]);
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
        last_message.text AS last_message_text
        FROM threads t
        JOIN posts p ON p.id=t.post_id
        JOIN LATERAL jsonb_array_elements_text(t.participants_json::jsonb) participant ON true
        JOIN users u ON u.id=participant AND u.id <> $1
        LEFT JOIN LATERAL (SELECT text FROM messages WHERE thread_id=t.id ORDER BY sent_at DESC LIMIT 1) last_message ON true
        WHERE t.participants_json::jsonb @> $2::jsonb
        ORDER BY t.last_message_at DESC`, [req.user.id, JSON.stringify([req.user.id])]);
      return res.json({ threads: rows.map((row) => ({
        id: row.id,
        postId: row.post_id,
        title: row.other_user_name,
        avatar: row.other_user_avatar || '',
        subtitle: row.last_message_text || row.post_title,
        time: new Date(row.last_message_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        unreadCount: Number(row.unread_count || 0)
      })) });
    } catch (error) { return next(error); }
  });
  app.get('/api/messages/threads/:id', authenticate, async (req, res, next) => {
    try {
      const thread = await db.one('SELECT * FROM threads WHERE id=$1 AND participants_json::jsonb @> $2::jsonb', [req.params.id, JSON.stringify([req.user.id])]);
      if (!thread) return res.status(404).json({ error: 'Thread not found' });
      const messages = await db.many('SELECT * FROM messages WHERE thread_id=$1 ORDER BY sent_at ASC', [thread.id]);
      await db.query('UPDATE threads SET unread_count=0 WHERE id=$1', [thread.id]);
      const otherUserId = json(thread.participants_json).find((item) => item !== req.user.id);
      const otherUser = otherUserId ? await db.one('SELECT id,name,avatar FROM users WHERE id=$1', [otherUserId]) : null;
      return res.json({ thread: { ...thread, title: otherUser?.name || 'Conversa', avatar: otherUser?.avatar || '' }, participants: json(thread.participants_json), messages });
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
      const rows = await db.many('SELECT id,type,title,text,link,created_at AS "createdAt",read_at AS "readAt" FROM notification_service_notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', [req.user.id]);
      return res.json({ notifications: rows });
    } catch (error) { return next(error); }
  });
  app.post('/api/notifications/:id/read', authenticate, async (req, res, next) => {
    try {
      await db.query('UPDATE notification_service_notifications SET read_at=now() WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
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
      const posts = await db.many('SELECT * FROM posts WHERE author_id=$1 ORDER BY created_at DESC', [req.user.id]);
      const reputation = await db.one('SELECT COALESCE(ROUND(AVG(rating),1),0)::float AS rating, COUNT(*)::int AS count FROM reviews WHERE reviewee_id=$1', [req.user.id]);
      return res.json({ user: userView(profile), stats: { donations: Number(profile.donations || 0), received: Number(profile.received || 0), rating: Number(reputation?.rating || 0), carbonSavedPercent: Number(profile.carbon_saved_percent || 0) }, achievements: json(profile.achievements_json), reputation, reviews: [], posts: await Promise.all(posts.map((row) => postView(db, row, req.user.id))) });
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
      if (!['person', 'business'].includes(accountType)) return res.status(400).json({ error: 'Invalid account type' });
      if (accountType === 'business' && (!businessName || cnpj.length !== 14)) return res.status(400).json({ error: 'Business accounts require a legal name and valid CNPJ' });
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

  app.post('/api/posts/:id/complete', authenticate, async (req, res, next) => {
    try {
      const post = await db.one('SELECT * FROM posts WHERE id=$1', [req.params.id]);
      if (!post) return res.status(404).json({ error: 'Post not found' });
      if (post.author_id !== req.user.id) return res.status(403).json({ error: 'Only the owner can complete this post' });
      const outcome = String(req.body?.outcome || '').trim();
      if (!post.reserved_by || post.status !== 'Reservado') return res.status(400).json({ error: 'Reserve the item before completing the negotiation' });
      if (!['Doado', 'Trocado'].includes(outcome)) return res.status(400).json({ error: 'Choose Doado or Trocado as the outcome' });
      const negotiation = await db.one("SELECT * FROM negotiations WHERE post_id=$1 AND interested_id=$2 AND status='reserved'", [post.id, post.reserved_by]);
      if (!negotiation) return res.status(400).json({ error: 'Reserved negotiation not found' });

      const now = new Date().toISOString();
      await db.transaction(async (client) => {
        await client.query("UPDATE negotiations SET status='completed', completed_at=$1, updated_at=$1 WHERE id=$2", [now, negotiation.id]);
        await client.query('UPDATE posts SET status=$1, completed_with=$2, completed_at=$3, updated_at=$3 WHERE id=$4', [outcome, post.reserved_by, now, post.id]);
        await emit(client, 'negotiation.completed', { negotiationId: negotiation.id, postId: post.id, postTitle: post.title, ownerId: post.author_id, interestedId: post.reserved_by, outcome, completedAt: now }, req.correlationId);
      });
      return res.json({ post: await postView(db, await db.one('SELECT * FROM posts WHERE id=$1', [post.id]), req.user.id), negotiationId: negotiation.id });
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
      const totals = await db.one(`SELECT COUNT(*)::int AS total_users, (SELECT COUNT(*)::int FROM users WHERE suspended=false AND last_active_at >= $1)::int AS active_users, (SELECT COUNT(*)::int FROM posts)::int AS total_posts, (SELECT COUNT(*)::int FROM posts WHERE status IN ('Disponível','Reservado'))::int AS active_posts, (SELECT COUNT(*)::int FROM posts WHERE status='Doado')::int AS donations, (SELECT COUNT(*)::int FROM posts WHERE status='Trocado')::int AS exchanges, (SELECT COUNT(*)::int FROM collection_points)::int AS collection_points, (SELECT COUNT(*)::int FROM reports WHERE status='pending')::int AS reports, (SELECT COUNT(*)::int FROM users WHERE last_active_at >= $1)::int AS new_users FROM users`, [since]);
      const categories = await db.many('SELECT category, COUNT(*)::int AS count FROM posts GROUP BY category ORDER BY count DESC LIMIT 8');
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

  app.get('/api/distributed/status', async (_req, res, next) => {
    try { const pending = await db.one('SELECT COUNT(*)::int AS count FROM event_outbox WHERE published_at IS NULL'); const delivered = await db.one('SELECT COUNT(*)::int AS count FROM event_outbox WHERE published_at IS NOT NULL'); return res.json({ brokerConfigured: Boolean(process.env.AMQP_URL), delivery: 'at-least-once', pendingEvents: pending.count, deliveredEvents: delivered.count }); } catch (error) { return next(error); }
  });
}

module.exports = { registerPostgresRoutes };
