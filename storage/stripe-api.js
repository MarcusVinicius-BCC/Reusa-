'use strict';
const crypto = require('node:crypto');
const stripe = require('../services/stripe-payments');
const fail = (status, message) => { throw Object.assign(new Error(message), {status}); };
const parse = value => { try { return JSON.parse(value || '{}'); } catch { return {}; } };
const accountColumn = () => stripe.liveMode() ? 'stripe_live_account_id' : 'stripe_test_account_id';
const accountVersionColumn = () => stripe.liveMode() ? 'stripe_live_account_version' : 'stripe_test_account_version';
const accountVersion = user => user[accountVersionColumn()]==='v2'?'v2':'v1';
const inaccessibleAccount = error => ['forbidden','permission_error','resource_missing'].includes(error?.stripeCode) && !error.uncertain;
const objectId = value => typeof value === 'string' ? value : value?.id;
const closedDispute = status => !status || ['won','warning_closed'].includes(status);
function paymentView(p) {
  if (!p) return null;
  const isStripe = Boolean(p.provider_reference?.startsWith('cs_') || p.provider_request_json);
  return {id:p.id, negotiationId:p.negotiation_id, payerId:p.payer_id, payeeId:p.payee_id,
    amountCents:Number(p.amount_cents), currency:p.currency, method:p.method, status:p.status,
    providerReference:p.provider_reference, checkoutUrl:isStripe ? p.checkout_url : null, failureCode:p.failure_code,
    createdAt:p.created_at, updatedAt:p.updated_at, paidAt:p.paid_at, refundedAt:p.refunded_at,
    refundedAmountCents:Number(p.refunded_amount_cents || 0), disputeStatus:p.dispute_status,
    refundStatus:p.refund_status, testMode:p.provider_livemode===0, provider:isStripe ? 'stripe' : p.provider_reference?.startsWith('test_') ? 'test' : 'unavailable'};
}

function registerStripeRoutes(app, {postgres, sqlite, authenticate, jwt, jwtSecret, clock=()=>new Date()}) {
  let tail=Promise.resolve();
  const work=fn => {
    if (postgres) return postgres.transaction(fn);
    const pending=tail.then(async()=>{
      const c={query:async(sql,params=[])=>({rows:sqlite.all(sql.replace(/\$\d+/g,'?'),params)})};
      sqlite.run('BEGIN');
      try { const out=await fn(c); sqlite.run('COMMIT'); sqlite.persist(); return out; }
      catch(e) { try {sqlite.run('ROLLBACK');} catch {} throw e; }
    });
    tail=pending.catch(()=>{}); return pending;
  };
  const rows=async(c,q,p=[])=>(await c.query(q,p)).rows;
  const one=async(...args)=>(await rows(...args))[0];
  const now=()=>clock().toISOString();
  const later=ms=>new Date(clock().getTime()+ms).toISOString();
  const lock=postgres?' FOR UPDATE':'';
  const queryOne=(q,p=[])=>work(c=>one(c,q,p));
  const route=fn=>async(req,res,next)=>{
    try {await fn(req,res,next);} catch(e) {
      if(e.stripeCode)console.error('[stripe-api]', {requestId:req.correlationId||null,route:req.route?.path||null,stripeRequestId:e.stripeRequestId||null,code:e.stripeCode});
      if(e.status)return res.status(e.status).json({error:e.message,requestId:req.correlationId||undefined,stripeRequestId:e.stripeRequestId||undefined});
      next(e);
    }
  };
  const notice=(c,user,title,text,link)=>c.query('INSERT INTO notifications(id,user_id,type,title,text,link,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[crypto.randomUUID(),user,'payment',title,text,link,now()]);
  const negotiation=async(c,id,user)=>{
    const n=await one(c,'SELECT * FROM negotiations WHERE id=$1'+lock,[id]);
    if(!n)fail(404,'Negociação não encontrada.');
    if(![n.owner_id,n.interested_id].includes(user))fail(403,'Esta negociação é privada.'); return n;
  };
  const audit=(c,p,status,reason,correlation)=>c.query('INSERT INTO payment_audit_events(id,payment_id,from_status,to_status,reason,correlation_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[crypto.randomUUID(),p.id,p.status,status,reason,correlation||crypto.randomUUID(),now()]);
  const hasAccountPayments = (c,id) => one(c,'SELECT id FROM payments WHERE provider_account_id=$1 LIMIT 1',[id]);
  async function sellerStatus(userId) {
    const user=await queryOne('SELECT * FROM users WHERE id=$1',[userId]);
    if(!user)fail(404,'Usuário não encontrado.');
    const id=user[accountColumn()];
    if(!id)return {...stripe.sellerView(null),accountId:null,demoMode:stripe.demoEnabled(),testMode:stripe.isTestEnvironment(),liveMode:stripe.liveMode(),connectEnabled:process.env.STRIPE_CONNECT_ENABLED==='true'};
    let account;
    try { account=await stripe.connectedAccount(id,accountVersion(user),{accessCheck:true}); }
    catch(error) {
      if(!inaccessibleAccount(error))throw error;
      const payments=await work(c=>hasAccountPayments(c,id));
      return {...stripe.sellerView(null),connected:true,accountId:id,disabledReason:'account_access_denied',
        accountVersion:accountVersion(user),demoMode:stripe.demoEnabled(),testMode:stripe.isTestEnvironment(),liveMode:stripe.liveMode(),
        connectEnabled:process.env.STRIPE_CONNECT_ENABLED==='true',
        canRestartTestConnection:stripe.isTestEnvironment()&&process.env.STRIPE_CONNECT_ENABLED==='true'&&!payments,
        recoveryBlockedByPayments:Boolean(payments)};
    }
    const view=stripe.sellerView(account);
    await work(c=>c.query('UPDATE users SET stripe_status_json=$1,stripe_checked_at=$2 WHERE id=$3',[JSON.stringify(view),now(),userId]));
    return {...view,accountId:id,demoMode:stripe.demoEnabled(),testMode:stripe.isTestEnvironment(),liveMode:stripe.liveMode(),connectEnabled:process.env.STRIPE_CONNECT_ENABLED==='true'};
  }
  const onboardingLink=async(userId,accountId,version)=>{
    const state=jwt.sign({purpose:'stripe-onboarding',sub:userId,accountId,live:stripe.liveMode()},jwtSecret,{expiresIn:'15m'});
    const base=String(process.env.APP_BASE_URL).replace(/\/$/,'');
    return stripe.accountLink(accountId,base+'/api/payments/stripe/refresh?state='+encodeURIComponent(state),base+'/configuracoes?stripe_onboarding=1',version);
  };
  app.get('/api/payments/stripe/status',authenticate,route(async(req,res)=>{
    res.json(await sellerStatus(req.user.id));
  }));
  app.get('/api/payments/stripe/connect',authenticate,route(async(req,res)=>{
    stripe.requireReady();
    if(process.env.STRIPE_CONNECT_ENABLED!=='true')fail(503,'O cadastro de vendedores ainda não foi habilitado na plataforma.');
    const user=await queryOne('SELECT * FROM users WHERE id=$1',[req.user.id]);
    let accountId=user[accountColumn()];
    let version=accountVersion(user);
    if(!accountId){
      const created=await stripe.createConnectedAccount(user.email,'reusa-seller-v2-'+(stripe.liveMode()?'live-':'test-')+user.id);
      if(!/^acct_[A-Za-z0-9]+$/.test(created?.id||'')||created.object!=='v2.core.account')fail(502,'A Stripe não retornou uma conta de vendedor válida. Retome o cadastro.');
      await work(c=>c.query('UPDATE users SET '+accountColumn()+'=$1,stripe_account_id=$2,'+accountVersionColumn()+"='v2' WHERE id=$3 AND "+accountColumn()+' IS NULL',[created.id,created.id,user.id]));
      const stored=await queryOne('SELECT * FROM users WHERE id=$1',[user.id]);accountId=stored[accountColumn()];version=accountVersion(stored);
    }
    const link=await onboardingLink(user.id,accountId,version);res.json({authorizationUrl:link.url});
  }));
  app.post('/api/payments/stripe/reconnect-test',authenticate,route(async(req,res)=>{
    stripe.requireReady();
    if(!stripe.isTestEnvironment())fail(403,'A recuperação de conexão está disponível somente no ambiente de teste.');
    if(process.env.STRIPE_CONNECT_ENABLED!=='true')fail(503,'O cadastro de vendedores ainda não foi habilitado na plataforma.');
    const user=await queryOne('SELECT * FROM users WHERE id=$1',[req.user.id]);
    const previousId=user?.stripe_test_account_id;
    if(!previousId||req.body?.expectedAccountId!==previousId)fail(409,'O vínculo da conta mudou. Atualize a situação antes de continuar.');
    if(await work(c=>hasAccountPayments(c,previousId)))fail(409,'Esta conta possui pagamentos vinculados. Ajuste a chave ou as permissões com o suporte para preservar a conciliação.');
    let denied;
    try { await stripe.connectedAccount(previousId,accountVersion(user),{accessCheck:true}); }
    catch(error) { if(!inaccessibleAccount(error))throw error;denied=error.stripeCode; }
    if(!denied)fail(409,'A conta atual está acessível. Continue o cadastro existente.');
    const key='reusa-reconnect-test-'+crypto.createHash('sha256').update(user.id+':'+previousId).digest('hex');
    const created=await stripe.createConnectedAccount(user.email,key);
    if(!/^acct_[A-Za-z0-9]+$/.test(created?.id||'')||created.object!=='v2.core.account'||created.id===previousId)fail(502,'A Stripe não retornou um novo cadastro de teste válido.');
    await work(async c=>{
      const current=await one(c,'SELECT * FROM users WHERE id=$1'+lock,[user.id]);
      if(current.stripe_test_account_id===created.id)return; // Concurrent retries share the provider idempotency key.
      if(current.stripe_test_account_id!==previousId)fail(409,'O vínculo da conta mudou. Atualize a situação antes de continuar.');
      if(await hasAccountPayments(c,previousId))fail(409,'A conta passou a ter pagamentos vinculados. Solicite suporte antes de alterar a conexão.');
      await c.query('INSERT INTO stripe_account_link_history(id,user_id,account_id,account_version,environment,replacement_account_id,reason,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [crypto.randomUUID(),user.id,previousId,accountVersion(user),'test',created.id,denied,now()]);
      await c.query("UPDATE users SET stripe_test_account_id=$1,stripe_test_account_version='v2',stripe_account_id=$2,stripe_status_json='{}',stripe_checked_at=NULL WHERE id=$3",
        [created.id,!current.stripe_account_id||current.stripe_account_id===previousId?created.id:current.stripe_account_id,user.id]);
    });
    // Save the new binding before requesting a short-lived link so a lost response can be resumed.
    console.info('[stripe-connect] test account replacement saved',{requestId:req.correlationId||null,previousAccountId:previousId,accountId:created.id});
    const link=await onboardingLink(user.id,created.id,'v2');
    console.info('[stripe-connect] test onboarding ready',{requestId:req.correlationId||null,accountId:created.id});
    res.json({authorizationUrl:link.url,accountId:created.id});
  }));
  app.get('/api/payments/stripe/refresh',route(async(req,res)=>{
    let state;
    try {state=jwt.verify(String(req.query.state||''),jwtSecret);} catch {return res.redirect('/configuracoes?stripe_onboarding=expired');}
    if(state.purpose!=='stripe-onboarding'||state.live!==stripe.liveMode())fail(403,'Retome o cadastro pelas configurações.');
    const user=await queryOne('SELECT * FROM users WHERE id=$1',[state.sub]);
    if(!user||user[accountColumn()]!==state.accountId)fail(403,'Cadastro inválido.');
    res.redirect((await onboardingLink(user.id,state.accountId,accountVersion(user))).url);
  }));
  app.post('/api/payments/stripe/dashboard',authenticate,route(async(req,res)=>{
    const user=await queryOne('SELECT * FROM users WHERE id=$1',[req.user.id]);
    if(!user?.[accountColumn()])fail(409,'Conecte sua conta Stripe primeiro.');
    res.json({url:(await stripe.dashboardLink(user[accountColumn()],accountVersion(user))).url});
  }));
  // Check the provider again before allowing the seller to reserve a sale.
  const sellerGate=route(async(req,res,next)=>{
    let post;
    if(req.params.id&&req.path.includes('/proposal')){
      if(req.body?.decision!=='accepted')return next();
      const n=await queryOne('SELECT * FROM negotiations WHERE id=$1',[req.params.id]);
      if(!n||n.owner_id!==req.user.id)return next();
      post=await queryOne('SELECT * FROM posts WHERE id=$1',[n.post_id]);
    }else post=await queryOne('SELECT * FROM posts WHERE id=$1',[req.params.id]);
    if(post?.goal!=='Venda'||post.author_id!==req.user.id)return next();
    if(stripe.demoEnabled())return next();
    if(!stripe.configured()&&process.env.NODE_ENV==='test')return next();
    stripe.requireReady();
    const status=await sellerStatus(req.user.id);
    if(!status.chargesEnabled||!status.payoutsEnabled)fail(409,'Conclua o cadastro Stripe e aguarde a liberação de cobranças e repasses antes de aceitar vendas.');
    next();
  });
  app.patch('/api/negotiations/:id/proposal',authenticate,sellerGate);
  app.post('/api/posts/:id/reserve',authenticate,sellerGate);

  async function applyPayment(id,state,reason) {
    return work(async c=>{
      const p=await one(c,'SELECT * FROM payments WHERE id=$1'+lock,[id]);
      if(!p)return null;
      const status=p.status==='refunded'?'refunded':p.status==='succeeded'&&state.status!=='refunded'?'succeeded':p.status==='failed'&&state.status==='processing'?'failed':state.status||p.status;
      const amount=Math.max(Number(p.refunded_amount_cents||0),Number(state.refundedAmount||0));
      const disputeStatus=state.disputeStatus===undefined?p.dispute_status:state.disputeStatus;
      const refundStatus=state.refundStatus===undefined?p.refund_status:state.refundStatus;
      const changed=status!==p.status||amount!==Number(p.refunded_amount_cents||0)||disputeStatus!==p.dispute_status||refundStatus!==p.refund_status;
      await c.query('UPDATE payments SET status=$1,failure_code=$2,provider_payment_intent=$3,refunded_amount_cents=$4,dispute_status=$5,dispute_id=$6,refund_status=$7,reconciled_at=$8,reconcile_after=$9,reconcile_until=NULL,updated_at=$10,paid_at=$11,refunded_at=$12 WHERE id=$13',
        [status,state.failureCode||null,state.intent||p.provider_payment_intent,amount,disputeStatus,state.disputeId||p.dispute_id,refundStatus,now(),later(300000),changed?now():p.updated_at,status==='succeeded'&&!p.paid_at?now():p.paid_at,status==='refunded'&&!p.refunded_at?now():p.refunded_at,p.id]);
      if(['failed','refunded'].includes(status))await c.query('UPDATE collection_deliveries SET payment_locked=0 WHERE negotiation_id=$1',[p.negotiation_id]);
      if(status==='refunded'&&p.status!=='refunded'){
        // A refund before handover cancels that agreement; it never certifies return of an item already received.
        const n=await one(c,'SELECT * FROM negotiations WHERE id=$1'+lock,[p.negotiation_id]);
        if(n?.status==='reserved'){
          await c.query("UPDATE collection_deliveries SET status='cancelled',updated_at=$1 WHERE negotiation_id=$2 AND status<>'completed'",[now(),n.id]);
          await c.query("UPDATE negotiations SET status='cancelled',updated_at=$1 WHERE id=$2",[now(),n.id]);
          await c.query("UPDATE posts SET status='Disponível',reserved_by=NULL,updated_at=$1 WHERE id=$2 AND status='Reservado' AND reserved_by=$3",[now(),n.post_id,n.interested_id]);
        }
      }
      if(changed){
        await audit(c,p,status,reason);
        const n=await one(c,'SELECT post_id FROM negotiations WHERE id=$1',[p.negotiation_id]);
        const title=!closedDispute(disputeStatus)?'Pagamento em contestação':status==='refunded'?'Pagamento reembolsado':refundStatus==='failed'?'Reembolso não concluído':amount>Number(p.refunded_amount_cents||0)?'Reembolso parcial registrado':status==='succeeded'?'Pagamento confirmado':status==='failed'?'Pagamento não concluído':'Pagamento atualizado';
        for(const user of [p.payer_id,p.payee_id])await notice(c,user,title,'Confira o pagamento e combine os próximos passos pelo acordo.','/anuncios/'+n.post_id);
        await c.query('INSERT INTO event_outbox(id,type,payload_json,correlation_id,created_at) VALUES($1,$2,$3,$4,$5)',[crypto.randomUUID(),'payment.'+status,JSON.stringify({paymentId:p.id,negotiationId:p.negotiation_id,status,refundedAmountCents:amount,disputeStatus}),crypto.randomUUID(),now()]);
      }
      return one(c,'SELECT * FROM payments WHERE id=$1',[id]);
    });
  }
  async function reconcilePayment(id,{force=false,disputeId,eventType}={}) {
    const p=await work(async c=>{
      const p=await one(c,'SELECT * FROM payments WHERE id=$1'+lock,[id]);
      if(!p||p.provider_livemode!=null&&Boolean(p.provider_livemode)!==stripe.liveMode())return null;
      if(p.reconcile_until&&p.reconcile_until>now())return null;
      if(!force&&p.reconcile_after&&p.reconcile_after>now())return null;
      await c.query('UPDATE payments SET reconcile_until=$1 WHERE id=$2',[later(120000),id]);return p;
    });
    if(!p)return queryOne('SELECT * FROM payments WHERE id=$1',[id]);
    try {
      if(p.provider_request_json&&p.provider_reference.startsWith('pending_')){
        // Stripe only retains idempotency keys for at least 24h. Never recreate an uncertain old request.
        if(clock().getTime()-new Date(p.created_at).getTime()>23*3600000)fail(503,'Pagamento em conciliação manual. Não inicie outra cobrança.');
        // Attempts persisted before dynamic methods must retain their original
        // payload when replayed with the same Stripe idempotency key.
        const created=await stripe.createCheckout({checkoutVersion:1,...parse(p.provider_request_json)});
        await work(c=>c.query('UPDATE payments SET provider_reference=$1,checkout_url=$2 WHERE id=$3',[created.id,created.checkoutUrl,id]));
        p.provider_reference=created.id;p.checkout_url=created.checkoutUrl;
      }
      if(!p.provider_reference.startsWith('cs_')){await work(c=>c.query('UPDATE payments SET reconcile_until=NULL WHERE id=$1',[id]));return p;}
      const session=await stripe.checkoutSession(p.provider_reference,p.provider_account_id||undefined);
      if(typeof session.livemode==='boolean'&&session.livemode!==Boolean(p.provider_livemode))fail(409,'Ambiente do pagamento divergente.');
      let status=stripe.verifiedSessionStatus(session,p,eventType),amount=Number(p.refunded_amount_cents||0),intent=objectId(session.payment_intent),ds=p.dispute_status,di=disputeId||p.dispute_id,rs=p.refund_status;
      if(intent&&status==='succeeded'){
        const pi=await stripe.paymentIntent(intent,p.provider_account_id||undefined);
        if(pi.id!==intent||Number(pi.amount)!==Number(p.amount_cents)||String(pi.currency).toUpperCase()!==p.currency||pi.metadata?.payment_id!==p.id)fail(409,'Pagamento Stripe divergente do acordo.');
        const charge=pi.latest_charge;
        if(charge&&typeof charge==='object'){
          amount=Number(charge.amount_refunded||0);
          if(charge.disputed&&!di){
            ds='needs_response';
            const found=(await stripe.disputes(intent,p.provider_account_id||undefined)).data?.[0];
            if(found)di=found.id;
          }
        }
        if(di){const d=await stripe.dispute(di,p.provider_account_id||undefined);if(objectId(d.payment_intent)!==intent)fail(409,'Contestação de outro pagamento.');ds=d.status;}
        if(p.refund_status==='requested'&&!p.refund_id){
          const listed=await stripe.refunds(intent,p.provider_account_id||undefined);
          let refund=listed.data?.find(r=>r.metadata?.payment_id===p.id);
          if(!refund){
            if(!p.refund_requested_at||clock().getTime()-new Date(p.refund_requested_at).getTime()>23*3600000)fail(503,'Reembolso em conciliação. Consulte o painel Stripe.');
            refund=await stripe.refund(intent,p.provider_account_id||undefined,p.id);
          }
          await work(c=>c.query('UPDATE payments SET refund_id=$1 WHERE id=$2',[refund.id,p.id]));p.refund_id=refund.id;
        }
        if(p.refund_id){const refund=await stripe.refundStatus(p.refund_id,p.provider_account_id||undefined);if(objectId(refund.payment_intent)!==intent)fail(409,'Reembolso de outro pagamento.');rs=refund.status;
          if(refund.status==='succeeded'&&amount<Number(p.amount_cents)){
            const refreshed=await stripe.paymentIntent(intent,p.provider_account_id||undefined);
            if(refreshed.latest_charge&&typeof refreshed.latest_charge==='object')amount=Number(refreshed.latest_charge.amount_refunded||0);
          }
        }
        if(amount>=Number(p.amount_cents))status='refunded';
      }
      return await applyPayment(id,{status,failureCode:status==='failed'?(eventType||p.failure_code||'checkout_failed'):null,refundedAmount:amount,intent,disputeStatus:ds,disputeId:di,refundStatus:rs},'stripe_reconciled');
    }catch(e){
      // A definitive rejection of a not-yet-created checkout is retryable with a new attempt. Network ambiguity stays locked.
      const definitive=p.provider_reference.startsWith('pending_')&&e.checkoutRejected===true;
      if(definitive)await applyPayment(id,{status:'failed',failureCode:e.stripeCode||'checkout_rejected'},'stripe_checkout_rejected');
      else {
        if(p.refund_status==='requested'&&!p.refund_id&&e.refundRejected===true)await applyPayment(id,{status:p.status,refundStatus:'failed',failureCode:e.stripeCode},'stripe_refund_rejected');
        await work(c=>c.query('UPDATE payments SET reconcile_until=NULL,reconcile_after=$1,failure_code=$2 WHERE id=$3',[later(60000),e.status===409?'provider_mismatch':'awaiting_reconciliation',id]));
      }
      throw e;
    }
  }

  app.get('/api/negotiations/:id/payment',authenticate,route(async(req,res)=>{
    const p=await work(async c=>{await negotiation(c,req.params.id,req.user.id);return one(c,'SELECT * FROM payments WHERE negotiation_id=$1 ORDER BY created_at DESC LIMIT 1',[req.params.id]);});
    let result=p;
    if(p&&(p.provider_reference.startsWith('cs_')||p.provider_request_json)&&stripe.configured()){
      try {result=await reconcilePayment(p.id);}catch(e){console.error('[stripe-reconcile]',{paymentId:p.id,status:e.status});}
    }
    res.json({payment:paymentView(result)});
  }));
  app.post('/api/negotiations/:id/payment',authenticate,route(async(req,res)=>{
    const amount=Number(req.body?.amountCents),currency=String(req.body?.currency||'BRL').toUpperCase(),method=req.body?.method,key=String(req.body?.idempotencyKey||'');
    if(!Number.isSafeInteger(amount)||amount<100||amount>100000000||currency!=='BRL'||!['card','pix'].includes(method))fail(400,'Informe valor válido em reais e uma forma de pagamento disponível.');
    if(method==='pix'&&process.env.STRIPE_PIX_ENABLED!=='true')fail(409,'Pix indisponível. Escolha cartão.');
    if(!/^[A-Za-z0-9._:-]{16,128}$/.test(key))fail(400,'Chave de tentativa de pagamento inválida.');
    const configured=stripe.configured();
    if(!configured&&process.env.NODE_ENV!=='test')fail(503,'Pagamentos ainda não foram configurados.');
    if(configured)stripe.requireReady();
    const result=await work(async c=>{
      const n=await negotiation(c,req.params.id,req.user.id);
      if(n.interested_id!==req.user.id)fail(403,'Somente o comprador pode pagar.');
      const old=await one(c,'SELECT * FROM payments WHERE negotiation_id=$1 AND idempotency_key=$2',[n.id,key]);
      if(old){if(Number(old.amount_cents)!==amount||old.currency!==currency||old.method!==method)fail(409,'Esta tentativa já utiliza outros dados.');return {payment:old,replay:true};}
      if(n.proposal_status!=='accepted'||Number(n.proposal_amount_cents)!==amount||n.proposal_method!==method)fail(400,'O pagamento deve corresponder à oferta aceita.');
      if(n.status!=='reserved')fail(409,'A negociação precisa estar reservada.');
      const post=await one(c,'SELECT * FROM posts WHERE id=$1',[n.post_id]);
      if(post?.goal!=='Venda'||post.status!=='Reservado'||post.reserved_by!==n.interested_id)fail(409,'Esta venda não está reservada para você.');
      const d=await one(c,'SELECT * FROM collection_deliveries WHERE negotiation_id=$1',[n.id]);
      if(!d?.accepted_by||d.accepted_by===d.proposed_by||!['confirmed','in_transit'].includes(d.status)||new Date(d.confirmation_token_expires_at).getTime()<clock().getTime())fail(409,'Combine e aceite a entrega antes de pagar.');
      if(await one(c,"SELECT id FROM payments WHERE negotiation_id=$1 AND status IN ('processing','succeeded','refunded')",[n.id]))fail(409,'Já existe uma cobrança nesta negociação. Consulte o status.');
      const seller=await one(c,'SELECT * FROM users WHERE id=$1',[n.owner_id]),payer=await one(c,'SELECT email FROM users WHERE id=$1',[n.interested_id]);
      const account=configured&&!stripe.demoEnabled()?seller[accountColumn()]:null;
      if(configured&&!stripe.demoEnabled()&&!account)fail(409,'O vendedor precisa concluir o cadastro Stripe.');
      const id='payment-'+crypto.createHash('sha256').update(n.id+':'+key).digest('hex').slice(0,40);
      const request={checkoutVersion:2,paymentId:id,postId:post.id,title:post.title,amountCents:amount,payerEmail:payer.email,method,sellerAccountId:account,sellerAccountVersion:accountVersion(seller),returnBaseUrl:process.env.APP_BASE_URL,expiresAt:Math.floor(clock().getTime()/1000)+3600};
      await c.query('INSERT INTO payments(id,negotiation_id,payer_id,payee_id,amount_cents,currency,method,status,idempotency_key,provider_reference,created_at,updated_at,provider_account_id,provider_request_json,provider_livemode) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',[id,n.id,n.interested_id,n.owner_id,amount,currency,method,configured?'processing':'succeeded',key,configured?'pending_'+id:'test_'+id,now(),now(),account,configured?JSON.stringify(request):null,configured?Number(stripe.liveMode()):null]);
      const payment=await one(c,'SELECT * FROM payments WHERE id=$1',[id]);await audit(c,{...payment,status:null},payment.status,'payment_attempt_recorded',req.correlationId);
      if(!configured)await c.query('UPDATE payments SET paid_at=$1 WHERE id=$2',[now(),id]);
      return {payment,replay:false};
    });
    let p=result.payment;
    if(configured&&p.provider_reference.startsWith('pending_'))p=await reconcilePayment(p.id,{force:true});
    res.status(result.replay?200:201).json({payment:paymentView(p),idempotentReplay:result.replay});
  }));
  app.post('/api/negotiations/:id/refund',authenticate,route(async(req,res)=>{
    const payment=await work(async c=>{
      const n=await negotiation(c,req.params.id,req.user.id);
      if(n.owner_id!==req.user.id)fail(403,'Somente o vendedor pode solicitar este reembolso.');
      return one(c,"SELECT * FROM payments WHERE negotiation_id=$1 AND status IN ('succeeded','refunded') ORDER BY created_at DESC LIMIT 1",[n.id]);
    });
    if(!payment?.provider_reference.startsWith('cs_'))fail(409,'Não há pagamento Stripe reembolsável.');
    if(payment.provider_livemode!==Number(stripe.liveMode()))fail(409,'Este pagamento pertence a outro ambiente Stripe.');
    if(payment.status==='refunded')return res.json({payment:paymentView(payment)});
    const current=await reconcilePayment(payment.id,{force:true});
    if(!closedDispute(current.dispute_status))fail(409,'Resolva a contestação no painel Stripe antes de solicitar reembolso.');
    if(!current.provider_payment_intent)fail(409,'Aguarde a conciliação do pagamento antes de reembolsar.');
    if(current.status==='refunded'||current.refund_id)return res.json({payment:paymentView(current)});
    await work(async c=>{
      const locked=await one(c,'SELECT * FROM payments WHERE id=$1'+lock,[current.id]);
      if(!locked.refund_requested_at){
        await c.query("UPDATE payments SET refund_status='requested',refund_requested_at=$1,reconcile_after=$2 WHERE id=$3",[now(),now(),current.id]);
        await audit(c,locked,locked.status,'refund_requested',req.correlationId);
      }
    });
    res.json({payment:paymentView(await reconcilePayment(current.id,{force:true}))});
  }));
  app.post('/api/negotiations/:id/switch-to-card',authenticate,route(async(req,res)=>{
    if(process.env.STRIPE_PIX_ENABLED==='true')fail(409,'Pix está disponível; mantenha a forma de pagamento combinada.');
    await work(async c=>{
      const n=await negotiation(c,req.params.id,req.user.id);
      if(n.interested_id!==req.user.id)fail(403,'Somente o comprador pode reenviar a oferta.');
      if(n.status!=='reserved'||n.proposal_status!=='accepted'||n.proposal_method!=='pix')fail(409,'Esta oferta não precisa ser convertida.');
      if(await one(c,"SELECT id FROM payments WHERE negotiation_id=$1 AND status IN ('processing','succeeded','refunded')",[n.id]))fail(409,'Resolva o pagamento já iniciado antes de mudar a oferta.');
      const d=await one(c,'SELECT * FROM collection_deliveries WHERE negotiation_id=$1',[n.id]);
      if(d?.payment_locked)fail(409,'A tentativa de pagamento ainda precisa ser conciliada.');
      const post=await one(c,'SELECT * FROM posts WHERE id=$1'+lock,[n.post_id]);
      if(post?.status!=='Reservado'||post.reserved_by!==n.interested_id)fail(409,'A reserva deste anúncio mudou.');
      await c.query("UPDATE collection_deliveries SET status='cancelled',updated_at=$1 WHERE negotiation_id=$2",[now(),n.id]);
      await c.query("UPDATE negotiations SET status='interested',proposal_status='pending',proposal_method='card',updated_at=$1 WHERE id=$2",[now(),n.id]);
      await c.query("UPDATE posts SET status='Disponível',reserved_by=NULL,updated_at=$1 WHERE id=$2",[now(),post.id]);
      await notice(c,n.owner_id,'Oferta reenviada por cartão','O comprador manteve o valor e propôs pagamento por cartão. Confira antes de aceitar uma nova reserva.','/anuncios/'+post.id);
    });res.json({ok:true});
  }));

  const checkoutTypes=['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired'];
  const financialTypes=['charge.refunded','refund.created','refund.updated','refund.failed','charge.dispute.created','charge.dispute.updated','charge.dispute.closed'];
  const accountTypes=['v2.core.account.created','v2.core.account.updated','v2.core.account.closed','v2.core.account[configuration.merchant].capability_status_updated','v2.core.account[configuration.merchant].updated','v2.core.account[requirements].updated','v2.core.account[defaults].updated'];
  async function processEvent(id) {
    const event=await work(async c=>{
      const e=await one(c,'SELECT * FROM stripe_webhook_events WHERE id=$1'+lock,[id]);
      if(!e||e.status==='processed'||e.next_attempt_at>now())return null;
      await c.query('UPDATE stripe_webhook_events SET attempts=attempts+1,next_attempt_at=$1 WHERE id=$2',[later(120000),id]);return parse(e.payload_json);
    });
    if(!event)return;
    try {
      const o=event.data.object;
      if(event.account){
        const user=await queryOne('SELECT * FROM users WHERE '+accountColumn()+'=$1',[event.account]);
        if(!user){await work(c=>c.query("UPDATE stripe_webhook_events SET status='processed',processed_at=$1 WHERE id=$2",[now(),id]));return;}
        if(event.type==='account.updated'||accountTypes.includes(event.type)&&event.type!=='v2.core.account.closed')await sellerStatus(user.id);
        if(event.type==='v2.core.account.closed')await work(async c=>{
          const state={...stripe.sellerView(null),connected:true,accountVersion:'v2',disabledReason:'account_closed'};
          await c.query('UPDATE users SET stripe_status_json=$1,stripe_checked_at=$2 WHERE id=$3',[JSON.stringify(state),now(),user.id]);
          await notice(c,user.id,'Conta Stripe encerrada','Sua conta de vendedor foi encerrada na Stripe. Novas vendas ficam bloqueadas.','/configuracoes');
        });
        if(event.type==='account.application.deauthorized')await work(async c=>{
          const state={...stripe.sellerView(null),connected:true,disabledReason:'platform_access_revoked'};
          await c.query('UPDATE users SET stripe_status_json=$1,stripe_checked_at=$2 WHERE id=$3',[JSON.stringify(state),now(),user.id]);
          await notice(c,user.id,'Conexão Stripe interrompida','O acesso da plataforma foi revogado. Verifique sua conta Stripe antes de novas vendas.','/configuracoes');
        });
      }
      if(checkoutTypes.includes(event.type)||financialTypes.includes(event.type)){
        let p;
        if(checkoutTypes.includes(event.type))p=await queryOne('SELECT * FROM payments WHERE provider_reference=$1',[o.id]);
        else if(o.payment_intent)p=await queryOne('SELECT * FROM payments WHERE provider_payment_intent=$1',[objectId(o.payment_intent)]);
        if(!p&&o.metadata?.payment_id)p=await queryOne('SELECT * FROM payments WHERE id=$1',[o.metadata.payment_id]);
        if(!p&&o.payment_intent){
          const pi=await stripe.paymentIntent(objectId(o.payment_intent),event.account||undefined);
          if(pi.metadata?.payment_id)p=await queryOne('SELECT * FROM payments WHERE id=$1',[pi.metadata.payment_id]);
        }
        if(p){
          if((p.provider_account_id||'')!==(event.account||'')||p.provider_livemode!==Number(event.livemode))fail(409,'Origem de webhook não corresponde ao pagamento.');
          if(p.reconcile_until&&p.reconcile_until>now())fail(503,'Conciliação já em andamento.');
          await reconcilePayment(p.id,{force:true,eventType:event.type,disputeId:event.type.startsWith('charge.dispute.')?o.id:undefined});
        }else if(o.metadata?.payment_id?.startsWith('payment-'))fail(503,'Aguardando registro local do pagamento.');
      }
      await work(c=>c.query("UPDATE stripe_webhook_events SET status='processed',processed_at=$1,last_error=NULL WHERE id=$2",[now(),id]));
    }catch(e){
      await work(c=>c.query("UPDATE stripe_webhook_events SET status='pending',next_attempt_at=$1,last_error=$2 WHERE id=$3",[later(60000),String(e.stripeCode||e.status||'processing_failed'),id]));throw e;
    }
  }
  app.post('/api/payments/stripe/webhook',route(async(req,res)=>{
    const connected=!!req.body?.account,event=stripe.webhookEvent(req.rawBody,req.get('stripe-signature'),connected);
    if(!event||!!event.account!==connected||typeof event.livemode!=='boolean'||event.livemode!==stripe.liveMode()||!/^evt_[A-Za-z0-9_]+$/.test(event.id||''))return res.sendStatus(401);
    if(!checkoutTypes.includes(event.type)&&!financialTypes.includes(event.type)&&!['account.updated','account.application.deauthorized'].includes(event.type))return res.sendStatus(200);
    const o=event.data?.object||{};
    const snapshot={id:event.id,type:event.type,account:event.account,livemode:event.livemode,data:{object:{id:o.id,payment_intent:objectId(o.payment_intent),metadata:{payment_id:o.metadata?.payment_id}}}};
    await work(c=>c.query('INSERT INTO stripe_webhook_events(id,account_id,livemode,type,payload_json,next_attempt_at,received_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',[event.id,event.account||'',Number(event.livemode),event.type,JSON.stringify(snapshot),now(),now()]));
    await processEvent(event.id);res.sendStatus(200);
  }));
  app.post('/api/payments/stripe/accounts-webhook',route(async(req,res)=>{
    const event=stripe.accountWebhookEvent(req.rawBody,req.get('stripe-signature'));
    if(!event||typeof event.livemode!=='boolean'||event.livemode!==stripe.liveMode()||!/^evt_[A-Za-z0-9_]+$/.test(event.id||''))return res.sendStatus(401);
    if(!accountTypes.includes(event.type))return res.sendStatus(200);
    const accountId=event.related_object?.id;
    if(!/^acct_[A-Za-z0-9]+$/.test(accountId||''))return res.sendStatus(400);
    // The notification is only a trigger; current account capabilities are fetched with the platform key.
    const snapshot={id:event.id,type:event.type,account:accountId,livemode:event.livemode,data:{object:{id:accountId}}};
    await work(c=>c.query('INSERT INTO stripe_webhook_events(id,account_id,livemode,type,payload_json,next_attempt_at,received_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',[event.id,accountId,Number(event.livemode),event.type,JSON.stringify(snapshot),now(),now()]));
    await processEvent(event.id);res.sendStatus(200);
  }));
  // Preserve financial records while they can still receive provider updates.
  app.delete('/api/profile',authenticate,route(async(req,res,next)=>{
    if(await queryOne('SELECT id FROM payments WHERE payer_id=$1 OR payee_id=$2 LIMIT 1',[req.user.id,req.user.id]))fail(409,'Sua conta possui registros financeiros. Solicite a exclusão ao suporte para preservar as obrigações de pagamentos e reembolsos.');
    next();
  }));
  for(const path of ['/api/posts/:id','/api/admin/posts/:id'])app.delete(path,authenticate,route(async(req,res,next)=>{
    const post=await queryOne('SELECT author_id FROM posts WHERE id=$1',[req.params.id]);
    if(post&&post.author_id!==req.user.id&&req.user.role!=='admin')fail(403,'Você não pode excluir este anúncio.');
    if(await queryOne('SELECT p.id FROM payments p JOIN negotiations n ON n.id=p.negotiation_id WHERE n.post_id=$1 LIMIT 1',[req.params.id]))fail(409,'Este anúncio possui registros financeiros. Encerre o anúncio em vez de excluir para manter o histórico de pagamentos e reembolsos.');
    next();
  }));
  app.get('/api/admin/payments/stripe',authenticate,route(async(req,res)=>{
    if(req.user.role!=='admin')fail(403,'Acesso restrito à administração.');
    let configurationError=null;try{stripe.requireReady();}catch(e){configurationError=e.message;}
    const pending=await queryOne("SELECT COUNT(*) AS count FROM stripe_webhook_events WHERE status='pending'");
    const last=await queryOne("SELECT processed_at FROM stripe_webhook_events WHERE status='processed' AND livemode=$1 ORDER BY processed_at DESC LIMIT 1",[Number(stripe.liveMode())]);
    const unresolved=await queryOne("SELECT COUNT(*) AS count FROM payments WHERE provider_livemode=$1 AND failure_code IS NOT NULL AND status='processing'",[Number(stripe.liveMode())]);
    res.json({configured:stripe.configured(),liveMode:stripe.liveMode(),demoMode:stripe.demoEnabled(),configurationError,
      platformWebhookConfigured:!!process.env.STRIPE_WEBHOOK_SECRET,connectWebhookConfigured:!!process.env.STRIPE_CONNECT_WEBHOOK_SECRET,accountWebhookConfigured:!!process.env.STRIPE_ACCOUNT_WEBHOOK_SECRET,
      pendingWebhooks:Number(pending.count),paymentsAwaitingReconciliation:Number(unresolved.count),lastProcessedWebhookAt:last?.processed_at||null});
  }));
  let running=false;
  async function runReconciliation(){
    if(running||!stripe.configured())return;running=true;
    try{
      const events=await work(c=>rows(c,"SELECT id FROM stripe_webhook_events WHERE status='pending' AND livemode=$1 AND next_attempt_at<=$2 ORDER BY received_at LIMIT 25",[Number(stripe.liveMode()),now()]));
      for(const e of events)try{await processEvent(e.id);}catch(error){console.error('[stripe-inbox]',{eventId:e.id,status:error.status});}
      const payments=await work(c=>rows(c,"SELECT id FROM payments WHERE provider_livemode=$1 AND (reconcile_after IS NULL OR reconcile_after<=$2) AND (status='processing' OR refund_status IN ('requested','pending','requires_action') OR dispute_status NOT IN ('won','warning_closed') OR (status='succeeded' AND created_at>=$3)) ORDER BY COALESCE(reconcile_after,CAST(created_at AS TEXT)) LIMIT 25",[Number(stripe.liveMode()),now(),new Date(clock().getTime()-7*86400000).toISOString()]));
      for(const p of payments)try{await reconcilePayment(p.id);}catch(error){console.error('[stripe-reconciliation]',{paymentId:p.id,status:error.status});}
    }finally{running=false;}
  }
  return {runReconciliation,reconcilePayment,processEvent,sellerStatus};
}
module.exports={registerStripeRoutes,paymentView,closedDispute};
