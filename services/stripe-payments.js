'use strict';
const Stripe = require('stripe');
const signatureVerifier = new Stripe('sk_test_signature_verification_only');

const STRIPE_API = 'https://api.stripe.com/v1';

function secretKey() { return String(process.env.STRIPE_SECRET_KEY || '').trim(); }
function testMode() { return process.env.STRIPE_DEMO_MODE === 'true'; }
function configured() {
  const key = secretKey();
  return (key.startsWith('sk_test_') || key.startsWith('sk_live_')) && Boolean(String(process.env.APP_BASE_URL || '').trim());
}
function requireReady({operational=false}={}) {
  if (!configured()) throw Object.assign(new Error('Configure STRIPE_SECRET_KEY and APP_BASE_URL.'), { status: 503 });
  let url;
  try { url = new URL(baseUrl()); } catch { throw Object.assign(new Error('APP_BASE_URL inválida.'), { status:503 }); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && ['localhost','127.0.0.1'].includes(url.hostname)))) {
    throw Object.assign(new Error('APP_BASE_URL deve ser a origem pública HTTPS do ReUsa+.'), {status:503});
  }
  if (!operational && testMode() && !secretKey().startsWith('sk_test_')) throw Object.assign(new Error('Demonstração exige sk_test_ da Stripe.'), { status: 503 });
  if (!operational && secretKey().startsWith('sk_live_') && process.env.STRIPE_ENABLE_LIVE !== 'true') throw Object.assign(new Error('Pagamentos reais Stripe não estão habilitados.'), { status: 503 });
  if (!operational && secretKey().startsWith('sk_live_') && (process.env.STRIPE_CONNECT_ENABLED !== 'true' || !String(process.env.STRIPE_WEBHOOK_SECRET||'').startsWith('whsec_') || !String(process.env.STRIPE_CONNECT_WEBHOOK_SECRET||'').startsWith('whsec_') || process.env.STRIPE_WEBHOOK_SECRET===process.env.STRIPE_CONNECT_WEBHOOK_SECRET)) {
    throw Object.assign(new Error('Configure Connect e os dois segredos de webhook antes de receber pagamentos reais.'), {status:503});
  }
}
function demoEnabled() { return testMode() && secretKey().startsWith('sk_test_') && configured(); }
function baseUrl() { return String(process.env.APP_BASE_URL || '').trim().replace(/\/$/, ''); }

function flatten(form, key, value) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) return value.forEach((item, i) => flatten(form, `${key}[${i}]`, item));
  if (typeof value === 'object') return Object.entries(value).forEach(([name, item]) => flatten(form, `${key}[${name}]`, item));
  form.append(key, String(value));
}
async function request(method, path, body, { accountId, idempotencyKey } = {}) {
  // A pause on new sales must not stop reconciliation, refunds or seller support.
  requireReady({operational:true});
  if (accountId && !/^acct_[A-Za-z0-9]+$/.test(accountId)) throw Object.assign(new Error('Invalid Stripe connected account'), { status: 400 });
  const headers = { Authorization: `Bearer ${secretKey()}`, Accept: 'application/json', 'Stripe-Version': Stripe.API_VERSION };
  if (accountId) headers['Stripe-Account'] = accountId;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const options = { method, headers, signal: AbortSignal.timeout(15000) };
  if (body) {
    const form = new URLSearchParams();
    Object.entries(body).forEach(([key, value]) => flatten(form, key, value));
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    options.body = form.toString();
  }
  let response;
  try { response = await fetch(STRIPE_API + path, options); }
  catch { throw Object.assign(new Error('A confirmação da Stripe demorou. Consulte o status antes de tentar novamente.'), {status:502, uncertain:true}); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = typeof data?.error?.code === 'string' ? data.error.code : 'stripe_api_error';
    const type = typeof data?.error?.type === 'string' ? data.error.type : 'api_error';
    console.error('[stripe] request failed', { status: response.status, type, code });
    const error = new Error('Stripe recusou a solicitação: ' + code);
    error.status = response.status === 401 || response.status === 403 ? 503 : Math.max(400, Math.min(502, response.status));
    error.uncertain = response.status >= 500 || response.status === 429 || response.status === 409;
    error.checkoutRejected = method === 'POST' && path === '/checkout/sessions' && response.status >= 400 && response.status < 500 && !error.uncertain;
    error.refundRejected = method === 'POST' && path === '/refunds' && response.status >= 400 && response.status < 500 && !error.uncertain;
    error.stripeCode = code;
    throw error;
  }
  return data;
}
async function connectedAccount(accountId) {
  if (!accountId) return null;
  return request('GET', '/accounts/' + encodeURIComponent(accountId));
}
async function createConnectedAccount(email, idempotencyKey) {
  if (demoEnabled()) throw Object.assign(new Error('Contas de vendedores são simuladas no modo demonstração.'), { status: 400 });
  return request('POST', '/accounts', {
    type: 'express', country: 'BR', email,
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } }
  }, { idempotencyKey });
}
async function accountLink(accountId, refreshUrl, returnUrl) {
  return request('POST', '/account_links', { account: accountId, type: 'account_onboarding', refresh_url: refreshUrl, return_url: returnUrl });
}
async function createCheckout({ paymentId, postId, title, amountCents, payerEmail, method, sellerAccountId, returnBaseUrl, expiresAt }) {
  requireReady();
  if (!Number.isSafeInteger(amountCents) || amountCents < 100 || !payerEmail || !['card', 'pix'].includes(method)) {
    throw Object.assign(new Error('Invalid checkout details'), { status: 400 });
  }
  if (method === 'pix' && process.env.STRIPE_PIX_ENABLED !== 'true') {
    throw Object.assign(new Error('Pix não está habilitado na Stripe. Habilite-o na conta antes de selecionar Pix.'), { status: 503 });
  }
  let accountId = null;
  if (!demoEnabled()) {
    if (!sellerAccountId) throw Object.assign(new Error('O vendedor precisa conectar sua conta Stripe.'), { status: 409 });
    const account = await connectedAccount(sellerAccountId);
    if (!account?.charges_enabled || !account?.payouts_enabled) throw Object.assign(new Error('A conta Stripe do vendedor ainda não está habilitada para cobranças e repasses.'), { status: 409 });
    accountId = sellerAccountId;
  }
  const returnUrl = (returnBaseUrl || baseUrl()) + '/anuncios/' + encodeURIComponent(postId);
  const result = await request('POST', '/checkout/sessions', {
    mode: 'payment',
    expires_at: expiresAt,
    client_reference_id: paymentId,
    customer_email: payerEmail,
    payment_method_types: [method],
    line_items: [{ price_data: { currency: 'brl', product_data: { name: String(title || 'Anúncio ReUsa+').slice(0, 120) }, unit_amount: amountCents }, quantity: 1 }],
    metadata: { payment_id: paymentId, post_id: postId },
    payment_intent_data: { metadata: { payment_id: paymentId } },
    success_url: returnUrl + '?stripe_session_id={CHECKOUT_SESSION_ID}',
    cancel_url: returnUrl + '?stripe_cancelled=1'
  }, { accountId, idempotencyKey: paymentId });
  if (!result?.id?.startsWith('cs_') || !/^https:\/\/(?:checkout|pay)\.stripe\.com\//.test(result.url || '')) {
    throw Object.assign(new Error('Stripe não retornou uma sessão válida.'), { status: 502 });
  }
  return { id: result.id, checkoutUrl: result.url, stripeAccountId: accountId };
}
async function checkoutSession(sessionId, accountId) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(String(sessionId || ''))) throw Object.assign(new Error('Invalid checkout session ID'), { status: 400 });
  return request('GET', '/checkout/sessions/' + encodeURIComponent(sessionId), undefined, { accountId });
}
function verifiedSessionStatus(session, payment, eventType) {
  if (!session || !payment ||
      session.id !== payment.provider_reference ||
      session.client_reference_id !== payment.id ||
      session.metadata?.payment_id !== payment.id ||
      session.mode !== 'payment' ||
      String(session.currency).toLowerCase() !== String(payment.currency).toLowerCase() ||
      session.amount_total !== Number(payment.amount_cents)) {
    throw Object.assign(new Error('Stripe session does not match the recorded payment'), { status: 409 });
  }
  if (session.status === 'complete' && session.payment_status === 'paid') return 'succeeded';
  if (session.status === 'expired' || eventType === 'checkout.session.async_payment_failed') return 'failed';
  if (session.status === 'open' || session.status === 'complete') return 'processing';
  return null;
}
function webhookEvent(rawBody, signature, connected = false) {
  const secret = String((connected ? process.env.STRIPE_CONNECT_WEBHOOK_SECRET : process.env.STRIPE_WEBHOOK_SECRET) || '').trim();
  if (!secret || !Buffer.isBuffer(rawBody) || rawBody.length > 1024 * 1024) return null;
  try { return signatureVerifier.webhooks.constructEvent(rawBody, signature, secret, 300); } catch { return null; }
}
const liveMode = () => secretKey().startsWith('sk_live_');
const dashboardLink = accountId => request('POST', '/accounts/' + encodeURIComponent(accountId) + '/login_links');
const paymentIntent = (id, accountId) => request('GET', '/payment_intents/' + encodeURIComponent(id) + '?expand[]=latest_charge', undefined, {accountId});
const dispute = (id, accountId) => request('GET', '/disputes/' + encodeURIComponent(id), undefined, {accountId});
const disputes = (intent, accountId) => request('GET', '/disputes?payment_intent=' + encodeURIComponent(intent) + '&limit=10', undefined, {accountId});
const refund = (intent, accountId, paymentId) => request('POST', '/refunds', {payment_intent:intent, metadata:{payment_id:paymentId}}, {accountId,idempotencyKey:'reusa-refund-' + paymentId});
const refundStatus = (id, accountId) => request('GET', '/refunds/' + encodeURIComponent(id), undefined, {accountId});
const refunds = (intent, accountId) => request('GET', '/refunds?payment_intent=' + encodeURIComponent(intent) + '&limit=100', undefined, {accountId});
function sellerView(account) {
  return {connected:!!account, chargesEnabled:!!account?.charges_enabled, payoutsEnabled:!!account?.payouts_enabled,
    detailsSubmitted:!!account?.details_submitted, requirementsDue:(account?.requirements?.currently_due || []).map(String),
    pendingVerification:!!account?.requirements?.pending_verification?.length, disabledReason:account?.requirements?.disabled_reason || null};
}
module.exports = { configured, requireReady, liveMode, demoEnabled, testMode, createConnectedAccount, accountLink, connectedAccount, createCheckout, checkoutSession, verifiedSessionStatus, webhookEvent, dashboardLink, paymentIntent, dispute, disputes, refund, refundStatus, refunds, sellerView };
