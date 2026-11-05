const crypto = require('crypto');
const MERCADO_PAGO_API = 'https://api.mercadopago.com';
const MERCADO_PAGO_AUTH = 'https://auth.mercadopago.com.br/authorization';

function accessToken() {
  return String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
}
function tokenKey() { return crypto.createHash('sha256').update(String(process.env.JWT_SECRET || '')).digest(); }
function protectToken(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', tokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}
function revealToken(value) {
  const parts = String(value || '').split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) return '';
  try {
    const [iv, tag, encrypted] = parts.map((part) => Buffer.from(part, 'base64url'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', tokenKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

function appBaseUrl() {
  return String(process.env.APP_BASE_URL || '').trim().replace(/\/$/, '');
}

function isConfigured() {
  return Boolean(accessToken() && appBaseUrl());
}

function testMode() {
  return process.env.MERCADOPAGO_TEST_MODE === 'true';
}

function checkoutSellerToken(encryptedToken) {
  return testMode() ? accessToken() : revealToken(encryptedToken);
}

function oauthConfigured() {
  return Boolean(String(process.env.MERCADOPAGO_CLIENT_ID || '').trim() && String(process.env.MERCADOPAGO_CLIENT_SECRET || '').trim());
}

function authorizationUrl(state, redirectUri) {
  if (!oauthConfigured()) {
    throw Object.assign(new Error('Configure MERCADOPAGO_CLIENT_ID and MERCADOPAGO_CLIENT_SECRET no ambiente do backend'), { status: 503 });
  }
  const query = new URLSearchParams({
    client_id: String(process.env.MERCADOPAGO_CLIENT_ID),
    response_type: 'code',
    platform_id: 'mp',
    state,
    redirect_uri: redirectUri
  });
  return `${MERCADO_PAGO_AUTH}?${query}`;
}

async function exchangeCode(code, redirectUri) {
  const response = await fetch(`${MERCADO_PAGO_API}/oauth/token`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: String(process.env.MERCADOPAGO_CLIENT_ID),
      client_secret: String(process.env.MERCADOPAGO_CLIENT_SECRET),
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    })
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.access_token) throw Object.assign(new Error('Mercado Pago account authorization failed'), { status: response.status || 502 });
  return body;
}

function webhookIsValid({ dataId, requestId, signature }) {
  const secret = String(process.env.MERCADOPAGO_WEBHOOK_SECRET || '').trim();
  if (!secret || !dataId || !requestId || !signature) return false;
  const values = Object.fromEntries(String(signature).split(',').map((part) => {
    const [key, value] = part.trim().split('=');
    return [key, value];
  }));
  if (!values.ts || !values.v1) return false;
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${values.ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  if (expected.length !== values.v1.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(values.v1));
}

async function mercadoPagoRequest(path, options = {}, bearerToken = accessToken()) {
  const response = await fetch(`${MERCADO_PAGO_API}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearerToken}`,
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.message || `Mercado Pago request failed with status ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}


function toCents(value) {
  const text = String(value ?? '').trim();
  if (!/^[0-9]+(?:[.][0-9]{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

async function createOrder({ paymentId, postId, title, amountCents, payerEmail, method, sellerAccessToken }) {
  if (!isConfigured() || !sellerAccessToken) {
    throw Object.assign(new Error('Mercado Pago platform credentials and a connected seller account are required'), { status: 503 });
  }
  if (!Number.isSafeInteger(amountCents) || amountCents < 100 || !payerEmail) {
    throw Object.assign(new Error('Invalid order amount or payer email'), { status: 400 });
  }
  const amount = (amountCents / 100).toFixed(2);
  const returnUrl = `${appBaseUrl()}/anuncios/${encodeURIComponent(postId)}`;
  // Match the accepted payment method; keep wallet and account money available.
  const excludedTypes = method === 'pix'
    ? ['credit_card', 'debit_card', 'ticket']
    : method === 'card'
      ? ['ticket', 'bank_transfer']
      : method === 'boleto'
        ? ['credit_card', 'debit_card', 'bank_transfer']
        : [];
  const result = await mercadoPagoRequest('/v1/orders', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': paymentId },
    body: JSON.stringify({
      type: 'online',
      processing_mode: 'manual',
      total_amount: amount,
      external_reference: paymentId,
      description: String(title || 'Compra ReUsa+').slice(0, 256),
      payer: { email: payerEmail },
      items: [{ title: String(title || 'Compra ReUsa+').slice(0, 256), unit_price: amount, quantity: 1 }],
      config: {
        online: {
          success_url: returnUrl,
          pending_url: returnUrl,
          failure_url: returnUrl,
          auto_return: 'approved'
        },
        payment_method: { not_allowed_types: excludedTypes }
      }
    })
  }, sellerAccessToken);
  if (!result?.id || !result?.checkout_url) {
    throw Object.assign(new Error('Mercado Pago returned an invalid checkout order'), { status: 502 });
  }
  return { id: String(result.id), checkoutUrl: String(result.checkout_url) };
}

async function order(orderId, sellerAccessToken) {
  if (!sellerAccessToken) throw Object.assign(new Error('Seller access token is required'), { status: 503 });
  return mercadoPagoRequest(`/v1/orders/${encodeURIComponent(orderId)}`, {}, sellerAccessToken);
}

// No payment is accepted based solely on webhook payloads or browser redirects.
function verifiedOrderStatus(providerOrder, storedPayment) {
  if (!providerOrder || !storedPayment ||
      String(providerOrder.id) !== String(storedPayment.provider_reference) ||
      String(providerOrder.external_reference) !== String(storedPayment.id) ||
      String(providerOrder.currency) !== String(storedPayment.currency) ||
      toCents(providerOrder.total_amount) !== Number(storedPayment.amount_cents)) {
    throw Object.assign(new Error('Mercado Pago order does not match the recorded payment'), { status: 409 });
  }
  const status = String(providerOrder.status || '').toLowerCase();
  const detail = String(providerOrder.status_detail || '');
  if (status === 'processed' && detail === 'accredited') {
    if (toCents(providerOrder.total_paid_amount) !== Number(storedPayment.amount_cents)) {
      throw Object.assign(new Error('Mercado Pago reported a different paid amount'), { status: 409 });
    }
    return 'succeeded';
  }
  if (status === 'refunded') return 'refunded';
  // Partial refunds require a separate reconciliation flow; do not claim a full refund.
  if (detail === 'partially_refunded') return null;
  if (status === 'failed' || status === 'canceled' || status === 'cancelled' || status === 'expired') return 'failed';
  if (['created', 'processing', 'action_required', 'pending'].includes(status)) return 'processing';
  return null;
}

// Legacy preference webhooks can still need the Payments API during migration.
async function payment(paymentId, sellerAccessToken) {
  return mercadoPagoRequest(`/v1/payments/${encodeURIComponent(paymentId)}`, {}, sellerAccessToken || accessToken());
}

module.exports = { authorizationUrl, checkoutSellerToken, createOrder, exchangeCode, isConfigured, oauthConfigured, order, payment, protectToken, revealToken, testMode, verifiedOrderStatus, webhookIsValid };
