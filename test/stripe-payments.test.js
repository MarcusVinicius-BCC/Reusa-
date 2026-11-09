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
  const names = ['STRIPE_SECRET_KEY','APP_BASE_URL','STRIPE_DEMO_MODE','STRIPE_ENABLE_LIVE','STRIPE_PIX_ENABLED','STRIPE_WEBHOOK_SECRET','STRIPE_CONNECT_WEBHOOK_SECRET'];
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
        assert.equal(p.get('payment_method_types[0]'), 'card');
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
      global.fetch=async()=>({ok:false,status:400,headers:new Headers({'request-id':'req_connect_error'}),json:async()=>({error:{type:'invalid_request_error',message:"You can only create new accounts if you've signed up for Connect, which you can learn how to do at https://stripe.com/docs/connect."}})});
      await assert.rejects(stripe.createConnectedAccount('seller@example.test','test-onboarding-key'),error=>{
        assert.equal(error.status,400);assert.equal(error.stripeCode,'invalid_request_error');
        assert.equal(error.stripeRequestId,'req_connect_error');assert.match(error.stripeMessage,/signed up for Connect/);
        assert.match(error.message,/perfil da plataforma Connect/);assert.equal(error.checkoutRejected,false);return true;
      });
      const diagnostic=logs[0][1];assert.equal(diagnostic.endpoint,'/accounts');assert.equal(diagnostic.stripeRequestId,'req_connect_error');assert.match(diagnostic.message,/signed up for Connect/);
    }finally{global.fetch=originalFetch;console.error=originalError;}
  });
});

test('Onboarding diagnostics redact API keys, webhook secrets, email, personal numbers and URL tokens', async () => {
  await env({STRIPE_SECRET_KEY:'sk_test_do_not_log_me',STRIPE_WEBHOOK_SECRET:'whsec_do_not_log_me',APP_BASE_URL:'https://reusa.example',STRIPE_DEMO_MODE:'false'},async()=>{
    const originalFetch=global.fetch,originalError=console.error,logs=[];
    try {
      console.error=(...args)=>logs.push(args);
      global.fetch=async()=>({ok:false,status:400,headers:new Headers({'request-id':'req_redacted'}),json:async()=>({error:{type:'invalid_request_error',param:'return_url',message:'Invalid return_url https://user:private-password@reusa.example/configuracoes?state=private-state#private-fragment; sk_test_do_not_log_me whsec_do_not_log_me seller@example.test 123.456.789-00'}})});
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
      global.fetch=async()=>({ok:false,status:401,json:async()=>({error:{type:'authentication_error',message:'Invalid API Key provided: sk_test_rejected_key'}})});
      await assert.rejects(stripe.createConnectedAccount('seller@example.test','test-onboarding-key'),error=>{
        assert.equal(error.status,503);assert.match(error.message,/STRIPE_SECRET_KEY/);assert.equal(error.stripeMessage.includes('sk_test_rejected_key'),false);return true;
      });
    }finally{global.fetch=originalFetch;console.error=originalError;}
  });
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
