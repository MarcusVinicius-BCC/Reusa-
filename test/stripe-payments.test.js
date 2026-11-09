const assert = require('node:assert/strict');
const { test } = require('node:test');
const crypto = require('node:crypto');
const stripe = require('../services/stripe-payments');

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
