const assert = require('node:assert/strict');
const { test } = require('node:test');
const crypto = require('node:crypto');
const mercadoPago = require('../services/mercado-pago');

test('a processed accredited order with exact amount is confirmed', () => {
  const recorded = { id: 'payment-1', provider_reference: 'ORD123', amount_cents: 2500, currency: 'BRL' };
  const provider = { id: 'ORD123', external_reference: 'payment-1', currency: 'BRL', total_amount: '25.00', total_paid_amount: '25.00', status: 'processed', status_detail: 'accredited' };
  assert.equal(mercadoPago.verifiedOrderStatus(provider, recorded), 'succeeded');
});

test('an unconfirmed or differently priced order cannot be approved', () => {
  const recorded = { id: 'payment-1', provider_reference: 'ORD123', amount_cents: 2500, currency: 'BRL' };
  const provider = { id: 'ORD123', external_reference: 'payment-1', currency: 'BRL', total_amount: '25.00', total_paid_amount: '0.00', status: 'created', status_detail: 'created' };
  assert.equal(mercadoPago.verifiedOrderStatus(provider, recorded), 'processing');
  assert.throws(() => mercadoPago.verifiedOrderStatus({ ...provider, status: 'processed', status_detail: 'accredited' }, recorded));
  assert.throws(() => mercadoPago.verifiedOrderStatus({ ...provider, total_amount: '24.99' }, recorded));
  assert.throws(() => mercadoPago.verifiedOrderStatus({ ...provider, external_reference: 'payment-2' }, recorded));
  assert.throws(() => mercadoPago.verifiedOrderStatus({ ...provider, currency: 'USD' }, recorded));
});

test('webhook signature is verified against the official manifest', () => {
  const original = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  process.env.MERCADOPAGO_WEBHOOK_SECRET = 'test-secret';
  try {
    const dataId = 'ORDABC123';
    const requestId = 'request-123';
    const ts = '1742505638683';
    const manifest = `id:ordabc123;request-id:${requestId};ts:${ts};`;
    const v1 = crypto.createHmac('sha256', 'test-secret').update(manifest).digest('hex');
    assert.equal(mercadoPago.webhookIsValid({ dataId, requestId, signature: `ts=${ts},v1=${v1}` }), true);
    assert.equal(mercadoPago.webhookIsValid({ dataId: 'ORDWRONG', requestId, signature: `ts=${ts},v1=${v1}` }), false);
  } finally {
    if (original === undefined) delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
    else process.env.MERCADOPAGO_WEBHOOK_SECRET = original;
  }
});

test('createOrder produces a checkout order and does not expose tokens', async () => {
  const oldFetch = global.fetch;
  const env = {
    MERCADOPAGO_ACCESS_TOKEN: process.env.MERCADOPAGO_ACCESS_TOKEN,
    APP_BASE_URL: process.env.APP_BASE_URL
  };
  process.env.MERCADOPAGO_ACCESS_TOKEN = 'test-platform-token';
  process.env.APP_BASE_URL = 'https://reusa.example';
  try {
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://api.mercadopago.com/v1/orders');
      assert.equal(options.headers.Authorization, 'Bearer seller-token');
      assert.equal(options.headers['X-Idempotency-Key'], 'payment-1');
      const body = JSON.parse(options.body);
      assert.equal(body.type, 'online');
      assert.equal(body.processing_mode, 'manual');
      assert.equal(body.total_amount, '25.00');
      assert.equal(body.external_reference, 'payment-1');
      assert.equal(body.config.online.success_url, 'https://reusa.example/anuncios/post-1');
      assert.equal(body.config.payment_method.default_type, undefined);
      assert.deepEqual(body.config.payment_method.not_allowed_types, ['credit_card', 'debit_card', 'ticket']);
      return { ok: true, json: async () => ({ id: 'ORD123', checkout_url: 'https://www.mercadopago.com.br/checkout/v1/redirect?order_id=ORD123' }) };
    };
    const order = await mercadoPago.createOrder({ paymentId: 'payment-1', postId: 'post-1', title: 'Item ReUsa+', amountCents: 2500, method: 'pix', payerEmail: 'comprador@example.test', sellerAccessToken: 'seller-token' });
    assert.equal(order.id, 'ORD123');
    assert.match(order.checkoutUrl, /^https:\/\/www\.mercadopago\.com\.br/);
  } finally {
    global.fetch = oldFetch;
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('sandbox mode always uses the application test token instead of a seller OAuth token', () => {
  const originalMode = process.env.MERCADOPAGO_TEST_MODE;
  const originalToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  try {
    process.env.MERCADOPAGO_TEST_MODE = 'true';
    process.env.MERCADOPAGO_ACCESS_TOKEN = 'application-test-token';
    assert.equal(mercadoPago.checkoutSellerToken('encrypted-seller-production-token'), 'application-test-token');
    process.env.MERCADOPAGO_TEST_MODE = 'false';
    assert.equal(mercadoPago.checkoutSellerToken('invalid-token'), '');
  } finally {
    if (originalMode === undefined) delete process.env.MERCADOPAGO_TEST_MODE;
    else process.env.MERCADOPAGO_TEST_MODE = originalMode;
    if (originalToken === undefined) delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    else process.env.MERCADOPAGO_ACCESS_TOKEN = originalToken;
  }
});

test('order restricts boleto to tickets and card to card types', async () => {
  const oldFetch = global.fetch;
  const oldToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const oldBaseUrl = process.env.APP_BASE_URL;
  process.env.MERCADOPAGO_ACCESS_TOKEN = 'test-platform-token';
  process.env.APP_BASE_URL = 'https://reusa.example';
  const captured = [];
  try {
    global.fetch = async (_url, options) => {
      captured.push(JSON.parse(options.body).config.payment_method);
      return { ok: true, json: async () => ({ id: 'ORD123', checkout_url: 'https://www.mercadopago.com.br/checkout/v1/redirect?order_id=ORD123' }) };
    };
    for (const method of ['boleto', 'card']) {
      await mercadoPago.createOrder({ paymentId: 'payment-'+method, postId: 'post-1', title: 'Item ReUsa+', amountCents: 2500, method, payerEmail: 'buyer@example.test', sellerAccessToken: 'seller-token' });
    }
    assert.deepEqual(captured[0], { not_allowed_types: ['credit_card', 'debit_card', 'bank_transfer'] });
    assert.deepEqual(captured[1], { not_allowed_types: ['ticket', 'bank_transfer'] });
  } finally {
    global.fetch = oldFetch;
    if (oldToken === undefined) delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    else process.env.MERCADOPAGO_ACCESS_TOKEN = oldToken;
    if (oldBaseUrl === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = oldBaseUrl;
  }
});

test('Pix is opt-in and never silently creates an order', async () => {
  const oldFlag = process.env.MERCADOPAGO_PIX_ENABLED;
  try {
    delete process.env.MERCADOPAGO_PIX_ENABLED;
    assert.equal(mercadoPago.pixEnabled(), false);
    await assert.rejects(mercadoPago.createPixOrder({
      paymentId: 'payment-1', amountCents: 290, payerEmail: 'buyer@example.test', sellerAccessToken: 'seller-token'
    }), /não está habilitado/);
  } finally {
    if (oldFlag === undefined) delete process.env.MERCADOPAGO_PIX_ENABLED;
    else process.env.MERCADOPAGO_PIX_ENABLED = oldFlag;
  }
});

test('Pix automatic order provides QR code and does not expose access tokens', async () => {
  const original = {
    MERCADOPAGO_PIX_ENABLED: process.env.MERCADOPAGO_PIX_ENABLED,
    MERCADOPAGO_ACCESS_TOKEN: process.env.MERCADOPAGO_ACCESS_TOKEN,
    APP_BASE_URL: process.env.APP_BASE_URL
  };
  const previousFetch = global.fetch;
  process.env.MERCADOPAGO_PIX_ENABLED = 'true';
  process.env.MERCADOPAGO_ACCESS_TOKEN = 'test-token';
  process.env.APP_BASE_URL = 'https://reusa.example';
  try {
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://api.mercadopago.com/v1/orders');
      assert.equal(options.headers.Authorization, 'Bearer seller-token');
      assert.equal(options.headers['X-Idempotency-Key'], 'payment-pix-1');
      const body = JSON.parse(options.body);
      assert.equal(body.processing_mode, 'automatic');
      assert.equal(body.total_amount, '2.90');
      assert.equal(body.transactions.payments[0].payment_method.id, 'pix');
      assert.equal(body.transactions.payments[0].payment_method.type, 'bank_transfer');
      return { ok: true, json: async () => ({
        id: 'ORDPIX123', external_reference: 'payment-pix-1',
        transactions: { payments: [{ payment_method: { id: 'pix', type: 'bank_transfer', qr_code: '000201', qr_code_base64: 'aGVsbG8=', ticket_url: 'https://www.mercadopago.com.br/sandbox/payments/123/ticket' } }] }
      }) };
    };
    const order = await mercadoPago.createPixOrder({ paymentId: 'payment-pix-1', amountCents: 290, payerEmail: 'buyer@example.test', sellerAccessToken: 'seller-token' });
    assert.equal(order.id, 'ORDPIX123');
    assert.equal(order.checkoutUrl, null);
    assert.equal(order.pix.qrCode, '000201');
    assert.equal(order.pix.qrCodeBase64, 'aGVsbG8=');
    assert.doesNotMatch(JSON.stringify(order), /seller-token|test-token/);
  } finally {
    global.fetch = previousFetch;
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('Pix webhook validates amount and country and never approves a pending transfer', () => {
  const recorded = { id: 'payment-pix-1', provider_reference: 'ORDPIX123', amount_cents: 290, currency: 'BRL', method: 'pix' };
  const provider = {
    id: 'ORDPIX123', external_reference: 'payment-pix-1', country_code: 'BRA', total_amount: '2.90',
    status: 'action_required', status_detail: 'waiting_transfer',
    transactions: { payments: [{ amount: '2.90', status: 'action_required', status_detail: 'waiting_transfer', payment_method: { id: 'pix' } }] }
  };
  assert.equal(mercadoPago.verifiedOrderStatus(provider, recorded), 'processing');
  const approved = { ...provider, status: 'processed', status_detail: 'accredited',
    transactions: { payments: [{ ...provider.transactions.payments[0], status: 'processed', status_detail: 'accredited' }] } };
  assert.equal(mercadoPago.verifiedOrderStatus(approved, recorded), 'succeeded');
  assert.throws(() => mercadoPago.verifiedOrderStatus({ ...approved, country_code: 'ARG' }, recorded));
  assert.throws(() => mercadoPago.verifiedOrderStatus({ ...approved, transactions: { payments: [{ ...approved.transactions.payments[0], amount: '2.89' }] } }, recorded));
  assert.throws(() => mercadoPago.verifiedOrderStatus({ ...approved, transactions: { payments: [{ ...approved.transactions.payments[0], payment_method: { id: 'card' } }] } }, recorded));
});
