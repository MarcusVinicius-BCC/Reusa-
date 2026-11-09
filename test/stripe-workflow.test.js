const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const express=require('express'),jwt=require('jsonwebtoken');
const {registerStripeRoutes}=require('../storage/stripe-api');
const {registerDeliveryRoutes}=require('../storage/delivery-api');
const {PostgresRepository}=require('../storage/postgres-repository');
const {Client}=require('pg');

// Real HTTP handlers, transactions and HMAC signatures; only the external Stripe HTTP responses are simulated.
async function workflow(provider){
 const previousFetch=global.fetch, savedEnv={...process.env};
 let db,repo,server,admin,schema,currentTime=new Date(),accountReady=false,creates=0,refundCreates=0,failCreate=false,failRead=false,failRefund=false;
 const sessions=new Map(),intents=new Map(),refunds=new Map(),disputes=new Map(),createBodies=new Map();
 const baseSchema=`
 CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT,email TEXT,role TEXT, stripe_account_id TEXT,mercado_pago_access_token TEXT);
 CREATE TABLE posts(id TEXT PRIMARY KEY,title TEXT,goal TEXT,status TEXT,reserved_by TEXT,author_id TEXT,updated_at TEXT);
 CREATE TABLE negotiations(id TEXT PRIMARY KEY,post_id TEXT,owner_id TEXT,interested_id TEXT,status TEXT,proposal_status TEXT,proposal_amount_cents INTEGER,proposal_method TEXT,updated_at TEXT);
 CREATE TABLE collection_deliveries(id TEXT PRIMARY KEY,negotiation_id TEXT,status TEXT,proposed_by TEXT,accepted_by TEXT,confirmation_token_expires_at TEXT,payment_locked INTEGER,updated_at TEXT,payment_attempt_key TEXT);
 CREATE TABLE delivery_incidents(id TEXT PRIMARY KEY,delivery_id TEXT,reporter_id TEXT,kind TEXT,detail TEXT,created_at TEXT);
 CREATE TABLE payments(id TEXT PRIMARY KEY,negotiation_id TEXT,payer_id TEXT,payee_id TEXT,amount_cents INTEGER,currency TEXT,method TEXT,status TEXT,idempotency_key TEXT,provider_reference TEXT,checkout_url TEXT,failure_code TEXT,created_at TEXT,updated_at TEXT,paid_at TEXT,refunded_at TEXT,UNIQUE(negotiation_id,idempotency_key));
 CREATE TABLE payment_audit_events(id TEXT PRIMARY KEY,payment_id TEXT,from_status TEXT,to_status TEXT,reason TEXT,correlation_id TEXT,created_at TEXT);
 CREATE TABLE notifications(id TEXT PRIMARY KEY,user_id TEXT,type TEXT,title TEXT,text TEXT,link TEXT,created_at TEXT);
 CREATE TABLE event_outbox(id TEXT PRIMARY KEY,type TEXT,payload_json TEXT,correlation_id TEXT,created_at TEXT);`;
 try{
  if(provider==='postgres'){
   admin=new Client({connectionString:process.env.STRIPE_TEST_POSTGRES_URL});await admin.connect();
   schema='stripe_test_'+crypto.randomBytes(8).toString('hex');await admin.query('CREATE SCHEMA '+schema);
   const url=new URL(process.env.STRIPE_TEST_POSTGRES_URL);url.searchParams.set('options','-c search_path='+schema);
   repo=new PostgresRepository(url.toString());
   // Production stores these fields as TIMESTAMPTZ, which pg returns as Date objects.
   const typedSchema=baseSchema.replace(/\b(created_at|updated_at|paid_at|refunded_at|confirmation_token_expires_at) TEXT/g,'$1 TIMESTAMPTZ');
   await repo.query(typedSchema);
   await repo.query(fs.readFileSync(path.join(__dirname,'../migrations/20261109_stripe_production.sql'),'utf8'));
  }else{
   const SQL=await require('sql.js')();db=new SQL.Database();db.exec(baseSchema);
   const migration=fs.readFileSync(path.join(__dirname,'../migrations/20261109_stripe_production.sql'),'utf8').replaceAll('ADD COLUMN IF NOT EXISTS','ADD COLUMN');db.exec(migration);
  }
  const all=(q,p=[])=>{const r=db.exec(q,p)[0];return r?r.values.map(row=>Object.fromEntries(r.columns.map((k,i)=>[k,row[i]]))):[]};
  const sql=async(q,p=[])=>repo?(await repo.query(q,p)).rows:all(q.replace(/\$\d+/g,'?'),p);
  const one=async(q,p=[])=>(await sql(q,p))[0];
  const addSale=async id=>{
   await sql("INSERT INTO posts VALUES($1,'Mesa','Venda','Reservado','buyer','seller',$2)",[id,currentTime.toISOString()]);
   await sql("INSERT INTO negotiations VALUES($1,$2,'seller','buyer','reserved','accepted',2500,'card',$3)",['n_'+id,id,currentTime.toISOString()]);
   await sql("INSERT INTO collection_deliveries(id,negotiation_id,status,proposed_by,accepted_by,confirmation_token_expires_at,payment_locked,updated_at) VALUES($1,$2,'confirmed','buyer','seller',$3,0,$4)",['d_'+id,'n_'+id,new Date(currentTime.getTime()+86400000).toISOString(),currentTime.toISOString()]);
   return 'n_'+id;
  };
  await sql("INSERT INTO users(id,name,email,role) VALUES('seller','Seller','seller@example.test','user'),('buyer','Buyer','buyer@example.test','user'),('admin','Admin','admin@example.test','admin')");
  Object.assign(process.env,{NODE_ENV:'test',STRIPE_SECRET_KEY:'sk_test_workflow',APP_BASE_URL:'https://reusa.example',STRIPE_WEBHOOK_SECRET:'whsec_platform',STRIPE_CONNECT_WEBHOOK_SECRET:'whsec_connected',STRIPE_DEMO_MODE:'false',STRIPE_CONNECT_ENABLED:'true',STRIPE_ENABLE_LIVE:'false',STRIPE_PIX_ENABLED:'false'});
  const response=value=>({ok:true,json:async()=>value});
  global.fetch=async(url,options={})=>{
   if(!String(url).startsWith('https://api.stripe.com/'))return previousFetch(url,options);
   const u=new URL(url),p=new URLSearchParams(options.body||'');
   if(u.pathname==='/v1/accounts'&&options.method==='POST')return response({id:'acct_seller'});
   if(u.pathname==='/v1/accounts/acct_seller')return response({id:'acct_seller',charges_enabled:accountReady,payouts_enabled:accountReady,details_submitted:accountReady,requirements:{currently_due:accountReady?[]:['individual.verification.document']}});
   if(u.pathname==='/v1/account_links')return response({url:'https://connect.stripe.com/setup/test'});
   if(u.pathname==='/v1/accounts/acct_seller/login_links')return response({url:'https://connect.stripe.com/express/test'});
   if(u.pathname==='/v1/checkout/sessions'&&options.method==='POST'){
    assert.equal(options.headers['Stripe-Account'],'acct_seller');
    const key=options.headers['Idempotency-Key'];
    if(createBodies.has(key))assert.equal(options.body,createBodies.get(key),'provider idempotency must replay identical parameters');
    else{creates++;createBodies.set(key,options.body);sessions.set(key,{id:'cs_test_'+key.replaceAll('-','_'),client_reference_id:key,metadata:{payment_id:key},mode:'payment',currency:'brl',amount_total:2500,status:'open',payment_status:'unpaid',livemode:false,url:'https://checkout.stripe.com/c/pay/test'});}
    if(failCreate){failCreate=false;throw new Error('connection lost after provider accepted checkout');}
    return response(sessions.get(key));
   }
   if(u.pathname.startsWith('/v1/checkout/sessions/')){if(failRead){failRead=false;throw new Error('provider unavailable');}return response([...sessions.values()].find(s=>s.id===u.pathname.split('/').pop()));}
   if(u.pathname.startsWith('/v1/payment_intents/'))return response(intents.get(u.pathname.split('/').pop()));
   if(u.pathname.startsWith('/v1/disputes/'))return response(disputes.get(u.pathname.split('/').pop()));
   if(u.pathname==='/v1/disputes')return response({data:[...disputes.values()].filter(d=>d.payment_intent===u.searchParams.get('payment_intent'))});
   if(u.pathname==='/v1/refunds'&&options.method==='GET')return response({data:[...refunds.values()].filter(r=>r.payment_intent===u.searchParams.get('payment_intent'))});
   if(u.pathname==='/v1/refunds'&&options.method==='POST'){
    const key=options.headers['Idempotency-Key'];
    if(!refunds.has(key)){refundCreates++;refunds.set(key,{id:'re_test_'+refundCreates,payment_intent:p.get('payment_intent'),metadata:{payment_id:p.get('metadata[payment_id]')},amount:2500,status:'succeeded'});intents.get(p.get('payment_intent')).latest_charge.amount_refunded=2500;}
    if(failRefund){failRefund=false;throw new Error('refund accepted, response lost');}
    return response(refunds.get(key));
   }
   if(u.pathname.startsWith('/v1/refunds/'))return response([...refunds.values()].find(r=>r.id===u.pathname.split('/').pop()));
   throw new Error('Unexpected Stripe request '+url);
  };
  const app=express();app.use(express.json({verify:(req,res,b)=>{req.rawBody=Buffer.from(b);}}));
  const auth=(req,res,next)=>{try{req.user=jwt.verify(String(req.headers.authorization||'').replace('Bearer ',''),'test-secret');next();}catch{res.sendStatus(401);}};
  registerDeliveryRoutes(app,{postgres:repo,sqlite:{all,run:(q,p=[])=>db.run(q,p),persist(){}},authenticate:auth,flush:async()=>{},refreshMetrics(){},clock:()=>currentTime});
  const flow=registerStripeRoutes(app,{postgres:repo,sqlite:{all,run:(q,p=[])=>db.run(q,p),persist(){}},authenticate:auth,jwt,jwtSecret:'test-secret',clock:()=>currentTime});
  app.patch('/api/negotiations/:id/proposal',auth,(req,res)=>res.json({ok:true}));
  app.use((err,req,res,next)=>res.status(500).json({error:err.message}));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port;
  const call=async(path,user='buyer',body,method=body?'POST':'GET',extra={})=>{
   const token=jwt.sign({id:user,role:user==='admin'?'admin':'user'},'test-secret');
   const r=await previousFetch(base+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,...extra},...(body?{body:JSON.stringify(body)}:{})});
   const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:r.status,data};
  };
  const webhook=async(type,payment,eventId='evt_'+crypto.randomBytes(6).toString('hex'),overrides={})=>{
   const event={id:eventId,type,account:'acct_seller',livemode:false,data:{object:{id:payment.provider_reference,metadata:{payment_id:payment.id}}},...overrides};
   const raw=JSON.stringify(event),ts=Math.floor(Date.now()/1000),signature='t='+ts+',v1='+crypto.createHmac('sha256','whsec_connected').update(ts+'.'+raw).digest('hex');
   return call('/api/payments/stripe/webhook','buyer',event,'POST',{'stripe-signature':signature});
  };
  const pay=async(n,key='attempt_'+crypto.randomBytes(8).toString('hex'))=>call('/api/negotiations/'+n+'/payment','buyer',{amountCents:2500,method:'card',currency:'BRL',idempotencyKey:key});
  const markPaid=payment=>{
   const session=sessions.get(payment.id);session.status='complete';session.payment_status='paid';session.payment_intent='pi_'+payment.id.replaceAll('-','_');
   intents.set(session.payment_intent,{id:session.payment_intent,amount:2500,currency:'brl',metadata:{payment_id:payment.id},latest_charge:{id:'ch_test',amount_refunded:0,disputed:false}});
  };
  const get=async id=>one('SELECT * FROM payments WHERE id=$1',[id]);

  assert.equal((await call('/api/payments/stripe/connect','seller')).status,200);
  assert.equal((await one("SELECT stripe_test_account_id FROM users WHERE id='seller'")).stripe_test_account_id,'acct_seller');
  assert.equal((await call('/api/payments/stripe/status','seller')).data.chargesEnabled,false);
  assert.equal((await call('/api/payments/stripe/status','seller')).data.testMode,true);
  const n=await addSale('p1');
  const agreement=await one('SELECT * FROM collection_deliveries WHERE negotiation_id=$1',[n]);await sql('DELETE FROM collection_deliveries WHERE negotiation_id=$1',[n]);
  assert.equal((await call('/api/negotiations/'+n+'/proposal','seller',{decision:'accepted'},'PATCH')).status,409);
  accountReady=true;
  assert.equal((await call('/api/payments/stripe/status','seller')).data.chargesEnabled,true);
  assert.equal((await call('/api/negotiations/'+n+'/proposal','seller',{decision:'accepted'},'PATCH')).status,200);
  await sql('INSERT INTO collection_deliveries(id,negotiation_id,status,proposed_by,accepted_by,confirmation_token_expires_at,payment_locked,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[agreement.id,n,agreement.status,agreement.proposed_by,agreement.accepted_by,agreement.confirmation_token_expires_at,agreement.payment_locked,agreement.updated_at]);
  assert.equal((await call('/api/payments/stripe/dashboard','seller',{})).status,200);
  const [a,b]=await Promise.all([pay(n,'same_attempt_123456789'),pay(n,'same_attempt_123456789')]);
  assert.ok([200,201].includes(a.status),JSON.stringify(a));assert.ok([200,201].includes(b.status),JSON.stringify(b));assert.equal(creates,1);
  let payment=await one('SELECT * FROM payments WHERE negotiation_id=$1',[n]);
  assert.equal(payment.status,'processing');assert.equal((await pay(n)).status,409);
  assert.equal((await call('/api/negotiations/'+n+'/payment','seller')).status,200);
  assert.equal((await call('/api/negotiations/'+n+'/payment','admin')).status,403);
  markPaid(payment);
  assert.equal((await webhook('checkout.session.completed',payment,'evt_mode',{livemode:true})).status,401);
  assert.equal((await call('/api/payments/stripe/webhook','buyer',{id:'evt_unsigned',type:'checkout.session.completed'})).status,401);
  assert.equal((await webhook('checkout.session.completed',payment,'evt_paid')).status,200);
  assert.equal((await get(payment.id)).status,'succeeded');
  assert.equal((await call('/api/negotiations/'+n+'/payment','seller')).data.payment.testMode,true);
  const notices=Number((await one('SELECT COUNT(*) AS count FROM notifications')).count);
  assert.equal((await webhook('checkout.session.completed',payment,'evt_paid')).status,200);
  assert.equal(Number((await one('SELECT COUNT(*) AS count FROM notifications')).count),notices);

  // A dispute is fetched from Stripe, never trusted from the webhook payload.
  const pi=intents.get(sessions.get(payment.id).payment_intent);pi.latest_charge.disputed=true;
  disputes.set('dp_test',{id:'dp_test',payment_intent:pi.id,status:'needs_response'});
  assert.equal((await webhook('charge.dispute.created',payment,'evt_dispute',{data:{object:{id:'dp_test',payment_intent:pi.id}}})).status,200);
  assert.equal((await get(payment.id)).dispute_status,'needs_response');
  assert.equal((await call('/api/negotiations/'+n+'/collection')).data.collection.canReceive,false);
  assert.equal((await call('/api/collection-deliveries/d_p1/confirm','buyer',{})).status,409);
  assert.equal((await call('/api/negotiations/'+n+'/refund','seller',{})).status,409);
  disputes.get('dp_test').status='won';pi.latest_charge.disputed=false;
  await webhook('charge.dispute.closed',payment,'evt_won',{data:{object:{id:'dp_test',payment_intent:pi.id}}});
  assert.equal((await get(payment.id)).dispute_status,'won');
  assert.equal((await call('/api/negotiations/'+n+'/collection')).data.collection.canReceive,true);
  assert.equal((await call('/api/negotiations/'+n+'/refund','buyer',{})).status,403);
  failRefund=true;
  assert.equal((await call('/api/negotiations/'+n+'/refund','seller',{})).status,502);
  assert.equal((await get(payment.id)).refund_status,'requested');
  assert.equal((await call('/api/negotiations/'+n+'/collection')).data.collection.canReceive,false);
  currentTime=new Date(currentTime.getTime()+180000);await flow.runReconciliation();
  assert.equal((await get(payment.id)).status,'refunded');assert.equal(refundCreates,1);
  assert.equal((await one('SELECT status FROM negotiations WHERE id=$1',[n])).status,'cancelled');
  assert.equal((await call('/api/negotiations/'+n+'/refund','seller',{})).status,200);assert.equal(refundCreates,1);

  // Checkout accepted by the provider but lost in transit: recover with the SAME provider key and body.
  const n2=await addSale('p2');failCreate=true;
  assert.equal((await pay(n2,'recovery_attempt_123456')).status,502);
  payment=await one('SELECT * FROM payments WHERE negotiation_id=$1',[n2]);assert.match(payment.provider_reference,/^pending_/);
  const count=creates;assert.equal((await pay(n2)).status,409);
  accountReady=false;currentTime=new Date(currentTime.getTime()+180000);await flow.runReconciliation();
  assert.equal((await get(payment.id)).status,'processing','a later seller restriction cannot mark an uncertain checkout as rejected');
  accountReady=true;
  currentTime=new Date(currentTime.getTime()+180000);await flow.runReconciliation();
  payment=await get(payment.id);assert.match(payment.provider_reference,/^cs_/);assert.equal(creates,count);
  markPaid(payment);
  // Provider read fails during webhook; the durable inbox retries without another webhook delivery.
  failRead=true;assert.equal((await webhook('checkout.session.completed',payment,'evt_retry')).status,502);
  assert.equal((await one("SELECT status FROM stripe_webhook_events WHERE id='evt_retry'")).status,'pending');
  currentTime=new Date(currentTime.getTime()+180000);await flow.runReconciliation();
  assert.equal((await get(payment.id)).status,'succeeded');assert.equal((await one("SELECT status FROM stripe_webhook_events WHERE id='evt_retry'")).status,'processed');

  const n3=await addSale('p3');const paid3=await pay(n3);assert.equal(paid3.status,201);payment=await get(paid3.data.payment.id);markPaid(payment);
  const missedIntent=intents.get(sessions.get(payment.id).payment_intent);missedIntent.latest_charge.disputed=true;
  disputes.set('dp_missed',{id:'dp_missed',payment_intent:missedIntent.id,status:'needs_response'});
  currentTime=new Date(currentTime.getTime()+360000);await flow.runReconciliation();assert.equal((await get(payment.id)).status,'succeeded','missing webhook must reconcile');
  assert.equal((await get(payment.id)).dispute_id,'dp_missed','a missing dispute webhook must also reconcile');
  // Wrong amounts never approve a payment, even with a legitimate provider signature.
  const n4=await addSale('p4');const p4=await pay(n4);payment=await get(p4.data.payment.id);markPaid(payment);sessions.get(payment.id).amount_total=2499;
  assert.equal((await webhook('checkout.session.completed',payment,'evt_wrong_amount')).status,409);assert.equal((await get(payment.id)).status,'processing');
  assert.equal((await call('/api/profile','seller',undefined,'DELETE')).status,409);
  assert.equal((await call('/api/posts/p1','seller',undefined,'DELETE')).status,409);
  assert.equal((await call('/api/admin/posts/p1','admin',undefined,'DELETE')).status,409);
  const n5=await addSale('p5');await sql("UPDATE negotiations SET proposal_method='pix' WHERE id=$1",[n5]);
  assert.equal((await call('/api/negotiations/'+n5+'/switch-to-card','seller',{})).status,403);
  assert.equal((await call('/api/negotiations/'+n5+'/switch-to-card','buyer',{})).status,200);
  const revised=await one('SELECT * FROM negotiations WHERE id=$1',[n5]);assert.equal(revised.proposal_method,'card');assert.equal(revised.proposal_status,'pending');assert.equal(revised.status,'interested');
  const n6=await addSale('p6');const p6=await pay(n6);const failed=await get(p6.data.payment.id);sessions.get(failed.id).status='complete';
  assert.equal((await webhook('checkout.session.async_payment_failed',failed,'evt_async_failed')).status,200);
  assert.equal((await get(failed.id)).status,'failed');currentTime=new Date(currentTime.getTime()+360000);
  assert.equal((await call('/api/negotiations/'+n6+'/payment')).data.payment.status,'failed','a later status read must not reopen an asynchronous failure');
  const n7=await addSale('p7');failCreate=true;assert.equal((await pay(n7)).status,502);
  const uncertain=await one('SELECT * FROM payments WHERE negotiation_id=$1',[n7]),beforeOldRetry=creates;
  currentTime=new Date(currentTime.getTime()+24*3600000);await flow.runReconciliation();assert.equal(creates,beforeOldRetry);assert.match((await get(uncertain.id)).provider_reference,/^pending_/);
  assert.equal((await call('/api/admin/payments/stripe','buyer')).status,403);
  const diagnostics=await call('/api/admin/payments/stripe','admin');assert.equal(diagnostics.status,200);assert.ok(diagnostics.data.lastProcessedWebhookAt);assert.ok(!JSON.stringify(diagnostics.data).includes('sk_test_workflow'));
  // Switching to live must never reuse a seller's sandbox account.
  Object.assign(process.env,{STRIPE_SECRET_KEY:'sk_live_fixture',STRIPE_ENABLE_LIVE:'true'});
  assert.equal((await call('/api/payments/stripe/status','seller')).data.connected,false);
 }finally{
  global.fetch=previousFetch;for(const key of Object.keys(process.env))if(!(key in savedEnv))delete process.env[key];Object.assign(process.env,savedEnv);
  if(server)await new Promise(r=>server.close(r));if(db)db.close();if(repo)await repo.close();
  if(admin){if(schema)await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}
 }
}
test('Stripe HTTP workflow: seller verification, concurrent checkout, signed inbox, disputes, refund, recovery and private access (SQLite)',()=>workflow('sqlite'));
test('Stripe HTTP workflow with PostgreSQL row locks', {skip:!process.env.STRIPE_TEST_POSTGRES_URL},()=>workflow('postgres'));
