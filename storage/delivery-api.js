const crypto = require('node:crypto');
const error = (status, message) => { throw Object.assign(new Error(message), { status }); };

// The same state machine backs SQLite and PostgreSQL. No QR code is evidence of
// receipt: only the authenticated recipient can acknowledge an actual handover.
function registerDeliveryRoutes(app, { postgres, sqlite, authenticate, flush, refreshMetrics, clock = () => new Date() }) {
  let tail = Promise.resolve();
  const work = (fn) => {
    if (postgres) return postgres.transaction(fn);
    const pending = tail.then(async () => {
      const client = { query: async (sql, params = []) => ({ rows: sqlite.all(sql.replace(/\$\d+/g, '?'), params) }) };
      sqlite.run('BEGIN');
      try { const result = await fn(client); sqlite.run('COMMIT'); sqlite.persist(); return result; }
      catch (e) { try { sqlite.run('ROLLBACK'); } catch {} throw e; }
    });
    tail = pending.catch(() => {});
    return pending;
  };
  const rows = async (c, sql, params = []) => (await c.query(sql, params)).rows;
  const one = async (...args) => (await rows(...args))[0];
  const route = fn => async (req, res, next) => {
    try { await fn(req, res, next); } catch (e) { if (e.status) return res.status(e.status).json({ error: e.message }); next(e); }
  };
  const negotiation = async (c, id, userId) => {
    const n = await one(c, `SELECT * FROM negotiations WHERE id=$1${postgres ? ' FOR UPDATE' : ''}`, [id]);
    if (!n) error(404, 'Negociação não encontrada.');
    if (![n.owner_id, n.interested_id].includes(userId)) error(403, 'Esta negociação é privada.');
    return n;
  };
  const sale = async (c, n) => (await one(c, 'SELECT goal FROM posts WHERE id=$1', [n.post_id]))?.goal === 'Venda';
  const payment = (c, id) => one(c, "SELECT id,status,dispute_status,refund_status FROM payments WHERE negotiation_id=$1 AND status IN ('processing','succeeded') ORDER BY created_at DESC LIMIT 1", [id]);
  const delivery = (c, id) => one(c, 'SELECT * FROM collection_deliveries WHERE negotiation_id=$1', [id]);
  const notice = async (c, userId, title, text, n) => c.query('INSERT INTO notifications(id,user_id,type,title,text,link,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)', [crypto.randomUUID(), userId, 'negotiation', title, text, `/anuncios/${n.post_id}`, new Date().toISOString()]);
  const emit = async (c, type, data, req) => c.query('INSERT INTO event_outbox(id,type,payload_json,correlation_id,created_at) VALUES($1,$2,$3,$4,$5)', [crypto.randomUUID(), type, JSON.stringify(data), req.correlationId || 'system', new Date().toISOString()]);
  const validAgreement = d => d && ['confirmed','in_transit'].includes(d.status) && d.proposed_by && d.accepted_by && d.proposed_by !== d.accepted_by;
  const view = async (c, d, n, userId) => {
    if (!d) return null;
    const paid = await payment(c, n.id);
    const isSale = await sale(c, n);
    const settled = paid?.status === 'succeeded' && (!paid.dispute_status || ['won','warning_closed'].includes(paid.dispute_status)) && !['requested','pending','requires_action'].includes(paid.refund_status);
    const point = d.collection_point_id ? await one(c, 'SELECT id,name,location FROM collection_points WHERE id=$1', [d.collection_point_id]) : null;
    const expired = new Date(d.confirmation_token_expires_at).getTime() < Date.now();
    const locked = Boolean(d.payment_locked || paid);
    return { id: d.id, negotiationId: n.id, mode: d.mode, scheduledFor: d.scheduled_for, address: d.address,
      collectionPoint: point, status: d.status, proposedBy: d.proposed_by, acceptedBy: d.accepted_by,
      acceptedAt: d.accepted_at, receivedAt: d.received_at, paymentLocked: locked, expired,
      canAccept: n.status === 'reserved' && d.status === 'scheduled' && Boolean(d.proposed_by) && d.proposed_by !== userId && !expired,
      canCancel: ['scheduled','confirmed'].includes(d.status) && (!locked || (d.status === 'scheduled' && !d.accepted_by)),
      canDispatch: n.status === 'reserved' && userId === n.owner_id && validAgreement(d) && d.status === 'confirmed' && !expired && (!isSale || settled),
      canReceive: n.status === 'reserved' && userId === n.interested_id && validAgreement(d) && (!isSale || settled),
      paymentReady: validAgreement(d) && !expired && n.status === 'reserved',
      incidents: await rows(c, 'SELECT i.id,i.kind,i.detail,i.created_at AS created_at,u.name AS reporter_name FROM delivery_incidents i JOIN users u ON u.id=i.reporter_id WHERE delivery_id=$1 ORDER BY i.created_at DESC LIMIT 20', [d.id]),
      paymentStatus: paid?.status || null, paymentAttemptKey: userId === n.interested_id && !paid && d.payment_locked ? d.payment_attempt_key : null };
  };
  app.get('/api/negotiations', authenticate, route(async (req, res) => {
    const items = await work(async c => {
      const all = await rows(c, `SELECT n.*,p.title,p.image_url,p.goal,p.location,owner.name AS owner_name,buyer.name AS buyer_name
        FROM negotiations n JOIN posts p ON p.id=n.post_id JOIN users owner ON owner.id=n.owner_id JOIN users buyer ON buyer.id=n.interested_id
        WHERE n.owner_id=$1 OR n.interested_id=$2 ORDER BY n.updated_at DESC`, [req.user.id,req.user.id]);
      return Promise.all(all.map(async n => {
        const d=await delivery(c,n.id);
        const p=await one(c,'SELECT status,amount_cents,method FROM payments WHERE negotiation_id=$1 ORDER BY created_at DESC LIMIT 1',[n.id]);
        const owner=n.owner_id===req.user.id;
        let stage='decision', label='Aguardando resposta', action=owner;
        if(n.status==='completed') {stage='completed';label='Concluída';action=false;}
        else if(n.status==='cancelled'||n.proposal_status==='rejected'){stage='closed';label=n.proposal_status==='cancelled'?'Oferta cancelada':'Oferta encerrada';action=false;}
        else if(n.status==='reserved') {
          if(!d||d.status==='cancelled'){stage='agreement';label='Combinar entrega';action=true;}
          else if(d.status==='scheduled'){stage='agreement';label='Aguardando aceite da entrega';action=d.proposed_by!==req.user.id;}
          else if(n.goal==='Venda'&&p?.status!=='succeeded'){stage='payment';label=p?.status==='processing'?'Aguardando confirmação do pagamento':'Aguardando pagamento';action=!owner&&p?.status!=='processing';}
          else{stage=owner?'delivery':'receipt';label=owner?'Preparar entrega':'Confirmar recebimento';action=true;}
        }
        const incident=d?await one(c,'SELECT detail,created_at FROM delivery_incidents WHERE delivery_id=$1 ORDER BY created_at DESC LIMIT 1',[d.id]):null;
        return {id:n.id,postId:n.post_id,title:n.title,imageUrl:n.image_url,goal:n.goal,location:n.location,
          role:owner?'owner':'interested',counterparty:owner?n.buyer_name:n.owner_name,threadId:n.thread_id,stage,label,needsYourAction:action,
          canCancelOffer:!owner&&n.goal==='Venda'&&n.status==='interested'&&n.proposal_status==='pending'&&!d&&!p,
          proposalCreatedAt:n.proposal_created_at||null,
          amountCents:Number(p?.amount_cents||n.proposal_amount_cents||0),paymentStatus:p?.status||null,scheduledFor:d&&!['cancelled'].includes(d.status)?d.scheduled_for:null,
          deliveryStatus:d?.status||null,incident:incident||null,updatedAt:n.updated_at};
      }));
    });
    res.json({negotiations:items});
  }));
  app.post('/api/negotiations/:id/cancel-offer', authenticate, route(async (req, res) => {
    const expected=typeof req.body?.expectedProposalCreatedAt==='string'?Date.parse(req.body.expectedProposalCreatedAt):NaN;
    if(!Number.isFinite(expected))error(400,'Atualize a oferta antes de solicitar o cancelamento.');
    await work(async c => {
      // Seller decisions lock post first, then negotiation. Use the same order
      // so acceptance and withdrawal cannot race or deadlock.
      const target=await one(c,'SELECT post_id FROM negotiations WHERE id=$1',[req.params.id]);
      if(!target)error(404,'Negociação não encontrada.');
      const post=await one(c,`SELECT * FROM posts WHERE id=$1${postgres?' FOR UPDATE':''}`,[target.post_id]);
      const n=await negotiation(c,req.params.id,req.user.id);
      if(n.interested_id!==req.user.id)error(403,'Somente quem enviou a oferta pode cancelá-la.');
      if(new Date(n.proposal_created_at).getTime()!==expected)error(409,'A oferta foi atualizada. Confira a nova oferta antes de cancelar.');
      if(n.status==='cancelled'&&n.proposal_status==='cancelled')return;
      if(!post||post.goal!=='Venda'||n.status!=='interested'||n.proposal_status!=='pending')error(409,'Somente uma oferta aguardando resposta pode ser cancelada.');
      if(await delivery(c,n.id)||await one(c,'SELECT id FROM payments WHERE negotiation_id=$1 LIMIT 1',[n.id]))error(409,'Esta negociação já avançou para entrega ou pagamento.');
      await c.query("UPDATE negotiations SET status='cancelled',proposal_status='cancelled',updated_at=$1 WHERE id=$2",[clock().toISOString(),n.id]);
      await notice(c,n.owner_id,'Oferta cancelada',`A pessoa interessada cancelou a oferta enviada para ${post.title}.`,n);
      await emit(c,'negotiation.offer_cancelled',{negotiationId:n.id,postId:n.post_id,ownerId:n.owner_id,interestedId:n.interested_id},req);
    });
    void flush();res.json({ok:true,cancelled:true});
  }));
  app.post('/api/negotiations/:id/withdraw-purchase', authenticate, route(async (req, res) => {
    let refundRequested = false;
    await work(async c => {
      const target = await one(c, 'SELECT post_id FROM negotiations WHERE id=$1', [req.params.id]);
      if (!target) error(404, 'Negociação não encontrada.');
      const post = await one(c, `SELECT * FROM posts WHERE id=$1${postgres ? ' FOR UPDATE' : ''}`, [target.post_id]);
      const n = await negotiation(c, req.params.id, req.user.id);
      if (n.interested_id !== req.user.id) error(403, 'Somente o comprador pode desistir da compra.');
      if (!(await sale(c, n))) error(409, 'Esta negociação não é uma compra.');
      if (n.status === 'completed') error(409, 'Esta compra já foi concluída e não pode ser cancelada.');
      if (!post) error(404, 'Anúncio não encontrado.');
      if (n.status === 'cancelled') return;

      const currentPayment = await one(c, 'SELECT * FROM payments WHERE negotiation_id=$1 ORDER BY created_at DESC LIMIT 1', [n.id]);
      if (currentPayment && ['processing', 'succeeded'].includes(currentPayment.status) && currentPayment.provider_reference?.startsWith('cs_')) {
        refundRequested = currentPayment.refund_status === 'requested' || currentPayment.refund_status === 'pending' || currentPayment.refund_status === 'requires_action';
        if (!refundRequested) {
          await c.query("UPDATE payments SET refund_status='requested',refund_requested_at=$1,reconcile_after=$1,updated_at=$1 WHERE id=$2", [clock().toISOString(), currentPayment.id]);
          refundRequested = true;
        }
      }

      const now = clock().toISOString();
      await c.query("UPDATE collection_deliveries SET status='cancelled',updated_at=$1 WHERE negotiation_id=$2 AND status<>'completed'", [now, n.id]);
      await c.query("UPDATE negotiations SET status='cancelled',proposal_status='cancelled',updated_at=$1 WHERE id=$2", [now, n.id]);
      await c.query("UPDATE posts SET status='Disponível',reserved_by=NULL,updated_at=$1 WHERE id=$2", [now, post.id]);
      await notice(c, n.owner_id, 'Compra cancelada', `${req.user.name} desistiu da compra de ${post.title}. O anúncio está disponível novamente.`, n);
      await emit(c, 'negotiation.purchase_withdrawn', { negotiationId:n.id, postId:post.id, ownerId:n.owner_id, interestedId:n.interested_id, refundRequested }, req);
    });
    void flush();
    res.json({ ok: true, cancelled: true, refundRequested });
  }));
  app.post('/api/collection-deliveries/:id/incidents', authenticate, route(async (req,res) => {
    const kind=req.body?.kind, detail=typeof req.body?.detail==='string'?req.body.detail.trim():'';
    if(!['delay','cannot_attend','location','other'].includes(kind)||detail.length<10||detail.length>500)error(400,'Escolha o tipo de imprevisto e descreva o ocorrido em 10 a 500 caracteres.');
    await work(async c=>{
      const d=await one(c,'SELECT * FROM collection_deliveries WHERE id=$1',[req.params.id]);
      if(!d)error(404,'Entrega não encontrada.');
      const n=await negotiation(c,d.negotiation_id,req.user.id);
      if(n.status!=='reserved'||!['scheduled','confirmed','in_transit'].includes(d.status))error(409,'Esta entrega não está ativa para registrar imprevistos.');
      const duplicate=await one(c,'SELECT id FROM delivery_incidents WHERE delivery_id=$1 AND reporter_id=$2 AND kind=$3 AND detail=$4 AND created_at>$5',[d.id,req.user.id,kind,detail,new Date(clock().getTime()-300000).toISOString()]);
      if(duplicate)return;
      await c.query('INSERT INTO delivery_incidents(id,delivery_id,reporter_id,kind,detail,created_at) VALUES($1,$2,$3,$4,$5,$6)',[crypto.randomUUID(),d.id,req.user.id,kind,detail,clock().toISOString()]);
      await notice(c,req.user.id===n.owner_id?n.interested_id:n.owner_id,'Imprevisto na entrega',`${req.user.name} informou um imprevisto. Confira os detalhes no acordo e combine a solução pelo chat.`,n);
      await emit(c,'collection.incident_reported',{negotiationId:n.id,collectionId:d.id,reporterId:req.user.id,kind},req);
    });
    void flush();res.status(201).json({ok:true});
  }));
  app.post('/api/negotiations/:id/cancel-acceptance', authenticate, route(async (req, res) => {
    await work(async c => {
      const n = await negotiation(c, req.params.id, req.user.id);
      if (n.owner_id !== req.user.id) error(403, 'Somente o anunciante pode cancelar o aceite.');
      if (n.status !== 'reserved' || n.proposal_status !== 'accepted') error(409, 'Esta oferta não tem um aceite ativo para cancelar.');
      const post = await one(c, `SELECT * FROM posts WHERE id=$1${postgres ? ' FOR UPDATE' : ''}`, [n.post_id]);
      if (post?.goal !== 'Venda' || post.status !== 'Reservado' || post.reserved_by !== n.interested_id) error(409, 'A reserva atual não corresponde a esta oferta.');
      // Any persisted delivery/payment step means the buyer has advanced,
      // even if that step was later cancelled or the payment failed.
      if (await delivery(c, n.id) || await one(c, 'SELECT id FROM payments WHERE negotiation_id=$1 LIMIT 1', [n.id])) {
        error(409, 'O aceite não pode ser cancelado: esta negociação já avançou para entrega ou pagamento.');
      }
      const now = new Date().toISOString();
      await c.query("UPDATE negotiations SET status='interested',proposal_status='rejected',updated_at=$1 WHERE id=$2", [now, n.id]);
      await c.query("UPDATE posts SET status='Disponível',reserved_by=NULL,updated_at=$1 WHERE id=$2", [now, post.id]);
      await notice(c, n.interested_id, 'Aceite da oferta cancelado', `O anunciante retirou o aceite da sua oferta em ${post.title}. Nenhum pagamento foi iniciado.`, n);
      await emit(c, 'negotiation.acceptance_cancelled', { negotiationId:n.id, postId:post.id, ownerId:n.owner_id, interestedId:n.interested_id }, req);
    });
    void flush(); res.json({ ok:true });
  }));
  app.get('/api/negotiations/:id/collection', authenticate, route(async (req, res) => {
    const result = await work(async c => { const n = await negotiation(c, req.params.id, req.user.id); return view(c, await delivery(c, n.id), n, req.user.id); });
    res.json({ collection: result });
  }));
  app.post('/api/negotiations/:id/collection', authenticate, route(async (req, res) => {
    const mode = req.body?.mode;
    const date = new Date(req.body?.scheduledFor);
    const address = typeof req.body?.address === 'string' ? req.body.address.trim() : '';
    const pointId = typeof req.body?.collectionPointId === 'string' ? req.body.collectionPointId.trim() : '';
    if (!['pickup','dropoff'].includes(mode) || !Number.isFinite(date.getTime()) || date.getTime() < Date.now() + 1800000 || date.getTime() > Date.now() + 7776000000) error(400, 'Escolha uma data entre 30 minutos e 90 dias a partir de agora.');
    if (mode === 'pickup' && (address.length < 10 || address.length > 240)) error(400, 'Informe o endereço e o local do encontro (10 a 240 caracteres).');
    const result = await work(async c => {
      const n = await negotiation(c, req.params.id, req.user.id);
      if (n.status !== 'reserved') error(409, 'Reserve o item antes de combinar a entrega.');
      const old = await delivery(c, n.id);
      const existingPayment = await payment(c, n.id);
      if ((existingPayment || old?.payment_locked) && old?.proposed_by && old.status !== 'cancelled') error(409, 'Há pagamento em andamento ou aprovado. A entrega não pode ser alterada; combine a solução pelo chat.');
      if (old && old.status !== 'cancelled') error(409, 'Cancele a proposta anterior antes de propor outro horário ou local.');
      let point;
      if (mode === 'dropoff') {
        point = pointId && await one(c, 'SELECT * FROM collection_points WHERE id=$1', [pointId]);
        if (!point || /fechado|inativo/i.test(point.status || '')) error(400, 'Selecione um ponto de coleta aberto. Confirme previamente se ele permite esse encontro.');
      }
      const now = new Date().toISOString();
      const id = old?.id || crypto.randomUUID();
      if (old) await c.query('DELETE FROM collection_deliveries WHERE id=$1', [id]);
      await c.query("INSERT INTO collection_deliveries(id,negotiation_id,mode,scheduled_for,address,collection_point_id,status,confirmation_token_hash,confirmation_token_expires_at,qr_code_data_url,created_at,updated_at,proposed_by,payment_locked) VALUES($1,$2,$3,$4,$5,$6,'scheduled',$7,$8,$9,$10,$11,$12,0)",
        [id, n.id, mode, date.toISOString(), mode === 'pickup' ? address : `${point.name} · ${point.location}`, mode === 'dropoff' ? pointId : null, '', new Date(date.getTime()+86400000).toISOString(), '', now, now, req.user.id]);
      await notice(c, req.user.id === n.owner_id ? n.interested_id : n.owner_id, 'Confirme a entrega proposta', 'Confira local, data e horário antes de aceitar. O pagamento só será liberado após o aceite.', n);
      await emit(c, 'collection.proposed', { negotiationId: n.id, postId: n.post_id, proposedBy: req.user.id }, req);
      return view(c, await delivery(c, n.id), n, req.user.id);
    });
    void flush(); res.status(201).json({ collection: result });
  }));
  const change = async (req, res, action) => {
    const result = await work(async c => {
      const initial = await one(c, 'SELECT negotiation_id FROM collection_deliveries WHERE id=$1', [req.params.id]);
      if (!initial) error(404, 'Entrega não encontrada.');
      const n = await negotiation(c, initial.negotiation_id, req.user.id);
      const d = await delivery(c, n.id);
      const current = await view(c, d, n, req.user.id);
      const now = new Date().toISOString();
      if (action === 'accept') {
        if (!current.canAccept) error(409, 'Somente a outra pessoa pode aceitar uma proposta de entrega válida.');
        await c.query("UPDATE collection_deliveries SET status='confirmed',accepted_by=$1,accepted_at=$2,updated_at=$3 WHERE id=$4", [req.user.id, now, now, d.id]);
      } else if (action === 'cancelled') {
        if (!current.canCancel) error(409, 'Esta entrega não pode ser cancelada: verifique o pagamento ou o recebimento.');
        await c.query("UPDATE collection_deliveries SET status='cancelled',updated_at=$1 WHERE id=$2", [now, d.id]);
      } else if (action === 'in_transit') {
        if (!current.canDispatch) error(409, 'Somente o anunciante pode iniciar a entrega após o acordo e, em vendas, o pagamento aprovado.');
        await c.query("UPDATE collection_deliveries SET status='in_transit',updated_at=$1 WHERE id=$2", [now, d.id]);
      } else if (action === 'completed') {
        if (d.status === 'completed' && req.user.id === n.interested_id) return view(c, d, n, req.user.id);
        if (!current.canReceive) error(409, 'Somente quem recebe pode confirmar, após o acordo de entrega e o pagamento aprovado em vendas.');
        const post = await one(c, 'SELECT * FROM posts WHERE id=$1', [n.post_id]);
        if (post.status !== 'Reservado' || post.reserved_by !== n.interested_id) error(409, 'A reserva não corresponde a esta entrega.');
        const outcome = post.goal === 'Venda' ? 'Vendido' : post.goal === 'Troca' ? 'Trocado' : 'Doado';
        await c.query("UPDATE collection_deliveries SET status='completed',received_at=$1,confirmed_at=$2,updated_at=$3 WHERE id=$4", [now, now, now, d.id]);
        await c.query("UPDATE negotiations SET status='completed',completed_at=$1,updated_at=$2 WHERE id=$3", [now, now, n.id]);
        await c.query("UPDATE negotiations SET status='cancelled',proposal_status=CASE WHEN proposal_status='pending' THEN 'rejected' ELSE proposal_status END,updated_at=$1 WHERE post_id=$2 AND id<>$3 AND status='interested'", [now, n.post_id, n.id]);
        await c.query('UPDATE posts SET status=$1,completed_with=$2,completed_at=$3,updated_at=$4 WHERE id=$5', [outcome, n.interested_id, now, now, n.post_id]);
        await emit(c, 'negotiation.completed', { negotiationId: n.id, postId: n.post_id, postTitle: post.title, ownerId: n.owner_id, interestedId: n.interested_id, outcome, completedAt: now }, req);
      } else error(400, 'Etapa de entrega inválida.');
      await notice(c, req.user.id === n.owner_id ? n.interested_id : n.owner_id, action === 'completed' ? 'Recebimento confirmado' : 'Entrega atualizada', action === 'completed' ? 'Quem recebeu o item confirmou a entrega. A negociação foi concluída.' : 'Confira o acordo e o acompanhamento no anúncio.', n);
      await emit(c, 'collection.updated', { negotiationId: n.id, collectionId: d.id, action, actorId: req.user.id }, req);
      return view(c, await delivery(c, n.id), n, req.user.id);
    });
    if (!postgres && action === 'completed') refreshMetrics?.();
    void flush(); res.json({ collection: result });
  };
  app.post('/api/collection-deliveries/:id/accept', authenticate, route((req, res) => change(req, res, 'accept')));
  app.post('/api/collection-deliveries/:id/confirm', authenticate, route((req, res) => change(req, res, 'completed')));
  app.patch('/api/collection-deliveries/:id/status', authenticate, route((req, res) => change(req, res, req.body?.status)));

  // Claim the immutable agreement before any provider request. Its lock survives
  // a dropped connection; a failed response releases it only without live payment.
  app.post('/api/negotiations/:id/payment', authenticate, route(async (req, res, next) => {
    await work(async c => {
      const n = await negotiation(c, req.params.id, req.user.id);
      if (n.interested_id !== req.user.id) error(403, 'Somente o comprador pode pagar.');
      if (n.status !== 'reserved') error(409, 'A negociação precisa estar reservada para o comprador.');
      if (!await sale(c, n)) error(400, 'Pagamentos são exclusivos para vendas.');
      const reservedPost = await one(c, 'SELECT status,reserved_by FROM posts WHERE id=$1', [n.post_id]);
      if (reservedPost?.status !== 'Reservado' || reservedPost.reserved_by !== n.interested_id) error(409, 'A reserva deste anúncio não pertence a esta negociação.');
      const d = await delivery(c, n.id);
      if (!validAgreement(d) || new Date(d.confirmation_token_expires_at).getTime() < Date.now()) error(409, 'Antes de pagar, combine local e horário da entrega e aguarde o aceite da outra pessoa.');
      const live = await payment(c, n.id);
      const replay = await one(c, 'SELECT id FROM payments WHERE negotiation_id=$1 AND idempotency_key=$2', [n.id, String(req.body?.idempotencyKey || '')]);
      const sameAttempt = !live && d.payment_attempt_key && d.payment_attempt_key === String(req.body?.idempotencyKey || '');
      if ((live || d.payment_locked) && !replay && !sameAttempt) error(409, 'Já existe um pagamento em andamento ou concluído. Consulte seu status antes de tentar novamente.');
      await c.query('UPDATE collection_deliveries SET payment_locked=1,payment_attempt_key=$1 WHERE negotiation_id=$2', [String(req.body?.idempotencyKey || ''), n.id]);
    });
    res.once('finish', () => {
      if ((res.statusCode >= 400 && res.statusCode < 500) || res.statusCode === 503) void work(async c => {
        await negotiation(c, req.params.id, req.user.id);
        if (!await payment(c, req.params.id)) await c.query('UPDATE collection_deliveries SET payment_locked=0 WHERE negotiation_id=$1', [req.params.id]);
      }).catch(e => console.error('[delivery-lock]', e.message));
    });
    next();
  }));
  for (const method of ['post','patch']) app[method]('/api/negotiations/:id/proposal', authenticate, route(async (req, res, next) => {
    await work(async c => {
      const n = await negotiation(c, req.params.id, req.user.id);
      const d = await delivery(c, n.id);
      if (await payment(c, n.id) || d?.payment_locked || (d && !['cancelled'].includes(d.status))) error(409, 'A entrega ou pagamento já está vinculado à proposta. Não é possível alterar valor ou reserva agora.');
    });
    next();
  }));
  // Legacy completion buttons cannot bypass recipient acknowledgement.
  app.post('/api/posts/:id/complete', authenticate, route(async (req, res) => {
    error(409, 'A negociação é concluída quando quem recebe confirma o recebimento em Coleta e entrega.');
  }));
  for (const [method, path] of [['patch','/api/posts/:id/status'],['post','/api/posts/:id/reserve'],['put','/api/posts/:id'],['delete','/api/posts/:id'],['delete','/api/admin/posts/:id']]) {
    app[method](path, authenticate, route(async (req, res, next) => {
      await work(async c => {
        if (path === '/api/admin/posts/:id' && req.user?.role === 'admin') {
          const active = await rows(c, "SELECT id FROM negotiations WHERE post_id=$1 AND status<>'cancelled'", [req.params.id]);
          if (!active.length) return;
        }
        const active = await rows(c, 'SELECT id FROM negotiations WHERE post_id=$1', [req.params.id]);
        for (const n of active) {
          const d = await delivery(c, n.id);
          if (await payment(c, n.id) || d?.payment_locked || (d && !['cancelled','completed'].includes(d.status))) error(409, 'Há uma entrega ou pagamento vinculado. Cancele o acordo pendente antes de alterar a reserva; pagamentos em andamento ou aprovados exigem resolução com a outra pessoa.');
          if (d?.status === 'completed') error(409, 'Este item já teve o recebimento confirmado.');
        }
      });
      next();
    }));
  }
  let reminding=false;
  async function runReminders(now=clock()) {
    if(reminding)return;
    reminding=true;
    try {
      await work(async c=>{
        const deliveries=await rows(c,`SELECT d.*,n.owner_id,n.interested_id,n.post_id,p.title FROM collection_deliveries d
          JOIN negotiations n ON n.id=d.negotiation_id JOIN posts p ON p.id=n.post_id
          WHERE d.status IN ('confirmed','in_transit') AND n.status='reserved' AND d.scheduled_for>$1 AND d.scheduled_for<=$2`,[now.toISOString(),new Date(now.getTime()+86400000).toISOString()]);
        for(const d of deliveries){
          const distance=new Date(d.scheduled_for).getTime()-now.getTime();
          if(distance<=0||distance>86400000)continue;
          const kind=distance<=3600000?'1h':'24h';
          for(const userId of [d.owner_id,d.interested_id]){
            const inserted=await c.query('INSERT INTO delivery_reminders(delivery_id,user_id,scheduled_for,kind) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[d.id,userId,new Date(d.scheduled_for).toISOString(),kind]);
            const claimed=postgres?inserted.rowCount:(await one(c,'SELECT changes() AS count')).count;
            if(!claimed)continue;
            const date=new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(d.scheduled_for));
            await notice(c,userId,'Lembrete da entrega',`${d.title}: encontro em ${date} (Brasília). ${kind==='1h'?'Falta até 1 hora.':'Faltam até 24 horas.'} Confira o acordo e avise se houver um imprevisto.`,d);
          }
        }
      });
    } finally { reminding=false; }
  }
  return {runReminders};

}
module.exports = { registerDeliveryRoutes };
