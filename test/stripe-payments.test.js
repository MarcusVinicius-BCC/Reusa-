const assert = require('node:assert/strict');
const { test } = require('node:test');
const crypto = require('node:crypto');
const stripe = require('../services/stripe-payments');
const {paymentView} = require('../storage/stripe-api');

test('Archived payments keep their financial status without exposing a retired checkout link', () => {
  const payment={id:'archive-1',status:'succeeded',amount_cents:2500,currency:'BRL',provider_reference:'retired-order-1',checkout_url:'https://retired-provider.example/checkout/1'};
  const archived=paymentView(payment);
  assert.equal(archived.status,'succeeded');assert.equal(archived.amountCents,2500);
  assert.equal(archived.provider,'unavailable');assert.equal(archived.checkoutUrl,null);
  const current=paymentView({...payment,provider_reference:'cs_test_current',checkout_url:'https://checkout.stripe.com/c/pay/current'});
  assert.equal(current.provider,'stripe');assert.equal(current.checkoutUrl,'https://checkout.stripe.com/c/pay/current');
});

function env(next, run) {
  const names = ['STRIPE_SECRET_KEY','APP_BASE_URL','STRIPE_DEMO_MODE','STRIPE_ENABLE_LIVE','STRIPE_PIX_ENABLED','STRIPE_WEBHOOK_SECRET','STRIPE_CONNECT_WEBHOOK_SECRET','STRIPE_ALLOW_PENDING_TEST_SELLERS'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  for (const [name, value] of Object.entries(next)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  return Promise.resolve().then(run).finally(() => { for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } });
}

test('Stripe Checkout card sandbox uses BRL cents and no seller OAuth', async () => {
  await env({ STRIPE_SECRET_KEY: 'sk_test_stub', APP_BASE_URL: 'https://reusa.example', STRIPE_DEMO_MODE: 'true' }, async () => {
    const previous = global.fetch;
    try {
      global.fetch = async (url, opts) => {
        assert.equal(url, 'https://api.stripe.com/v1/checkout/sessions');
        assert.equal(opts.headers.Authorization, 'Bearer sk_test_stub');
        assert.equal(opts.headers['Stripe-Account'], undefined);
        assert.equal(opts.headers['Idempotency-Key'], 'payment-unique-1');
        const p = new URLSearchParams(opts.body);
        assert.equal(p.get('mode'), 'payment');
        assert.equal(p.get('client_reference_id'), 'payment-unique-1');
        assert.equal(p.get('line_items[0][price_data][unit_amount]'), '2000');
        assert.equal(p.get('allowed_payment_method_types[0]'), 'card');
        assert.equal(p.has('payment_method_types[0]'), false);
        assert.equal(p.get('line_items[0][price_data][currency]'), 'brl');
        assert.equal(p.get('metadata[payment_id]'), 'payment-unique-1');
        return { ok:true, json:async()=>({id:'cs_test_123',url:'https://checkout.stripe.com/c/pay/cs_test_123'}) };
      };
      const r = await stripe.createCheckout({ paymentId:'payment-unique-1', postId:'post-1',title:'Livro',amountCents:2000,payerEmail:'buyer@example.com',method:'card' });
      assert.equal(r.id, 'cs_test_123');
      assert.match(r.checkoutUrl, /^https:\/\/checkout\.stripe\.com\//);
    } finally { global.fetch = previous; }
  });
});

test('Stripe checkout refuses Pix unless explicitly enabled', async () => {
  await env({ STRIPE_SECRET_KEY:'sk_test_stub',APP_BASE_URL:'https://reusa.example',STRIPE_DEMO_MODE:'true',STRIPE_PIX_ENABLED:'false' }, async () => {
    await assert.rejects(stripe.createCheckout({paymentId:'id',postId:'post',title:'Item',amountCents:200,payerEmail:'test@example.com',method:'pix'}), {status:503});
  });
});

test('Pix Checkout filters dynamic Dashboard methods without sending the removed static parameter', async () => {
  await env({STRIPE_SECRET_KEY:'sk_test_stub',APP_BASE_URL:'https://reusa.example',STRIPE_DEMO_MODE:'true',STRIPE_PIX_ENABLED:'true'},async()=>{
    const original=global.fetch;
    try {
      let sent;
      global.fetch=async(url,options)=>{
        sent=new URLSearchParams(options.body);
        return {ok:true,json:async()=>({id:'cs_test_pix',url:'https://checkout.stripe.com/c/pay/test-pix'})};
      };
      await stripe.createCheckout({paymentId:'pix-attempt',postId:'post',amountCents:2500,payerEmail:'buyer@example.test',method:'pix'});
      assert.equal(sent.get('allowed_payment_method_types[0]'),'pix');
      assert.equal(sent.has('payment_method_types[0]'),false);
    }finally{global.fetch=original;}
  });
});

test('Production checkout requires a verified connected account', async () => {
  await env({ STRIPE_SECRET_KEY:'sk_test_stub',APP_BASE_URL:'https://reusa.example',STRIPE_DEMO_MODE:'false' }, async () => {
    await assert.rejects(stripe.createCheckout({paymentId:'id',postId:'post',title:'Item',amountCents:200,payerEmail:'buyer@example.com',method:'card'}), {status:409});
  });
});

test('Checkout status cannot be spoofed with wrong payment reference or amount', () => {
  const payment = {provider_reference:'cs_test_A',id:'payment-A',amount_cents:2000,currency:'BRL'};
  const obj = {id:'cs_test_A',client_reference_id:'payment-A',metadata:{payment_id:'payment-A'},mode:'payment',currency:'brl',amount_total:2000,status:'complete',payment_status:'paid'};
  assert.equal(stripe.verifiedSessionStatus(obj,payment,'checkout.session.completed'), 'succeeded');
  assert.equal(stripe.verifiedSessionStatus({...obj,payment_status:'unpaid'},payment,'checkout.session.completed'), 'processing');
  assert.equal(stripe.verifiedSessionStatus({...obj,status:'expired',payment_status:'unpaid'},payment,'checkout.session.expired'), 'failed');
  assert.equal(stripe.verifiedSessionStatus({...obj,payment_status:'unpaid'},payment,'checkout.session.async_payment_failed'), 'failed');
  assert.throws(()=>stripe.verifiedSessionStatus({...obj,amount_total:2100},payment,'checkout.session.completed'), {status:409});
  assert.throws(()=>stripe.verifiedSessionStatus({...obj,client_reference_id:'another'},payment,'checkout.session.completed'), {status:409});
});

test('Stripe webhook requires matching signature, correct secret and recent timestamp', async () => {
  await env({STRIPE_WEBHOOK_SECRET:'whsec_platform',STRIPE_CONNECT_WEBHOOK_SECRET:'whsec_connect'},async()=>{
    const raw = Buffer.from(JSON.stringify({type:'checkout.session.completed',data:{object:{id:'cs_test_1'}}}));
    const now = Math.floor(Date.now()/1000);
    const sign = (secret,ts,data) => 't='+ts+',v1='+crypto.createHmac('sha256',secret).update(String(ts)+'.').update(data).digest('hex');
    const platformSig = sign('whsec_platform',now,raw);
    assert.equal(stripe.webhookEvent(raw,platformSig).type,'checkout.session.completed');
    assert.equal(stripe.webhookEvent(raw,platformSig,true),null);
    assert.equal(stripe.webhookEvent(Buffer.from(raw.toString()+' '),platformSig),null);
    assert.equal(stripe.webhookEvent(raw,sign('whsec_platform',now-601,raw)),null);
    assert.equal(stripe.webhookEvent(raw,sign('whsec_connect',now,raw),true).type,'checkout.session.completed');
  });
});

test('Live charges cannot activate accidentally by installing live credentials', async () => {
  await env({STRIPE_SECRET_KEY:'sk_live_stub',APP_BASE_URL:'https://reusa.example',STRIPE_DEMO_MODE:'false',STRIPE_ENABLE_LIVE:'false'},async()=>{
    await assert.rejects(stripe.createCheckout({paymentId:'id',postId:'post',title:'Item',amountCents:100,payerEmail:'buyer@example.com',method:'card'}),{status:503});
  });
});

test('Restricted Stripe keys preserve test and live environment detection', async () => {
  await env({STRIPE_SECRET_KEY:'rk_test_stub',APP_BASE_URL:'https://reusa.example',STRIPE_DEMO_MODE:'true'},async()=>{
    assert.equal(stripe.configured(),true);
    assert.equal(stripe.isTestEnvironment(),true);
    assert.equal(stripe.liveMode(),false);
    assert.equal(stripe.demoEnabled(),true);
  });
  await env({STRIPE_SECRET_KEY:'rk_live_stub',APP_BASE_URL:'https://reusa.example',STRIPE_DEMO_MODE:'false',STRIPE_ENABLE_LIVE:'false'},async()=>{
    assert.equal(stripe.configured(),true);
    assert.equal(stripe.isTestEnvironment(),false);
    assert.equal(stripe.liveMode(),true);
    await assert.rejects(stripe.createCheckout({paymentId:'id',postId:'post',title:'Item',amountCents:100,payerEmail:'buyer@example.com',method:'card'}),{status:503});
  });
});


test('Connected seller Checkout uses Stripe-Account header only when verified for payouts', async () => {
  await env({ STRIPE_SECRET_KEY:'sk_test_stub', APP_BASE_URL:'https://reusa.example', STRIPE_DEMO_MODE:'false' }, async () => {
    const originalFetch = global.fetch;
    const sent = [];
    try {
      global.fetch = async (url, options) => {
        sent.push({url, headers:options.headers, body:options.body});
        if (url.endsWith('/accounts/acct_123456')) return {ok:true,json:async()=>({id:'acct_123456',charges_enabled:true,payouts_enabled:true})};
        return {ok:true,json:async()=>({id:'cs_test_seller',url:'https://checkout.stripe.com/c/pay/cs_test_seller'})};
      };
      const response = await stripe.createCheckout({paymentId:'payment-seller-1',postId:'post-2',title:'Mesa',amountCents:3500,payerEmail:'buyer@example.com',method:'card',sellerAccountId:'acct_123456'});
      assert.equal(response.stripeAccountId,'acct_123456');
      assert.equal(sent[1].headers['Stripe-Account'],'acct_123456');
      assert.equal(new URLSearchParams(sent[1].body).get('line_items[0][price_data][unit_amount]'),'3500');
    } finally {global.fetch=originalFetch;}
  });
});

const pendingBrazilianSeller=()=>({id:'acct_brsandbox',object:'v2.core.account',livemode:false,identity:{country:'BR'},dashboard:'full',defaults:{responsibilities:{fees_collector:'stripe',losses_collector:'stripe'}},configuration:{merchant:{applied:true,capabilities:{card_payments:{status:'restricted',status_details:[{code:'requirements_past_due'}]},stripe_balance:{payouts:{status:'pending'}}}}},requirements:{entries:[{description:'identity.individual.id_numbers.br_cpf',awaiting_action_from:'user',minimum_deadline:{status:'past_due'}}]}});

test('Pending seller attempts require explicit sandbox opt-in and never change actual verification flags',async()=>{
  await env({STRIPE_SECRET_KEY:'sk_test_pending',APP_BASE_URL:'https://reusa.example',STRIPE_DEMO_MODE:'false',STRIPE_ALLOW_PENDING_TEST_SELLERS:'false'},async()=>{
    const account=pendingBrazilianSeller();assert.equal(stripe.canAttemptTestCardCharge(account),false);
    process.env.STRIPE_ALLOW_PENDING_TEST_SELLERS='true';assert.equal(stripe.canAttemptTestCardCharge(account),true);
    assert.equal(stripe.sellerView(account).chargesEnabled,false);assert.equal(stripe.sellerView(account).payoutsEnabled,false);
    assert.deepEqual(stripe.sellerView(account).requirementsDue,['identity.individual.id_numbers.br_cpf']);
    const mutations=[
      a=>{a.livemode=true;},a=>{delete a.livemode;},a=>{a.closed=true;},a=>{a.identity.country='US';},a=>{a.dashboard='express';},
      a=>{a.defaults.responsibilities.losses_collector='application';},a=>{a.configuration.merchant.applied=false;},
      a=>{a.configuration.merchant.capabilities.card_payments.status='rejected';},a=>{a.configuration.merchant.capabilities.card_payments.status='unsupported';},
      a=>{a.configuration.merchant.capabilities.card_payments.status_details=[{code:'rejected_fraud'}];},
      a=>{a.configuration.merchant.capabilities.stripe_balance.payouts.status='rejected';}
    ];
    for(const mutate of mutations){const candidate=pendingBrazilianSeller();mutate(candidate);assert.equal(stripe.canAttemptTestCardCharge(candidate),false);}
    process.env.STRIPE_DEMO_MODE='true';assert.equal(stripe.canAttemptTestCardCharge(account),false);
    process.env.STRIPE_DEMO_MODE='false';process.env.STRIPE_SECRET_KEY='sk_live_pending';assert.equal(stripe.canAttemptTestCardCharge(account),false);
  });
});

test('An opted-in Brazilian sandbox Checkout is created on the seller and still honors provider rejection',async()=>{
  await env({STRIPE_SECRET_KEY:'sk_test_pending',APP_BASE_URL:'https://reusa.example',STRIPE_DEMO_MODE:'false',STRIPE_ALLOW_PENDING_TEST_SELLERS:'true',STRIPE_PIX_ENABLED:'true'},async()=>{
    const original=global.fetch,originalError=console.error,sent=[];let reject=false;
    try{
      console.error=()=>{};
      global.fetch=async(url,options)=>{
        if(new URL(url).pathname==='/v2/core/accounts/acct_brsandbox')return new Response(JSON.stringify(pendingBrazilianSeller()),{headers:{'Content-Type':'application/json'}});
        sent.push(options);assert.equal(options.headers['Stripe-Account'],'acct_brsandbox');
        return reject?new Response(JSON.stringify({error:{type:'invalid_request_error',code:'account_invalid',message:'This seller cannot currently make charges.'}}),{status:400,headers:{'Content-Type':'application/json'}}):new Response(JSON.stringify({id:'cs_test_connected',url:'https://checkout.stripe.com/c/pay/connected',livemode:false}),{headers:{'Content-Type':'application/json'}});
      };
      const details={paymentId:'connected-test',postId:'post',amountCents:2500,payerEmail:'buyer@example.test',method:'card',sellerAccountId:'acct_brsandbox',sellerAccountVersion:'v2'};
      const result=await stripe.createCheckout(details);assert.equal(result.stripeAccountId,'acct_brsandbox');
      assert.equal(sent[0].headers['Idempotency-Key'],'connected-test');assert.equal(new URLSearchParams(sent[0].body).get('allowed_payment_method_types[0]'),'card');
      assert.equal(new URLSearchParams(sent[0].body).get('line_items[0][price_data][currency]'),'brl');
      await assert.rejects(stripe.createCheckout({...details,method:'pix'}),{status:409});assert.equal(sent.length,1,'the sandbox exception only permits card attempts');
      reject=true;await assert.rejects(stripe.createCheckout(details),error=>{
        assert.equal(error.checkoutRejected,true);assert.match(error.message,/seller cannot currently make charges/);return true;
      });
    }finally{global.fetch=original;console.error=originalError;}
  });
});

test('Pausing live sales still allows reconciliation and refunds for existing payments', async () => {
  await env({STRIPE_SECRET_KEY:'sk_live_stub',APP_BASE_URL:'https://reusa.example',STRIPE_DEMO_MODE:'false',STRIPE_ENABLE_LIVE:'false'},async()=>{
    const original=global.fetch;
    try {
      global.fetch=async(url,options)=>{
        assert.equal(options.headers['Stripe-Account'],'acct_paused');
        if(url.includes('/payment_intents/'))return {ok:true,json:async()=>({id:'pi_existing'})};
        assert.equal(options.headers['Idempotency-Key'],'reusa-refund-payment-existing');
        return {ok:true,json:async()=>({id:'re_existing',status:'pending'})};
      };
      assert.equal((await stripe.paymentIntent('pi_existing','acct_paused')).id,'pi_existing');
      assert.equal((await stripe.refund('pi_existing','acct_paused','payment-existing')).id,'re_existing');
      await assert.rejects(stripe.createCheckout({paymentId:'p',postId:'post',title:'Item',amountCents:2500,payerEmail:'buyer@example.com',method:'card',sellerAccountId:'acct_paused'}),{status:503});
    }finally{global.fetch=original;}
  });
});

test('Connect errors without error.code retain the provider reason and Stripe request ID', async () => {
  await env({STRIPE_SECRET_KEY:'sk_test_error_test',APP_BASE_URL:'https://reusa.example',STRIPE_DEMO_MODE:'false'},async()=>{
    const originalFetch=global.fetch,originalError=console.error,logs=[];
    try {
      console.error=(...args)=>logs.push(args);
      global.fetch=async()=>new Response(JSON.stringify({error:{type:'invalid_request_error',message:"You can only create new accounts if you've signed up for Connect, which you can learn how to do at https://stripe.com/docs/connect."}}),{status:400,headers:{'Content-Type':'application/json','request-id':'req_connect_error'}});
      await assert.rejects(stripe.createConnectedAccount('seller@example.test','test-onboarding-key'),error=>{
        assert.equal(error.status,400);assert.equal(error.stripeCode,'invalid_request_error');
        assert.equal(error.stripeRequestId,'req_connect_error');assert.match(error.stripeMessage,/signed up for Connect/);
        assert.match(error.message,/perfil da plataforma Connect/);assert.equal(error.checkoutRejected,false);return true;
      });
      const diagnostic=logs[0][1];assert.equal(diagnostic.endpoint,'/v2/core/accounts');assert.equal(diagnostic.stripeRequestId,'req_connect_error');assert.match(diagnostic.message,/signed up for Connect/);
    }finally{global.fetch=originalFetch;console.error=originalError;}
  });
});

test('Onboarding diagnostics redact API keys, webhook secrets, email, personal numbers and URL tokens', async () => {
  await env({STRIPE_SECRET_KEY:'sk_test_do_not_log_me',STRIPE_WEBHOOK_SECRET:'whsec_do_not_log_me',APP_BASE_URL:'https://reusa.example',STRIPE_DEMO_MODE:'false'},async()=>{
    const originalFetch=global.fetch,originalError=console.error,logs=[];
    try {
      console.error=(...args)=>logs.push(args);
      global.fetch=async()=>new Response(JSON.stringify({error:{type:'invalid_request_error',param:'return_url',message:'Invalid return_url https://user:private-password@reusa.example/configuracoes?state=private-state#private-fragment; sk_test_do_not_log_me whsec_do_not_log_me seller@example.test 123.456.789-00'}}),{status:400,headers:{'Content-Type':'application/json','request-id':'req_redacted'}});
      await assert.rejects(stripe.accountLink('acct_example','https://reusa.example/refresh','https://reusa.example/configuracoes'),error=>{
        assert.match(error.message,/Invalid return_url/);assert.equal(error.stripeParam,'return_url');
        const captured=JSON.stringify(logs)+' '+error.message+' '+error.stripeMessage;
        for(const value of ['sk_test_do_not_log_me','whsec_do_not_log_me','seller@example.test','123.456.789-00','private-password','private-state','private-fragment'])assert.equal(captured.includes(value),false,value);
        return true;
      });
    }finally{global.fetch=originalFetch;console.error=originalError;}
  });
});

test('Stripe authentication errors explain which configuration to update without returning the key', async () => {
  await env({STRIPE_SECRET_KEY:'sk_test_rejected_key',APP_BASE_URL:'https://reusa.example',STRIPE_DEMO_MODE:'false'},async()=>{
    const originalFetch=global.fetch,originalError=console.error;
    try {
      console.error=()=>{};
      global.fetch=async()=>new Response(JSON.stringify({error:{type:'authentication_error',message:'Invalid API Key provided: sk_test_rejected_key'}}),{status:401,headers:{'Content-Type':'application/json'}});
      await assert.rejects(stripe.createConnectedAccount('seller@example.test','test-onboarding-key'),error=>{
        assert.equal(error.status,503);assert.match(error.message,/STRIPE_SECRET_KEY/);assert.equal(error.stripeMessage.includes('sk_test_rejected_key'),false);return true;
      });
    }finally{global.fetch=originalFetch;console.error=originalError;}
  });
});

test('An inaccessible connected account reports the key/permission mismatch instead of a generic failure', async () => {
  await env({STRIPE_SECRET_KEY:'sk_test_permission_example',APP_BASE_URL:'https://reusa.example',STRIPE_DEMO_MODE:'true'},async()=>{
    const originalFetch=global.fetch,originalError=console.error;
    try {
      console.error=()=>{};
      global.fetch=async()=>new Response(JSON.stringify({error:{type:'api_error',code:'forbidden',message:'Permission denied for old account.'}}),{status:403,headers:{'Content-Type':'application/json','request-id':'req_permission'}});
      await assert.rejects(stripe.connectedAccount('acct_previous','v2'),error=>{
        assert.equal(error.stripeCode,'forbidden');assert.equal(error.stripeRequestId,'req_permission');assert.equal(error.uncertain,false);
        assert.match(error.message,/chave Stripe atual não tem acesso/);return true;
      });
    }finally{global.fetch=originalFetch;console.error=originalError;}
  });
});

test('Expected sandbox access probes are informational while authentication, production and financial failures remain errors', async () => {
  const originalFetch=global.fetch,originalError=console.error,originalInfo=console.info;
  try {
    for(const scenario of [
      {version:'v1',probe:true,status:403,code:'forbidden',info:true},
      {version:'v2',probe:true,status:403,code:'forbidden',info:true},
      {version:'v2',probe:true,status:404,code:'resource_missing',info:true},
      {version:'v2',probe:false,status:403,code:'forbidden',info:false},
      {version:'v2',probe:true,status:401,code:'api_key_expired',info:false},
      {version:'v2',probe:true,status:500,code:'api_error',info:false},
      {version:'v2',probe:true,status:403,code:'forbidden',live:true,info:false}
    ]) {
      await env({STRIPE_SECRET_KEY:scenario.live?'sk_live_probe_fixture':'sk_test_probe_fixture',APP_BASE_URL:'https://reusa.example',STRIPE_DEMO_MODE:'false'},async()=>{
        const infos=[],errors=[];console.info=(...args)=>infos.push(args);console.error=(...args)=>errors.push(args);
        global.fetch=async()=>new Response(JSON.stringify({error:{type:'api_error',code:scenario.code,message:'Access probe sk_test_probe_fixture seller@example.test'}}),{status:scenario.status,headers:{'Content-Type':'application/json','request-id':'req_access_probe'}});
        await assert.rejects(stripe.connectedAccount('acct_previous',scenario.version,{accessCheck:scenario.probe}),error=>{
          assert.equal(error.stripeCode,scenario.code);assert.equal(error.stripeRequestId,'req_access_probe');return true;
        });
        assert.equal(infos.length,scenario.info?1:0);assert.equal(errors.length,scenario.info?0:1);
        const diagnostic=(infos[0]||errors[0])[1];assert.equal(diagnostic.status,scenario.status);assert.equal(diagnostic.stripeRequestId,'req_access_probe');
        assert.equal(JSON.stringify(diagnostic).includes('sk_test_probe_fixture'),false);
        assert.equal(JSON.stringify(diagnostic).includes('seller@example.test'),false);
        // A direct charge also reads the seller, but never opts into an access probe.
        if(scenario.info&&scenario.status===403&&scenario.version==='v1'){
          infos.length=0;errors.length=0;
          await assert.rejects(stripe.createCheckout({paymentId:'p',postId:'post',amountCents:2500,payerEmail:'buyer@example.test',method:'card',sellerAccountId:'acct_previous'}));
          assert.equal(infos.length,0);assert.equal(errors.length,1);
        }
      });
    }
  }finally{global.fetch=originalFetch;console.error=originalError;console.info=originalInfo;}
});

test('Provider diagnostic changes preserve checkout rejection and ambiguous response handling', async () => {
  await env({STRIPE_SECRET_KEY:'sk_test_error_test',APP_BASE_URL:'https://reusa.example',STRIPE_DEMO_MODE:'true'},async()=>{
    const originalFetch=global.fetch,originalError=console.error;
    try {
      console.error=()=>{};
      for(const status of [400,409,429,500]){
        global.fetch=async()=>({ok:false,status,json:async()=>({error:{type:'invalid_request_error',message:'Provider rejected request'}})});
        await assert.rejects(stripe.createCheckout({paymentId:'payment-error-test',postId:'post',amountCents:2500,payerEmail:'buyer@example.test',method:'card'}),error=>{
          assert.equal(error.checkoutRejected,status===400);assert.equal(error.uncertain,status!==400);return true;
        });
      }
    }finally{global.fetch=originalFetch;console.error=originalError;}
  });
});

test('Seller creation uses Accounts v2 with Stripe collecting losses and fees', async () => {
  await env({STRIPE_SECRET_KEY:'sk_test_v2_contract',APP_BASE_URL:'https://reusa.example',STRIPE_DEMO_MODE:'false'},async()=>{
    const original=global.fetch;
    try {
      global.fetch=async(url,options)=>{
        assert.equal(new URL(url).pathname,'/v2/core/accounts');assert.equal(options.method,'POST');
        const headers=new Headers(options.headers);assert.match(headers.get('content-type'),/application\/json/);assert.equal(headers.get('idempotency-key'),'seller-v2-test');
        const body=JSON.parse(options.body);assert.equal(body.type,undefined);assert.equal(body.contact_email,'seller@example.test');assert.equal(body.identity.country,'BR');
        assert.equal(body.dashboard,'full');assert.deepEqual(body.defaults.responsibilities,{fees_collector:'stripe',losses_collector:'stripe'});assert.equal(body.configuration.merchant.capabilities.card_payments.requested,true);
        return new Response(JSON.stringify({id:'acct_managed',object:'v2.core.account',livemode:false}),{headers:{'Content-Type':'application/json'}});
      };
      assert.equal((await stripe.createConnectedAccount('seller@example.test','seller-v2-test')).id,'acct_managed');
    }finally{global.fetch=original;}
  });
});

test('Accounts v2 onboarding has its own use_case and dashboard access requires no Express login link', async()=>{
  await env({STRIPE_SECRET_KEY:'sk_test_v2_contract',APP_BASE_URL:'https://reusa.example',STRIPE_DEMO_MODE:'false'},async()=>{
    const original=global.fetch;let calls=0;
    try {
      global.fetch=async(url,options)=>{
        calls++;assert.equal(new URL(url).pathname,'/v2/core/account_links');
        assert.deepEqual(JSON.parse(options.body),{account:'acct_managed',use_case:{type:'account_onboarding',account_onboarding:{refresh_url:'https://reusa.example/refresh',return_url:'https://reusa.example/configuracoes'}}});
        return new Response(JSON.stringify({object:'v2.core.account_link',url:'https://connect.stripe.com/setup/example'}),{headers:{'Content-Type':'application/json'}});
      };
      assert.equal((await stripe.accountLink('acct_managed','https://reusa.example/refresh','https://reusa.example/configuracoes','v2')).url,'https://connect.stripe.com/setup/example');
      assert.equal((await stripe.dashboardLink('acct_managed','v2')).url,'https://dashboard.stripe.com/');assert.equal(calls,1);
    }finally{global.fetch=original;}
  });
});

test('Accounts v2 must have active card and payout capabilities; missing data or closed accounts cannot charge', ()=>{
  const account={id:'acct_managed',object:'v2.core.account',dashboard:'full',defaults:{responsibilities:{fees_collector:'stripe',losses_collector:'stripe'}},configuration:{merchant:{capabilities:{card_payments:{status:'active'},stripe_balance:{payouts:{status:'active'}}}}},requirements:{entries:[]}};
  assert.equal(stripe.sellerView(account).chargesEnabled,true);assert.equal(stripe.sellerView(account).payoutsEnabled,true);
  assert.equal(stripe.sellerView({...account,configuration:undefined}).chargesEnabled,false);
  assert.equal(stripe.sellerView({...account,defaults:undefined}).chargesEnabled,false);
  assert.equal(stripe.sellerView({...account,defaults:{responsibilities:{fees_collector:'stripe',losses_collector:'application'}}}).chargesEnabled,false);
  assert.equal(stripe.sellerView({...account,closed:true}).chargesEnabled,false);
  assert.equal(stripe.sellerView({...account,closed:true}).payoutsEnabled,false);
  const deactivated={...account,configuration:{merchant:{...account.configuration.merchant,applied:false}}};
  assert.equal(stripe.sellerView(deactivated).chargesEnabled,false);assert.equal(stripe.sellerView(deactivated).payoutsEnabled,false);
  const pending=stripe.sellerView({...account,configuration:{merchant:{capabilities:{card_payments:{status:'pending'}}}},requirements:{entries:[{awaiting_action_from:'user',description:'Dados de teste',minimum_deadline:{status:'currently_due'}},{awaiting_action_from:'stripe',minimum_deadline:{status:'currently_due'}}]}});
  assert.equal(pending.chargesEnabled,false);assert.equal(pending.payoutsEnabled,false);assert.equal(pending.pendingVerification,true);assert.deepEqual(pending.requirementsDue,['Dados de teste']);
});
