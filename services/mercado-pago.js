const crypto = require('crypto');
const QRCode = require('qrcode');
const MERCADO_PAGO_API = 'https://api.mercadopago.com';
const MERCADO_PAGO_AUTH = 'https://auth.mercadopago.com/authorization';

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
    // Log only the provider's validation codes/field hints, never credentials
    // or the raw request/response (which may contain personal information).
    const causes = Array.isArray(body?.cause) ? body.cause : [];
    const diagnostics = {
      status: response.status,
      code: typeof body?.code === 'string' ? body.code.slice(0, 100) : undefined,
      message: typeof body?.message === 'string' ? body.message.slice(0, 300) : undefined,
      causes: causes.slice(0, 5).map((cause) => ({
        code: typeof cause?.code === 'string' || typeof cause?.code === 'number' ? String(cause.code).slice(0, 80) : undefined,
        description: typeof cause?.description === 'string' ? cause.description.slice(0, 250) : undefined
      }))
    };
    console.error('[mercadopago-api] order request rejected', diagnostics);
    const error = new Error('Mercado Pago rejected the order creation request');
    error.status = response.status;
    error.providerCode = diagnostics.code;
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
  // Checkout Pro uses exclusion rules. Remove alternate payment methods to honor
  // the payment type accepted by the seller; this is separate from sandbox availability.
  const paymentRules = {
    // Avoid aggressive exclusions until the provider confirms the available
    // payment methods for this seller and environment.
    pix: { not_allowed_types: ['credit_card', 'debit_card', 'ticket'] },
    boleto: { not_allowed_types: ['credit_card', 'debit_card', 'bank_transfer'] },
    card: { not_allowed_types: ['ticket', 'bank_transfer'] }
  };
  const selectedPaymentRule = paymentRules[method];
  if (!selectedPaymentRule) {
    throw Object.assign(new Error('Unsupported payment method for checkout'), { status: 400 });
  }
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
        payment_method: selectedPaymentRule
      }
    })
  }, sellerAccessToken);
  if (!result?.id || !result?.checkout_url) {
    throw Object.assign(new Error('Mercado Pago returned an invalid checkout order'), { status: 502 });
  }
  return { id: String(result.id), checkoutUrl: String(result.checkout_url) };
}


function pixEnabled() {
  // Explicit opt-in, because test Pix orders cannot emulate a real transfer.
  // Pilot safety guard: do not allow direct Pix charges using production credentials.
  return testMode() && process.env.MERCADOPAGO_PIX_ENABLED === 'true';
}

function pixDetails(providerOrder) {
  const method = providerOrder?.transactions?.payments?.[0]?.payment_method;
  if (method?.id !== 'pix') return null;
  const qrCode = typeof method.qr_code === 'string' ? method.qr_code : '';
  const qrCodeBase64 = typeof method.qr_code_base64 === 'string' && /^[a-zA-Z0-9+/=]+$/.test(method.qr_code_base64) && method.qr_code_base64.length <= 500000
    ? method.qr_code_base64 : '';
  const ticketUrl = typeof method.ticket_url === 'string' && /^https:\/\/(?:[a-z0-9-]+\.)*mercadopago\.com(?:\.br)?\//i.test(method.ticket_url)
    ? method.ticket_url : null;
  return { qrCode: qrCode.slice(0, 5000), qrCodeBase64, ticketUrl };
}

async function pixDisplay(providerOrder) {
  const details = pixDetails(providerOrder);
  if (!details) return null;
  // Pix sandbox commonly omits qr_code_base64. Generate the image from the
  // returned Pix copy-and-paste payload, never inventing the payment itself.
  if (details.qrCode && !details.qrCodeBase64) {
    const png = await QRCode.toDataURL(details.qrCode, { errorCorrectionLevel: 'M', margin: 2, width: 320 });
    details.qrCodeBase64 = png.replace(/^data:image\/png;base64,/, '');
  }
  return details;
}

async function createPixOrder({ paymentId, amountCents, payerEmail, sellerAccessToken }) {
  if (!pixEnabled()) throw Object.assign(new Error('O Pix integrado ainda não está habilitado.'), { status: 503 });
  if (!isConfigured() || !sellerAccessToken) throw Object.assign(new Error('Mercado Pago is not configured'), { status: 503 });
  if (!Number.isSafeInteger(amountCents) || amountCents < 100 || !payerEmail) {
    throw Object.assign(new Error('Invalid Pix amount or payer email'), { status: 400 });
  }
  const amount = (amountCents / 100).toFixed(2);
  const response = await mercadoPagoRequest('/v1/orders', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': paymentId },
    body: JSON.stringify({
      type: 'online',
      processing_mode: 'automatic',
      total_amount: amount,
      external_reference: paymentId,
      payer: { email: payerEmail, ...(testMode() ? { first_name: 'APRO' } : {}) },
      transactions: { payments: [{
        amount,
        payment_method: { id: 'pix', type: 'bank_transfer' }
      }] }
    })
  }, sellerAccessToken);
  if (!response?.id || response.external_reference && response.external_reference !== paymentId) {
    throw Object.assign(new Error('Mercado Pago returned an invalid Pix order'), { status: 502 });
  }
  const pix = await pixDisplay(response);
  if (!pix || (!pix.qrCode && !pix.ticketUrl)) {
    throw Object.assign(new Error('Mercado Pago did not return Pix instructions'), { status: 502 });
  }
  return { id: String(response.id), checkoutUrl: null, pix };
}

async function order(orderId, sellerAccessToken) {
  if (!sellerAccessToken) throw Object.assign(new Error('Seller access token is required'), { status: 503 });
  return mercadoPagoRequest(`/v1/orders/${encodeURIComponent(orderId)}`, {}, sellerAccessToken);
}

// No payment is accepted based solely on webhook payloads or browser redirects.
function verifiedOrderStatus(providerOrder, storedPayment) {
  const pixPayment = providerOrder?.transactions?.payments?.[0];
  const isPix = storedPayment?.method === 'pix' && pixPayment?.payment_method?.id === 'pix';
  const correctCurrency = String(providerOrder?.currency) === String(storedPayment?.currency) ||
    (isPix && storedPayment?.currency === 'BRL' && providerOrder?.country_code === 'BRA');
  if (!providerOrder || !storedPayment ||
      String(providerOrder.id) !== String(storedPayment.provider_reference) ||
      String(providerOrder.external_reference) !== String(storedPayment.id) ||
      !correctCurrency ||
      toCents(providerOrder.total_amount) !== Number(storedPayment.amount_cents)) {
    throw Object.assign(new Error('Mercado Pago order does not match the recorded payment'), { status: 409 });
  }
  const status = String(providerOrder.status || '').toLowerCase();
  const detail = String(providerOrder.status_detail || '');
  if (status === 'processed' && detail === 'accredited') {
    const paidAmount = providerOrder.total_paid_amount ?? (isPix && pixPayment.status === 'processed' && pixPayment.status_detail === 'accredited' ? pixPayment.amount : undefined);
    if (toCents(paidAmount) !== Number(storedPayment.amount_cents)) {
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

module.exports = { authorizationUrl, checkoutSellerToken, createOrder, createPixOrder, exchangeCode, isConfigured, oauthConfigured, order, payment, pixDetails, pixDisplay, pixEnabled, protectToken, revealToken, testMode, verifiedOrderStatus, webhookIsValid };
