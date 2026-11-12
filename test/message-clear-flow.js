const assert = require('node:assert/strict');

async function exerciseMessageClear(request, { deliver = async () => {}, injectNotification }) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const json = { 'Content-Type': 'application/json' };
  const register = async role => {
    const result = await request('/api/auth/register', {
      method: 'POST', headers: json,
      body: JSON.stringify({ name: `Mensagens ${role}`, email: `clear-${role}-${suffix}@example.test`, password: 'senha-segura-123', city: 'Belém, PA' })
    });
    assert.equal(result.response.status, 201);
    return { user: result.payload.user, headers: { ...json, Authorization: `Bearer ${result.payload.token}` } };
  };
  const [owner, buyer, outsider] = [await register('owner'), await register('buyer'), await register('outsider')];
  const send = (url, actor, body = {}, method = 'POST') => request(url, { method, headers: actor.headers, body: JSON.stringify(body) });
  const inbox = async actor => (await request('/api/messages/threads', { headers: actor.headers })).payload.threads;
  const notifications = async actor => (await request('/api/notifications', { headers: actor.headers })).payload.notifications;
  const unreadMessages = async actor => (await notifications(actor)).filter(n => n.type === 'message' && !n.readAt);
  const count = async (actor, threadId) => (await inbox(actor)).find(t => t.id === threadId)?.unreadCount || 0;
  const link = id => `/mensagens/ana?thread=${id}`;
  const createThread = async index => {
    const created = await send('/api/posts', owner, { title: `Mesa ${index} ${suffix}`, description: 'Mesa para reutilização na comunidade.', category: 'Móveis', goal: 'Doação', condition: 'Bom estado', location: 'Belém, PA', imageUrl: 'https://images.example.test/mesa.jpg' });
    assert.equal(created.response.status, 201);
    const thread = await send('/api/messages/threads', buyer, { postId: created.payload.post.id });
    assert.equal(thread.response.status, 201);
    return thread.payload.thread.id;
  };
  const message = async (threadId, sender, recipient, text) => {
    const result = await send(`/api/messages/threads/${threadId}/messages`, sender, { text });
    assert.equal(result.response.status, 201);
    await deliver(result.payload.message, recipient.user.id);
    return result.payload.message;
  };
  const threadMessages = async (actor, threadId) => (await request(`/api/messages/threads/${threadId}`, { headers: actor.headers })).payload.messages;
  const [first, second] = [await createThread(1), await createThread(2)];
  const initial = await message(first, owner, buyer, 'Primeira mensagem para quem vai receber a mesa.');
  const secondMessage = await message(second, owner, buyer, 'Outra conversa que deve continuar não lida.');
  await message(first, buyer, owner, 'Resposta do interessado que o anunciante ainda não leu.');
  const nonMessageTitle = `Pagamento preservado ${suffix}`;
  await injectNotification({ id: `non-message-${suffix}`, userId: buyer.user.id, type: 'payment', title: nonMessageTitle, text: 'Esta notificação não pertence ao contador de mensagens.', link: link(first), createdAt: initial.sent_at });

  assert.equal((await unreadMessages(buyer)).length, 2);
  assert.equal(await count(buyer, first), 1);
  assert.equal(await count(buyer, second), 1);
  assert.equal(await count(owner, first), 1, 'a sender must not count their own outgoing messages');
  assert.equal((await request(`/api/messages/threads/${first}/messages`, { method: 'DELETE' })).response.status, 401);
  const unauthorizedClear = await send(`/api/messages/threads/${first}/messages`, outsider, {}, 'DELETE');
  assert.ok([403, 404].includes(unauthorizedClear.response.status), `Unexpected clear response: ${unauthorizedClear.response.status} ${JSON.stringify(unauthorizedClear.payload)}`);
  assert.ok([403, 404].includes((await send(`/api/notifications/read-thread/${first}`, outsider)).response.status));
  assert.equal((await unreadMessages(buyer)).length, 2, 'unauthorized cleanup must not read another person’s notifications');

  const cleared = await send(`/api/messages/threads/${first}/messages`, buyer, {}, 'DELETE');
  assert.equal(cleared.response.status, 200);
  assert.equal(cleared.payload.ok, true);
  assert.ok(Number.isFinite(Date.parse(cleared.payload.clearedAt)));
  assert.ok(!(await inbox(buyer)).some(t => t.id === first));
  assert.equal(await count(buyer, second), 1);
  assert.equal((await unreadMessages(buyer)).length, 1);
  assert.equal((await unreadMessages(owner)).length, 1);
  assert.equal(await count(owner, first), 1);
  assert.equal((await threadMessages(buyer, first)).length, 0);
  assert.equal((await threadMessages(owner, first)).length, 2, 'cleanup must preserve the other participant’s history');
  assert.equal((await notifications(buyer)).find(n => n.title === nonMessageTitle).readAt, null, 'cleanup only reads message notifications');

  const delayedTitle = `Mensagem atrasada ${suffix}`;
  await injectNotification({ id: `late-${suffix}`, userId: buyer.user.id, type: 'message', title: delayedTitle, text: 'Evento antigo processado depois da limpeza.', link: link(first), createdAt: initial.sent_at });
  assert.ok((await notifications(buyer)).find(n => n.title === delayedTitle).readAt);
  assert.equal((await unreadMessages(buyer)).length, 1, 'a delayed old event must not restore the global badge');
  assert.ok(!(await inbox(buyer)).some(t => t.id === first));

  const afterSingleClear = await message(first, owner, buyer, 'Nova mensagem depois da limpeza individual.');
  assert.ok(Date.parse(afterSingleClear.sent_at) > Date.parse(cleared.payload.clearedAt), 'a message sent immediately after cleanup must have a timestamp beyond the clear watermark');
  assert.equal(await count(buyer, first), 1, 'new messages count without reviving cleared ones');
  assert.equal((await unreadMessages(buyer)).length, 2);
  assert.equal((await threadMessages(buyer, first)).length, 1);
  assert.equal((await send(`/api/notifications/read-thread/${second}`, buyer)).response.status, 200);
  assert.equal(await count(buyer, second), 0);
  assert.equal(await count(buyer, first), 1);
  assert.equal((await notifications(buyer)).find(n => n.title === nonMessageTitle).readAt, null);

  const clearedAll = await send('/api/messages/threads', buyer, {}, 'DELETE');
  assert.equal(clearedAll.response.status, 200);
  assert.ok(Number.isFinite(Date.parse(clearedAll.payload.clearedAt)));
  assert.deepEqual(await inbox(buyer), []);
  assert.equal((await unreadMessages(buyer)).length, 0);
  assert.equal((await unreadMessages(buyer)).length, 0, 'a fresh notifications request must retain the cleared state');
  assert.equal(await count(owner, first), 1, 'clear-all must preserve the other participant’s unread count');
  assert.equal((await threadMessages(owner, first)).length, 3);
  assert.equal((await notifications(buyer)).find(n => n.title === nonMessageTitle).readAt, null);
  await injectNotification({ id: `late-all-${suffix}`, userId: buyer.user.id, type: 'message', title: 'Outra mensagem atrasada', text: 'Evento anterior à limpeza de todas as conversas.', link: link(second), createdAt: secondMessage.sent_at });
  assert.equal((await unreadMessages(buyer)).length, 0);
  assert.deepEqual(await inbox(buyer), []);

  const afterClearAll = await message(first, owner, buyer, 'Nova mensagem depois de limpar todas as conversas.');
  assert.ok(Date.parse(afterClearAll.sent_at) > Date.parse(clearedAll.payload.clearedAt), 'a message sent immediately after clearing all conversations must have a newer timestamp');
  assert.equal((await inbox(buyer)).length, 1);
  assert.equal(await count(buyer, first), 1);
  assert.equal((await unreadMessages(buyer)).length, 1);
  assert.equal((await send(`/api/notifications/read-thread/${first}`, buyer)).response.status, 200);
  assert.equal(await count(buyer, first), 0);
  assert.equal(await count(owner, first), 1);
  assert.equal((await notifications(buyer)).find(n => n.title === nonMessageTitle).readAt, null);
}

module.exports = { exerciseMessageClear };
