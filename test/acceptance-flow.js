const assert = require('node:assert/strict');

async function exerciseAcceptanceFlow(request) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const json = { 'Content-Type':'application/json' };
  const register = async role => {
    const result = await request('/api/auth/register', { method:'POST', headers:json, body:JSON.stringify({ name:`Participante ${role}`, email:`${role}-${suffix}@example.test`, password:'senha-segura-123', city:'Belém, PA' }) });
    assert.equal(result.response.status,201);
    return { user:result.payload.user, headers:{ ...json, Authorization:`Bearer ${result.payload.token}` } };
  };
  const seller = await register('seller');
  const buyer = await register('buyer');
  const other = await register('other');
  const send = (path, actor, body = {}, method = 'POST') => request(path, { method, headers:actor.headers, body:JSON.stringify(body) });
  const setup = async (withOther = true) => {
    const created = await send('/api/posts',seller,{ title:'Mesa para reutilização', description:'Mesa de estudo em bom estado.', category:'Móveis', goal:'Venda', condition:'Bom estado', location:'Belém, PA', imageUrl:'https://images.example.test/mesa.jpg' });
    assert.equal(created.response.status,201);
    const id=created.payload.post.id;
    const offer=async(actor,amount)=>{
      assert.equal((await send('/api/messages/threads',actor,{postId:id})).response.status,201);
      const n=(await request(`/api/posts/${id}/negotiation`,{headers:actor.headers})).payload.negotiation;
      assert.equal((await send(`/api/negotiations/${n.id}/proposal`,actor,{amountCents:amount,method:'card'})).response.status,201);
      return n.id;
    };
    return { id, first:await offer(buyer,1000), second:withOther?await offer(other,2000):null };
  };
  const accept = id => send(`/api/negotiations/${id}/proposal`,seller,{decision:'accepted'},'PATCH');
  const cancel = (id, actor=seller) => send(`/api/negotiations/${id}/cancel-acceptance`,actor);
  const list = async postId => (await request(`/api/posts/${postId}/interested`,{headers:seller.headers})).payload.negotiations;
  const schedule = { mode:'pickup', scheduledFor:new Date(Date.now()+86400000).toISOString(), address:'Rua da Escola, 100, Centro, Belém, PA' };
  const item=await setup();
  assert.equal((await accept(item.first)).response.status,200);
  let offers=await list(item.id);
  assert.equal(offers.find(o=>o.id===item.first).canCancelAcceptance,true);
  assert.equal(offers.find(o=>o.id===item.second).proposalStatus,'pending');
  assert.equal((await request(`/api/negotiations/${item.first}/cancel-acceptance`,{method:'POST',headers:json,body:'{}'})).response.status,401);
  assert.equal((await cancel(item.first,buyer)).response.status,403);
  assert.equal((await cancel(item.first,other)).response.status,403);
  assert.equal((await cancel(item.first)).response.status,200);
  assert.equal((await cancel(item.first)).response.status,409);
  assert.equal((await request(`/api/posts/${item.id}`)).payload.post.status,'Disponível');
  offers=await list(item.id);
  assert.equal(offers.find(o=>o.id===item.first).proposalStatus,'rejected');
  assert.equal(offers.find(o=>o.id===item.second).proposalStatus,'pending');
  // An explicitly reconsidered offer remains possible for old auto-rejected bids.
  assert.equal((await accept(item.first)).response.status,200);
  assert.equal((await cancel(item.first)).response.status,200);
  assert.equal((await accept(item.second)).response.status,200);
  const oldBuyerPay=await send(`/api/negotiations/${item.first}/payment`,buyer,{amountCents:1000,currency:'BRL',method:'card',idempotencyKey:`old-buyer-${suffix}`});
  assert.equal(oldBuyerPay.response.status,409);
  const proposed=await send(`/api/negotiations/${item.second}/collection`,other,schedule);
  assert.equal(proposed.response.status,201);
  const deliveryId=proposed.payload.collection.id;
  assert.equal((await list(item.id)).find(o=>o.id===item.second).canCancelAcceptance,false);
  assert.equal((await cancel(item.second)).response.status,409);
  assert.equal((await send(`/api/collection-deliveries/${deliveryId}/status`,other,{status:'cancelled'},'PATCH')).response.status,200);
  assert.equal((await cancel(item.second)).response.status,409,'a cancelled delivery still records that the negotiation advanced');
  assert.equal((await send(`/api/negotiations/${item.second}/collection`,other,schedule)).response.status,201);
  assert.equal((await send(`/api/collection-deliveries/${deliveryId}/accept`,seller)).response.status,200);
  assert.equal((await request('/api/negotiations')).response.status,401);
  const dashboard=await request('/api/negotiations',{headers:other.headers});
  assert.equal(dashboard.response.status,200);
  assert.equal(dashboard.payload.negotiations.find(n=>n.id===item.second).stage,'payment');
  assert.ok(!dashboard.payload.negotiations.some(n=>n.id===item.first));
  const issueUrl='/api/collection-deliveries/'+deliveryId+'/incidents';
  assert.equal((await send(issueUrl,buyer,{kind:'delay',detail:'Vou chegar atrasado, podemos combinar pelo chat.'})).response.status,403);
  assert.equal((await send(issueUrl,other,{kind:'delay',detail:'curto'})).response.status,400);
  const issue={kind:'delay',detail:'Vou chegar 20 minutos atrasado. Podemos conversar pelo chat?'};
  assert.equal((await send(issueUrl,other,issue)).response.status,201);
  assert.equal((await send(issueUrl,other,issue)).response.status,201);
  const detail=(await request('/api/negotiations/'+item.second+'/collection',{headers:seller.headers})).payload.collection;
  assert.equal(detail.incidents.length,1);
  assert.equal(detail.status,'confirmed');
  assert.equal((await request('/api/negotiations',{headers:seller.headers})).payload.negotiations.find(n=>n.id===item.second).incident.detail,issue.detail);

  assert.equal((await send(`/api/negotiations/${item.second}/payment`,other,{amountCents:2000,currency:'BRL',method:'card',idempotencyKey:`accepted-buyer-${suffix}`})).response.status,201);
  assert.equal((await cancel(item.second)).response.status,409);
  assert.equal((await request(`/api/posts/${item.id}`)).payload.post.status,'Reservado');
  assert.equal((await send(`/api/collection-deliveries/${deliveryId}/confirm`,other)).response.status,200);
  assert.equal((await list(item.id)).find(o=>o.id===item.first).status,'cancelled');
  const notices=(await request('/api/notifications',{headers:buyer.headers})).payload.notifications;
  const cancelledNotice=notices.find(n=>n.title==='Aceite da oferta cancelado');
  assert.ok(cancelledNotice);
  assert.equal((await send(`/api/notifications/${cancelledNotice.id}/read`,buyer)).response.status,200);
  assert.ok((await request('/api/notifications',{headers:buyer.headers})).payload.notifications.find(n=>n.id===cancelledNotice.id).readAt);
  // Cancellation and the buyer's next step serialize on the same negotiation.
  const racing=await setup(false);
  assert.equal((await accept(racing.first)).response.status,200);
  const results=await Promise.all([cancel(racing.first),send(`/api/negotiations/${racing.first}/collection`,buyer,schedule)]);
  const codes=results.map(result=>result.response.status);
  assert.ok((codes[0]===200 && codes[1]===409)||(codes[0]===409 && codes[1]===201),JSON.stringify(codes));
  const final=(await request(`/api/posts/${racing.id}`)).payload.post;
  assert.equal(final.status,codes[0]===200?'Disponível':'Reservado');
}
module.exports = { exerciseAcceptanceFlow };
