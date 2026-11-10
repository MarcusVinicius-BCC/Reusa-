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

function safeProviderMessage(value) {
  let message = typeof value === 'string' ? value : '';
  for (const secret of [secretKey(), process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET, process.env.STRIPE_ACCOUNT_WEBHOOK_SECRET]) {
    if (secret && secret.length >= 8) message = message.split(secret).join('[segredo ocultado]');
  }
  return message
    .replace(/\b(?:sk|rk|pk)_(?:test|live)_[A-Za-z0-9_.*-]+/gi, '[chave ocultada]')
    .replace(/\bwhsec_[A-Za-z0-9_.*-]+/gi, '[segredo ocultado]')
    .replace(/\b(?:pi|seti)_[A-Za-z0-9_]+_secret_[A-Za-z0-9_]+/g, '[segredo ocultado]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [ocultado]')
    .replace(/https?:\/\/[^\s<>"']+/gi, value => {
      try {const url=new URL(value);url.username='';url.password='';url.search='';url.hash='';return url.toString();}
      catch {return '[URL ocultada]';}
    })
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[token ocultado]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email ocultado]')
    .replace(/\b(?:\d[ .\/-]?){8,18}\d\b/g, '[número ocultado]')
    .replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600);
}

function stripeFailure(method, path, response, data) {
  const raw = data?.error || {};
  const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9_]{1,100}$/.test(value) ? value : null;
  const type = identifier(raw.type) || 'api_error';
  const code = identifier(raw.code) || type;
  const message = safeProviderMessage(raw.message);
  const providerRequest = response.headers?.get?.('request-id') || raw.request_id;
  const stripeRequestId = typeof providerRequest === 'string' && /^req_[a-zA-Z0-9_]{1,120}$/.test(providerRequest) ? providerRequest : null;
  const param = typeof raw.param === 'string' && /^[a-zA-Z0-9_\[\].-]{1,120}$/.test(raw.param) ? raw.param : null;
  const endpoint = path.split('?')[0].replace(/\/(?:acct|cs|pi|re|dp)_[^/]+/g, '/:id');
  let publicMessage;
  if (/signed up for connect|sign up for connect|platform profile|responsibilities of managing losses/i.test(message)) {
    publicMessage = 'A Stripe exige concluir a configuração do perfil da plataforma Connect no mesmo ambiente da chave utilizada. Em teste, conclua o perfil do Connect nesse ambiente; não é necessário habilitar cobranças reais.';
  } else if (response.status === 401 || code === 'api_key_expired') {
    publicMessage = 'A chave secreta Stripe foi recusada ou expirou. Atualize STRIPE_SECRET_KEY no Railway com a chave do ambiente correto.';
  } else if (code === 'resource_missing') {
    publicMessage = 'A conta ou o pagamento não foi encontrado neste ambiente Stripe. Confira se a chave pertence ao mesmo ambiente de teste ou produção utilizado no cadastro.';
  } else if (response.status === 403 || code === 'forbidden') {
    publicMessage = 'A chave Stripe atual não tem acesso à conta ou ao recurso solicitado. Confira a conta Stripe, o ambiente de teste e as permissões da integração.';
  } else if (code === 'idempotency_key_in_use' || response.status === 409 || response.status === 429) {
    publicMessage = 'A Stripe ainda está processando a solicitação. Aguarde e consulte o status antes de tentar novamente.';
  } else if (['/accounts','/account_links','/v2/core/accounts','/v2/core/account_links'].includes(path) && message) {
    publicMessage = 'A Stripe não conseguiu iniciar o cadastro do vendedor. Motivo: ' + message;
  } else {
    publicMessage = 'A Stripe não conseguiu concluir a solicitação. Consulte o suporte com o ID deste erro.';
  }
  const error = new Error(publicMessage);
  error.status = response.status === 401 || response.status === 403 ? 503 : Math.max(400, Math.min(502, response.status));
  error.uncertain = response.status >= 500 || response.status === 429 || response.status === 409;
  error.checkoutRejected = method === 'POST' && path === '/checkout/sessions' && response.status >= 400 && response.status < 500 && !error.uncertain;
  error.refundRejected = method === 'POST' && path === '/refunds' && response.status >= 400 && response.status < 500 && !error.uncertain;
  error.stripeCode = code;
  error.stripeType = type;
  error.stripeMessage = message;
  error.stripeRequestId = stripeRequestId;
  error.stripeParam = param;
  console.error('[stripe] request failed', {method,endpoint,status:response.status,type,code,param,message:message || 'Stripe não retornou error.message.',stripeRequestId});
  return error;
}

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
    throw stripeFailure(method, path, response, data);
  }
  return data;
}
let v2Client;
let v2ClientKey;
function accountClient() {
  requireReady({operational:true});
  if (!v2Client || v2ClientKey !== secretKey()) {
    v2ClientKey = secretKey();
    v2Client = new Stripe(v2ClientKey, {apiVersion:Stripe.API_VERSION, timeout:15000, maxNetworkRetries:0,
      httpClient:Stripe.createFetchHttpClient((...args) => globalThis.fetch(...args))});
  }
  return v2Client;
}
async function accountRequest(path, method, operation) {
  try {return await operation(accountClient());}
  catch (error) {
    if (error.stripeCode || error.status) throw error;
    if (!error.statusCode) throw Object.assign(new Error('A conexão com a Stripe demorou. Tente retomar o cadastro em instantes.'),{status:502,uncertain:true});
    throw stripeFailure(method,path,{status:error.statusCode || 502,headers:new Headers(error.headers || {})},
      {error:error.raw || {type:error.rawType,code:error.code,message:error.message,param:error.param}});
  }
}
const accountInclude = ['configuration.merchant','defaults','requirements'];
async function connectedAccount(accountId, version='v1') {
  if (!accountId) return null;
  if (version === 'v2') return accountRequest('/v2/core/accounts/' + accountId,'GET',client => client.v2.core.accounts.retrieve(accountId,{include:accountInclude}));
  return request('GET', '/accounts/' + encodeURIComponent(accountId));
}
async function createConnectedAccount(email, idempotencyKey) {
  requireReady();
  return accountRequest('/v2/core/accounts','POST',client => client.v2.core.accounts.create({
    contact_email:email, identity:{country:'BR'}, dashboard:'full',
    defaults:{currency:'brl',locales:['pt-BR'],responsibilities:{fees_collector:'stripe',losses_collector:'stripe'}},
    configuration:{merchant:{capabilities:{card_payments:{requested:true}}}}, include:accountInclude
  },{idempotencyKey}));
}
async function accountLink(accountId, refreshUrl, returnUrl, version='v2') {
  if (version === 'v2') return accountRequest('/v2/core/account_links','POST',client => client.v2.core.accountLinks.create({
    account:accountId,use_case:{type:'account_onboarding',account_onboarding:{refresh_url:refreshUrl,return_url:returnUrl}}
  }));
  return request('POST', '/account_links', { account: accountId, type: 'account_onboarding', refresh_url: refreshUrl, return_url: returnUrl });
}
async function createCheckout({ paymentId, postId, title, amountCents, payerEmail, method, sellerAccountId, sellerAccountVersion='v1', returnBaseUrl, expiresAt, checkoutVersion=2 }) {
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
    const account = sellerView(await connectedAccount(sellerAccountId,sellerAccountVersion));
    if (!account.chargesEnabled || !account.payoutsEnabled) throw Object.assign(new Error('A conta Stripe do vendedor ainda não está habilitada para cobranças e repasses.'), { status: 409 });
    accountId = sellerAccountId;
  }
  const returnUrl = (returnBaseUrl || baseUrl()) + '/anuncios/' + encodeURIComponent(postId);
  const result = await request('POST', '/checkout/sessions', {
    mode: 'payment',
    expires_at: expiresAt,
    client_reference_id: paymentId,
    customer_email: payerEmail,
    // Preserve the original wire parameters when replaying a pre-migration attempt.
    // New sessions filter Dashboard-enabled methods using the current API contract.
    ...(checkoutVersion === 1 ? { payment_method_types: [method] } : { allowed_payment_method_types: [method] }),
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
function accountWebhookEvent(rawBody, signature) {
  const secret=String(process.env.STRIPE_ACCOUNT_WEBHOOK_SECRET||'').trim();
  if(!secret || !Buffer.isBuffer(rawBody) || rawBody.length>1024*1024)return null;
  try {return signatureVerifier.parseEventNotification(rawBody,signature,secret,300);}catch{return null;}
}
const liveMode = () => secretKey().startsWith('sk_live_');
const isTestEnvironment = () => configured() && secretKey().startsWith('sk_test_');
const dashboardLink = (accountId,version='v2') => version === 'v2' ? Promise.resolve({url:'https://dashboard.stripe.com/'}) : request('POST', '/accounts/' + encodeURIComponent(accountId) + '/login_links');
const paymentIntent = (id, accountId) => request('GET', '/payment_intents/' + encodeURIComponent(id) + '?expand[]=latest_charge', undefined, {accountId});
const dispute = (id, accountId) => request('GET', '/disputes/' + encodeURIComponent(id), undefined, {accountId});
const disputes = (intent, accountId) => request('GET', '/disputes?payment_intent=' + encodeURIComponent(intent) + '&limit=10', undefined, {accountId});
const refund = (intent, accountId, paymentId) => request('POST', '/refunds', {payment_intent:intent, metadata:{payment_id:paymentId}}, {accountId,idempotencyKey:'reusa-refund-' + paymentId});
const refundStatus = (id, accountId) => request('GET', '/refunds/' + encodeURIComponent(id), undefined, {accountId});
const refunds = (intent, accountId) => request('GET', '/refunds?payment_intent=' + encodeURIComponent(intent) + '&limit=100', undefined, {accountId});
function sellerView(account) {
  if(account?.object==='v2.core.account'){
    const merchant=account.configuration?.merchant,capabilities=merchant?.capabilities||{},entries=account.requirements?.entries||[];
    const managed=account.dashboard==='full'&&account.defaults?.responsibilities?.losses_collector==='stripe'&&account.defaults?.responsibilities?.fees_collector==='stripe';
    const charges=capabilities.card_payments?.status==='active'||process.env.STRIPE_PIX_ENABLED==='true'&&capabilities.pix_payments?.status==='active';
    const due=entries.filter(e=>e.awaiting_action_from==='user'&&['currently_due','past_due'].includes(e.minimum_deadline?.status));
    return {connected:true,chargesEnabled:managed&&!account.closed&&merchant?.active!==false&&charges,payoutsEnabled:managed&&!account.closed&&merchant?.active!==false&&capabilities.stripe_balance?.payouts?.status==='active',
      detailsSubmitted:due.length===0,requirementsDue:due.map(e=>e.description||'Dados pendentes'),pendingVerification:entries.some(e=>e.awaiting_action_from==='stripe'),
      disabledReason:account.closed?'account_closed':!managed?'unsupported_account_configuration':(!charges?capabilities.card_payments?.status_details?.[0]?.code||'requirements_pending':null),dashboard:'full',accountVersion:'v2'};
  }
  return {connected:!!account, chargesEnabled:!!account?.charges_enabled, payoutsEnabled:!!account?.payouts_enabled,
    detailsSubmitted:!!account?.details_submitted, requirementsDue:(account?.requirements?.currently_due || []).map(String),
    pendingVerification:!!account?.requirements?.pending_verification?.length, disabledReason:account?.requirements?.disabled_reason || null,accountVersion:'v1'};
}
module.exports = { configured, requireReady, liveMode, isTestEnvironment, demoEnabled, testMode, createConnectedAccount, accountLink, connectedAccount, createCheckout, checkoutSession, verifiedSessionStatus, webhookEvent, accountWebhookEvent, dashboardLink, paymentIntent, dispute, disputes, refund, refundStatus, refunds, sellerView };
