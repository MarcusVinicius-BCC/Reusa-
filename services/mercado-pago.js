const crypto = require('crypto');
const MERCADO_PAGO_API = 'https://api.mercadopago.com';

function accessToken() {
  return String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
}

function appBaseUrl() {
  return String(process.env.APP_BASE_URL || '').trim().replace(/\/$/, '');
}

function isConfigured() {
  return Boolean(accessToken() && appBaseUrl());
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

async function mercadoPagoRequest(path, options = {}) {
  const response = await fetch(`${MERCADO_PAGO_API}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken()}`,
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

async function createPreference({ paymentId, postId, title, amountCents, payerEmail, method }) {
  if (!isConfigured()) {
    throw Object.assign(new Error('MERCADOPAGO_ACCESS_TOKEN and APP_BASE_URL are required'), { status: 503 });
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
  });
  if (!preference.id || !preference.init_point) {
    throw Object.assign(new Error('Mercado Pago returned an invalid checkout preference'), { status: 502 });
  }
  return { id: preference.id, checkoutUrl: preference.init_point };
}

async function payment(paymentId) {
  return mercadoPagoRequest(`/v1/payments/${encodeURIComponent(paymentId)}`);
}

module.exports = { createPreference, isConfigured, payment, webhookIsValid };
