const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const schema = fs.readFileSync(path.join(__dirname, '../migrations/012_community_campaigns.sql'), 'utf8');
const fail = (status, message) => { const error = new Error(message); error.status = status; throw error; };
function text(value, min, max, label) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) fail(400, `${label}: informe entre ${min} e ${max} caracteres.`);
  return value.trim();
}
function quantity(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100000) fail(400, 'Quantidade deve ser um inteiro entre 1 e 100000.');
  return value;
}
function registerCampaignRoutes(app, { postgres, sqlite, authenticate, flush }) {
  // All SQLite campaign work is serialized, including transaction callbacks.
  let tail = Promise.resolve();
  const execute = (work, write = false) => {
    if (postgres) return write ? postgres.transaction(work) : work(postgres);
    const pending = tail.then(async () => {
      const client = { query: async (sql, params = []) => ({ rows: sqlite.all(sql.replace(/\$\d+/g, '?'), params) }) };
      if (write) sqlite.run('BEGIN');
      try {
        const result = await work(client);
        if (write) { sqlite.run('COMMIT'); sqlite.persist(); }
        return result;
      } catch (error) { if (write) sqlite.run('ROLLBACK'); throw error; }
    });
    tail = pending.catch(() => {});
    return pending;
  };
  const route = (handler) => async (req, res, next) => {
    try { await handler(req, res); } catch (error) {
      if (error.status) return res.status(error.status).json({ error: error.message });
      next(error);
    }
  };
  const many = async (client, sql, params = []) => (await client.query(sql, params)).rows;
  const one = async (...args) => (await many(...args))[0];
  const emit = async (client, type, data, req) => {
    await client.query('INSERT INTO event_outbox(id,type,payload_json,correlation_id,created_at) VALUES($1,$2,$3,$4,$5)',
      [crypto.randomUUID(), type, JSON.stringify(data), req.correlationId || 'system', new Date().toISOString()]);
  };
  const notify = async (client, userId, title, message) => {
    await client.query('INSERT INTO notifications(id,user_id,type,title,text,link,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [crypto.randomUUID(), userId, 'system', title, message, '/feed', new Date().toISOString()]);
  };
  const campaign = async (client, id, lock = false) => {
    const row = await one(client, `SELECT * FROM campaigns WHERE id=$1${lock && postgres ? ' FOR UPDATE' : ''}`, [id]);
    if (!row) fail(404, 'Campanha não encontrada.');
    return row;
  };
  const view = async (client, row) => {
    const sums = await one(client, `SELECT COALESCE(SUM(CASE WHEN status='received' THEN quantity ELSE 0 END),0) AS received,
      COALESCE(SUM(CASE WHEN status='pledged' THEN quantity ELSE 0 END),0) AS pledged FROM campaign_contributions WHERE campaign_id=$1`, [row.id]);
    const owner = await one(client, 'SELECT name FROM users WHERE id=$1', [row.owner_id]);
    const received = Number(sums.received), pledged = Number(sums.pledged);
    return { ...row, ownerName: owner?.name || 'Organizador', received, pledged, remaining: Math.max(0, row.target - received),
      accepting: row.status === 'active' && row.deadline >= new Date().toISOString().slice(0, 10) && received < row.target };
  };
  app.get('/api/campaigns', route(async (_req, res) => {
    const campaigns = await execute(async (client) => {
      const rows = await many(client, 'SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 100');
      return Promise.all(rows.map(row => view(client, row)));
    });
    res.json({ campaigns });
  }));
  app.post('/api/campaigns', authenticate, route(async (req, res) => {
    const b = req.body || {};
    const data = { title: text(b.title, 5, 100, 'Título'), description: text(b.description, 20, 2000, 'Objetivo'),
      beneficiary: text(b.beneficiary, 3, 120, 'Beneficiário'), material: text(b.material, 2, 80, 'Material'),
      target: quantity(b.target), city: text(b.city, 3, 100, 'Cidade'), logistics: text(b.logistics, 10, 500, 'Entrega ou retirada'),
      deadline: text(b.deadline, 10, 10, 'Prazo') };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.deadline) || !Number.isFinite(Date.parse(`${data.deadline}T23:59:59Z`)) || new Date(`${data.deadline}T00:00:00Z`).toISOString().slice(0,10) !== data.deadline || data.deadline < new Date().toISOString().slice(0,10)) fail(400, 'Informe uma data válida a partir de hoje.');
    const id = crypto.randomUUID();
    await execute(async client => {
      await client.query('INSERT INTO campaigns(id,owner_id,title,description,beneficiary,material,target,city,logistics,deadline,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
        [id, req.user.id, data.title, data.description, data.beneficiary, data.material, data.target, data.city, data.logistics, data.deadline, new Date().toISOString()]);
      await emit(client, 'campaign.created', { campaignId: id, ownerId: req.user.id }, req);
    }, true);
    void flush(); res.status(201).json({ id });
  }));
  app.get('/api/campaigns/:id/contributions', authenticate, route(async (req, res) => {
    const contributions = await execute(async client => {
      const c = await campaign(client, req.params.id);
      return many(client, `SELECT cc.*, u.name AS donor_name FROM campaign_contributions cc JOIN users u ON u.id=cc.donor_id
        WHERE cc.campaign_id=$1${c.owner_id !== req.user.id ? ' AND cc.donor_id=$2' : ''} ORDER BY cc.created_at DESC`, c.owner_id === req.user.id ? [c.id] : [c.id, req.user.id]);
    });
    res.json({ contributions });
  }));
  app.post('/api/campaigns/:id/contributions', authenticate, route(async (req, res) => {
    const amount = quantity(req.body?.quantity);
    const note = text(req.body?.note, 10, 500, 'Como combinar a entrega');
    const id = crypto.randomUUID();
    await execute(async client => {
      const c = await campaign(client, req.params.id, true);
      if (c.owner_id === req.user.id) fail(400, 'Você não pode contribuir na própria campanha.');
      if (await one(client, 'SELECT blocker_id FROM blocked_users WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$3 AND blocked_id=$4)', [req.user.id, c.owner_id, c.owner_id, req.user.id])) fail(403, 'Não é possível contribuir entre usuários bloqueados.');
      if (!(await view(client, c)).accepting) fail(409, 'Esta campanha não está recebendo contribuições.');
      await client.query('INSERT INTO campaign_contributions(id,campaign_id,donor_id,quantity,note,created_at) VALUES($1,$2,$3,$4,$5,$6)', [id, c.id, req.user.id, amount, note, new Date().toISOString()]);
      await notify(client, c.owner_id, 'Nova contribuição na campanha', `${req.user.name} ofereceu ${amount} unidades para ${c.title}. Veja os detalhes no feed.`);
      await emit(client, 'campaign.contribution_pledged', { campaignId: c.id, contributionId: id, donorId: req.user.id, quantity: amount }, req);
    }, true);
    void flush(); res.status(201).json({ id });
  }));
  app.patch('/api/campaigns/:id/contributions/:contributionId', authenticate, route(async (req, res) => {
    const status = req.body?.status;
    if (!['received','cancelled'].includes(status)) fail(400, 'Status inválido.');
    await execute(async client => {
      const c = await campaign(client, req.params.id, true);
      const contribution = await one(client, 'SELECT * FROM campaign_contributions WHERE id=$1 AND campaign_id=$2', [req.params.contributionId, c.id]);
      if (!contribution) fail(404, 'Contribuição não encontrada.');
      if (status === 'received' ? c.owner_id !== req.user.id : c.owner_id !== req.user.id && contribution.donor_id !== req.user.id) fail(403, 'Você não tem permissão para esta ação.');
      if (contribution.status === status) return;
      if (contribution.status !== 'pledged') fail(409, 'Esta contribuição já foi finalizada.');
      await client.query('UPDATE campaign_contributions SET status=$1 WHERE id=$2', [status, contribution.id]);
      await notify(client, contribution.donor_id, status === 'received' ? 'Doação recebida' : 'Contribuição cancelada', `Sua contribuição para ${c.title} foi ${status === 'received' ? 'recebida' : 'cancelada'}.`);
      await emit(client, `campaign.contribution_${status}`, { campaignId: c.id, contributionId: contribution.id, quantity: contribution.quantity }, req);
    }, true);
    void flush(); res.json({ ok: true });
  }));
  app.patch('/api/campaigns/:id/contributions/:contributionId/reply', authenticate, route(async (req, res) => {
    const reply = text(req.body?.reply, 10, 500, 'Resposta de entrega');
    await execute(async client => {
      const c = await campaign(client, req.params.id, true);
      if (c.owner_id !== req.user.id) fail(403, 'Somente o organizador pode responder.');
      const item = await one(client, 'SELECT * FROM campaign_contributions WHERE id=$1 AND campaign_id=$2', [req.params.contributionId, c.id]);
      if (!item) fail(404, 'Contribuição não encontrada.');
      if (item.status !== 'pledged') fail(409, 'Esta contribuição já foi finalizada.');
      await client.query('UPDATE campaign_contributions SET reply=$1 WHERE id=$2', [reply, item.id]);
      await notify(client, item.donor_id, 'Combine a entrega da doação', `O organizador respondeu à sua oferta em ${c.title}. Consulte sua contribuição no feed.`);
      await emit(client, 'campaign.delivery_replied', { campaignId: c.id, contributionId: item.id }, req);
    }, true);
    void flush(); res.json({ ok: true });
  }));
  app.patch('/api/campaigns/:id/close', authenticate, route(async (req, res) => {
    await execute(async client => {
      const c = await campaign(client, req.params.id, true);
      if (c.owner_id !== req.user.id) fail(403, 'Somente o organizador pode encerrar a campanha.');
      if (c.status === 'closed') return;
      await client.query("UPDATE campaigns SET status='closed' WHERE id=$1", [c.id]);
      await emit(client, 'campaign.closed', { campaignId: c.id }, req);
    }, true);
    void flush(); res.json({ ok: true });
  }));
}
module.exports = { registerCampaignRoutes, campaignSchema: schema };
