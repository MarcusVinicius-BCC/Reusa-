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

function oauthConfigured() {
  return Boolean(process.env.MERCADOPAGO_CLIENT_ID && process.env.MERCADOPAGO_CLIENT_SECRET && appBaseUrl());
}

function authorizationUrl(state, redirectUri) {
  if (!oauthConfigured()) throw Object.assign(new Error('Mercado Pago OAuth is not configured'), { status: 503 });
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

async function createPreference({ paymentId, postId, title, amountCents, payerEmail, method, sellerAccessToken }) {
  if (!isConfigured() || !sellerAccessToken) {
    throw Object.assign(new Error('Mercado Pago platform credentials and a connected seller account are required'), { status: 503 });
  }
  const preference = await mercadoPagoRequest('/checkout/preferences', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': paymentId },
    body: JSON.stringify({
      items: [{
        id: paymentId,
        title: String(title || 'Compra ReUsa+').slice(0, 256),
        quantity: 1,
        currency_id: 'BRL',
        unit_price: amountCents / 100
      }],
      payer: { email: payerEmail },
      external_reference: paymentId,
      payment_methods: {
        excluded_payment_types: method === 'pix'
          ? [{ id: 'ticket' }, { id: 'credit_card' }]
          : method === 'card'
            ? [{ id: 'ticket' }, { id: 'bank_transfer' }]
            : [{ id: 'credit_card' }, { id: 'bank_transfer' }]
      },
      back_urls: {
        success: `${appBaseUrl()}/anuncios/${encodeURIComponent(postId)}`,
        pending: `${appBaseUrl()}/anuncios/${encodeURIComponent(postId)}`,
        failure: `${appBaseUrl()}/anuncios/${encodeURIComponent(postId)}`
      },
      auto_return: 'approved',
      notification_url: `${appBaseUrl()}/api/payments/mercadopago/webhook`
    })
  }, sellerAccessToken);
  if (!preference.id || !preference.init_point) {
    throw Object.assign(new Error('Mercado Pago returned an invalid checkout preference'), { status: 502 });
  }
  return { id: preference.id, checkoutUrl: preference.init_point };
}

async function payment(paymentId, sellerAccessToken) {
  return mercadoPagoRequest(`/v1/payments/${encodeURIComponent(paymentId)}`, {}, sellerAccessToken || accessToken());
}

module.exports = { authorizationUrl, createPreference, exchangeCode, isConfigured, oauthConfigured, payment, protectToken, revealToken, webhookIsValid };
