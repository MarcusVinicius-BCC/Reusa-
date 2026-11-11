const assert=require('node:assert/strict');

async function exerciseOfferCancellation(request){
 const suffix=`${Date.now()}-${Math.random().toString(36).slice(2)}`,json={'Content-Type':'application/json'};
 const register=async role=>{
  const r=await request('/api/auth/register',{method:'POST',headers:json,body:JSON.stringify({name:`Cancelar ${role}`,email:`cancel-${role}-${suffix}@example.test`,password:'senha-segura-123',city:'Belém, PA'})});
  assert.equal(r.response.status,201);
  return {user:r.payload.user,headers:{...json,Authorization:`Bearer ${r.payload.token}`}};
 };
 const seller=await register('seller'),buyer=await register('buyer'),other=await register('other');
 const send=(path,actor,body={},method='POST')=>request(path,{method,headers:actor.headers,body:JSON.stringify(body)});
 const detail=async(post,actor=buyer)=>(await request(`/api/posts/${post}/negotiation`,{headers:actor.headers})).payload.negotiation;
 const list=async actor=>(await request('/api/negotiations',{headers:actor.headers})).payload.negotiations;
 const setup=async()=>{
  const created=await send('/api/posts',seller,{title:`Oferta cancelável ${suffix}`,description:'Mesa de estudo para reutilização.',category:'Móveis',goal:'Venda',condition:'Bom estado',location:'Belém, PA',imageUrl:'https://images.example.test/cancelar.jpg'});
  assert.equal(created.response.status,201);const post=created.payload.post.id;
  const offer=async(actor=buyer,amount=1500)=>{
   assert.equal((await send('/api/messages/threads',actor,{postId:post})).response.status,201);
   const n=await detail(post,actor);
   assert.equal((await send(`/api/negotiations/${n.id}/proposal`,actor,{amountCents:amount,method:'card'})).response.status,201);
   return detail(post,actor);
  };
  return {post,offer,first:await offer()};
 };
 const cancel=(n,actor=buyer,version=n.proposalCreatedAt)=>send(`/api/negotiations/${n.id}/cancel-offer`,actor,{expectedProposalCreatedAt:version});
 const decide=(n,decision='accepted')=>send(`/api/negotiations/${n.id}/proposal`,seller,{decision,expectedProposalCreatedAt:n.proposalCreatedAt},'PATCH');
 const accept=n=>decide(n);
 const resend=n=>send(`/api/negotiations/${n.id}/proposal`,buyer,{amountCents:2100,method:'card'});
 const notices=async post=>(await request('/api/notifications',{headers:seller.headers})).payload.notifications.filter(n=>n.title==='Oferta cancelada'&&n.link===`/anuncios/${post}`);

 const item=await setup(),first=item.first;
 assert.equal(first.canCancelOffer,true);
 assert.equal((await detail(item.post,seller)).canCancelOffer,false);
 const pending=(await list(buyer)).find(n=>n.id===first.id);
 assert.equal(pending.canCancelOffer,true);assert.equal(pending.proposalCreatedAt,first.proposalCreatedAt);
 assert.equal((await list(seller)).find(n=>n.id===first.id).canCancelOffer,false);
 assert.equal((await request(`/api/negotiations/${first.id}/cancel-offer`,{method:'POST',headers:json,body:JSON.stringify({expectedProposalCreatedAt:first.proposalCreatedAt})})).response.status,401);
 assert.equal((await cancel(first,seller)).response.status,403);
 assert.equal((await cancel(first,other)).response.status,403);
 assert.equal((await send(`/api/negotiations/${first.id}/cancel-offer`,buyer)).response.status,400);
 assert.equal((await cancel(first,buyer,'not-a-date')).response.status,400);
 assert.equal((await cancel(first,buyer,new Date(Date.parse(first.proposalCreatedAt)-1).toISOString())).response.status,409);
 assert.equal((await send(`/api/negotiations/${first.id}/proposal`,seller,{decision:'accepted'},'PATCH')).response.status,400);
 assert.equal((await send(`/api/negotiations/${first.id}/proposal`,seller,{decision:'rejected',expectedProposalCreatedAt:'not-a-date'},'PATCH')).response.status,400);
 const before=(await notices(item.post)).length;
 const cancelled=await Promise.all([cancel(first),cancel(first)]);
 assert.deepEqual(cancelled.map(r=>r.response.status),[200,200]);
 assert.equal((await notices(item.post)).length,before+1,'duplicate requests must notify the seller once');
 let current=await detail(item.post);
 assert.equal(current.status,'cancelled');assert.equal(current.proposalStatus,'cancelled');assert.equal(current.canCancelOffer,false);
 assert.equal(current.proposalAmountCents,1500);assert.equal(current.proposalMethod,'card');assert.equal(current.proposalCreatedAt,first.proposalCreatedAt);
 const closed=(await list(buyer)).find(n=>n.id===first.id);
 assert.equal(closed.stage,'closed');assert.equal(closed.label,'Oferta cancelada');assert.equal(closed.canCancelOffer,false);
 assert.equal((await request(`/api/posts/${item.post}`,{headers:buyer.headers})).payload.post.offerStatus,'cancelled');
 assert.equal((await request(`/api/posts/${item.post}`)).payload.post.status,'Disponível');
 assert.equal((await accept(first)).response.status,400,'seller must not reconsider a withdrawn offer');
 assert.ok([400,404,409].includes((await send(`/api/posts/${item.post}/reserve`,seller,{interestedId:buyer.user.id})).response.status),'legacy reservation must not revive a withdrawn offer');

 const repeated=await resend(first);assert.equal(repeated.response.status,201);
 current=await detail(item.post);
 assert.equal(current.status,'interested');assert.equal(current.proposalStatus,'pending');assert.equal(current.canCancelOffer,true);
 assert.equal(current.proposalAmountCents,2100);assert.ok(Date.parse(current.proposalCreatedAt)>Date.parse(first.proposalCreatedAt));
 assert.equal((await cancel(first)).response.status,409,'a delayed old cancel must not withdraw the new offer');
 assert.equal((await accept(first)).response.status,409,'a stale seller acceptance must not accept a different offer');
 assert.equal((await decide(first,'rejected')).response.status,409,'a stale seller rejection must not reject a different offer');
 assert.equal((await send(`/api/posts/${item.post}/reserve`,seller,{interestedId:buyer.user.id,expectedProposalCreatedAt:first.proposalCreatedAt})).response.status,409,'legacy reservation must also reject a stale offer');
 assert.equal((await detail(item.post)).proposalStatus,'pending');
 assert.equal((await cancel(current)).response.status,200);
 const raceResend=await Promise.all([resend(current),cancel(current)]);
 assert.equal(raceResend[0].response.status,201);assert.ok([200,409].includes(raceResend[1].response.status));
 current=await detail(item.post);assert.equal(current.proposalStatus,'pending');
 assert.ok(Date.parse(current.proposalCreatedAt)>Date.parse(repeated.payload.proposal.createdAt));
 assert.equal((await cancel(current)).response.status,200);
 const doubles=await Promise.all([resend(current),resend(current)]);
 assert.deepEqual(doubles.map(r=>r.response.status).sort(),[201,409],'only one resent offer may be created');
 const latest=await detail(item.post);
 const sellerOffersLatest=(await request(`/api/posts/${item.post}/interested`,{headers:seller.headers})).payload.negotiations;
 assert.equal(sellerOffersLatest.find(n=>n.id===latest.id).proposalCreatedAt,latest.proposalCreatedAt);
 assert.equal((await accept(latest)).response.status,200,'seller can accept the current resent offer');

 const reserved=await setup(),second=await reserved.offer(other,2200);
 assert.equal((await accept(second)).response.status,200);
 assert.equal((await cancel(reserved.first)).response.status,200);
 assert.equal((await request(`/api/posts/${reserved.post}`)).payload.post.status,'Reservado');
 const sellerOffers=(await request(`/api/posts/${reserved.post}/interested`,{headers:seller.headers})).payload.negotiations;
 assert.equal(sellerOffers.find(n=>n.id===second.id).status,'reserved');
 assert.equal(sellerOffers.find(n=>n.id===second.id).proposalStatus,'accepted');
 assert.equal((await resend(reserved.first)).response.status,409,'resending must not affect another buyer reservation');

 const advanced=await setup();assert.equal((await accept(advanced.first)).response.status,200);
 assert.equal((await cancel(advanced.first)).response.status,409);assert.equal((await detail(advanced.post)).canCancelOffer,false);
 const proposed=await send(`/api/negotiations/${advanced.first.id}/collection`,buyer,{mode:'pickup',scheduledFor:new Date(Date.now()+86400000).toISOString(),address:'Rua da Escola, 100, Centro, Belém, PA'});
 assert.equal(proposed.response.status,201);assert.equal((await cancel(advanced.first)).response.status,409);
 const d=proposed.payload.collection.id;
 assert.equal((await send(`/api/collection-deliveries/${d}/accept`,seller)).response.status,200);
 const paid=await send(`/api/negotiations/${advanced.first.id}/payment`,buyer,{amountCents:1500,currency:'BRL',method:'card',idempotencyKey:`cancel-proof-${suffix}`});
 assert.equal(paid.response.status,201);assert.equal((await cancel(advanced.first)).response.status,409);

 const racing=await setup();
 const result=await Promise.all([cancel(racing.first),accept(racing.first)]);
 const codes=result.map(r=>r.response.status);
 assert.ok((codes[0]===200&&codes[1]===400)||(codes[0]===409&&codes[1]===200),JSON.stringify(codes));
 const raced=await detail(racing.post);
 assert.equal(raced.proposalStatus,codes[0]===200?'cancelled':'accepted');
 assert.equal((await request(`/api/posts/${racing.post}`)).payload.post.status,codes[0]===200?'Disponível':'Reservado');
}

module.exports={exerciseOfferCancellation};
