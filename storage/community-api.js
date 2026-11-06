const crypto=require('node:crypto');
const {isLikelyResidentialAddress}=require('./location-validation');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
const clean=(v,min,max,label)=>{if(typeof v!=='string'||v.trim().length<min||v.trim().length>max)fail(400,label+': informe entre '+min+' e '+max+' caracteres.');return v.trim()};
const fold=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function postExtras(body={}){
 const info={};
 for(const [key,max] of [['dimensions',120],['transportNotes',500]])info[key]=body[key]?clean(body[key],1,max,key):'';
 for(const key of ['disassembly','stairs']){const v=body[key]||'unknown';if(!['yes','no','unknown'].includes(v))fail(400,'Opção de transporte inválida.');info[key]=v;}
 info.vehicle=body.vehicle||'unknown';if(!['unknown','walking','car','van','truck'].includes(info.vehicle))fail(400,'Veículo inválido.');
 info.weightKg=body.weightKg==null||body.weightKg===''?null:Number(body.weightKg);if(info.weightKg!==null&&(!Number.isFinite(info.weightKg)||info.weightKg<=0||info.weightKg>100000))fail(400,'Peso inválido.');
 const hasLat=body.areaLat!==undefined&&body.areaLat!=='',hasLng=body.areaLng!==undefined&&body.areaLng!=='';
 let lat=null,lng=null;
 if(hasLat||hasLng){lat=Number(body.areaLat);lng=Number(body.areaLng);if(!hasLat||!hasLng||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)fail(400,'Localização aproximada inválida.');lat=Math.round(lat*100)/100;lng=Math.round(lng*100)/100;}
 return {json:JSON.stringify(info),lat,lng};
}
function registerCommunityRoutes(app,{postgres,sqlite,authenticate,flush,clock=()=>new Date()}){
 let tail=Promise.resolve();
 const work=fn=>{if(postgres)return postgres.transaction(fn);const pending=tail.then(async()=>{const c={query:async(sql,p=[])=>({rows:sqlite.all(sql.replace(/\$\d+/g,'?'),p)})};sqlite.run('BEGIN');try{const out=await fn(c);sqlite.run('COMMIT');sqlite.persist();return out}catch(e){try{sqlite.run('ROLLBACK')}catch{}throw e}});tail=pending.catch(()=>{});return pending};
 const rows=async(c,q,p=[])=>(await c.query(q,p)).rows,one=async(...args)=>(await rows(...args))[0];
 const route=fn=>async(req,res,next)=>{try{await fn(req,res)}catch(e){if(e.status)return res.status(e.status).json({error:e.message});next(e)}};
 const notify=(c,user,title,text,link)=>c.query('INSERT INTO notifications(id,user_id,type,title,text,link,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[crypto.randomUUID(),user,'system',title,text,link,clock().toISOString()]);
 const participant=async(c,id,user)=>{const n=await one(c,'SELECT * FROM negotiations WHERE id=$1',[id]);if(!n)fail(404,'Negociação não encontrada.');if(![n.owner_id,n.interested_id].includes(user))fail(403,'Negociação privada.');return n};
 const blocked=(c,a,b)=>one(c,'SELECT blocker_id FROM blocked_users WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$3 AND blocked_id=$4)',[a,b,b,a]);
 app.get('/api/search-alerts',authenticate,route(async(req,res)=>res.json({alerts:await work(c=>rows(c,'SELECT id,keyword,city,category,created_at FROM search_alerts WHERE user_id=$1 ORDER BY created_at DESC',[req.user.id]))})));
 app.post('/api/search-alerts',authenticate,route(async(req,res)=>{
  const keyword=clean(req.body?.keyword,3,80,'Item procurado'),city=typeof req.body?.city==='string'?req.body.city.trim():'',category=typeof req.body?.category==='string'?req.body.category.trim():'';
  if(city.length>100||category.length>60)fail(400,'Filtro muito longo.');
  const id=crypto.randomUUID();await work(async c=>{const count=await one(c,'SELECT COUNT(*) AS count FROM search_alerts WHERE user_id=$1',[req.user.id]);if(Number(count.count)>=20)fail(409,'Limite de 20 alertas.');await c.query('INSERT INTO search_alerts(id,user_id,keyword,city,category,created_at) VALUES($1,$2,$3,$4,$5,$6)',[id,req.user.id,keyword,city,category,clock().toISOString()])});res.status(201).json({id});
 }));
 app.delete('/api/search-alerts/:id',authenticate,route(async(req,res)=>{await work(c=>c.query('DELETE FROM search_alerts WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id]));res.json({ok:true})}));
 app.get('/api/discovery/nearby',authenticate,route(async(req,res)=>{
  const lat=Number(req.query.lat),lng=Number(req.query.lng),radius=Number(req.query.radius||10);if(!req.query.lat||!req.query.lng||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||!Number.isFinite(radius)||radius<1||radius>100)fail(400,'Informe localização válida e raio entre 1 e 100 km.');
  const found=await work(c=>rows(c,"SELECT id,area_lat,area_lng FROM posts WHERE area_lat IS NOT NULL AND area_lng IS NOT NULL AND status='Disponível'"));
  const rad=x=>x*Math.PI/180;
  const items=found.map(p=>{const a=Math.sin(rad(p.area_lat-lat)/2)**2+Math.cos(rad(lat))*Math.cos(rad(p.area_lat))*Math.sin(rad(p.area_lng-lng)/2)**2;return {id:p.id,distanceKm:Math.round(6371*2*Math.asin(Math.sqrt(Math.min(1,a)))*10)/10}}).filter(p=>p.distanceKm<=radius).sort((a,b)=>a.distanceKm-b.distanceKm);
  res.json({items,approximate:true});
 }));
 app.get('/api/posts/:id/questions',route(async(req,res)=>{const questions=await work(async c=>{if(!await one(c,'SELECT id FROM posts WHERE id=$1',[req.params.id]))fail(404,'Anúncio não encontrado.');return rows(c,'SELECT q.id,q.question,q.answer,q.created_at,q.answered_at,u.name AS askerName FROM post_questions q JOIN users u ON u.id=q.asker_id WHERE post_id=$1 ORDER BY q.created_at DESC LIMIT 100',[req.params.id])});res.json({questions})}));
 app.post('/api/posts/:id/questions',authenticate,route(async(req,res)=>{
  const question=clean(req.body?.question,10,500,'Pergunta'),id=crypto.randomUUID();
  await work(async c=>{const p=await one(c,'SELECT * FROM posts WHERE id=$1',[req.params.id]);if(!p)fail(404,'Anúncio não encontrado.');if(p.author_id===req.user.id)fail(400,'Responda às perguntas dos interessados.');if(!['Disponível','Reservado'].includes(p.status))fail(409,'Este anúncio está encerrado.');if(await blocked(c,req.user.id,p.author_id))fail(403,'Não é possível interagir com um usuário bloqueado.');
   const dup=await one(c,'SELECT id FROM post_questions WHERE post_id=$1 AND asker_id=$2 AND question=$3',[p.id,req.user.id,question]);if(dup)fail(409,'Essa pergunta já foi enviada.');
   await c.query('INSERT INTO post_questions(id,post_id,asker_id,question,created_at) VALUES($1,$2,$3,$4,$5)',[id,p.id,req.user.id,question,clock().toISOString()]);
   await notify(c,p.author_id,'Nova pergunta sobre seu item',req.user.name+' fez uma pergunta pública sobre '+p.title+'.','/anuncios/'+p.id);
  });res.status(201).json({id});
 }));
 app.post('/api/questions/:id/answer',authenticate,route(async(req,res)=>{
  const answer=clean(req.body?.answer,5,1000,'Resposta');await work(async c=>{const q=await one(c,'SELECT q.*,p.author_id,p.title FROM post_questions q JOIN posts p ON p.id=q.post_id WHERE q.id=$1',[req.params.id]);if(!q)fail(404,'Pergunta não encontrada.');if(q.author_id!==req.user.id)fail(403,'Somente o anunciante pode responder.');await c.query('UPDATE post_questions SET answer=$1,answered_at=$2 WHERE id=$3',[answer,clock().toISOString(),q.id]);await notify(c,q.asker_id,'Sua pergunta foi respondida',q.title+': confira a resposta do anunciante.','/anuncios/'+q.post_id)});res.json({ok:true});
 }));
 app.put('/api/posts/:id/transport',authenticate,route(async(req,res)=>{const extras=postExtras(req.body);await work(async c=>{const p=await one(c,'SELECT * FROM posts WHERE id=$1'+(postgres?' FOR UPDATE':''),[req.params.id]);if(!p)fail(404,'Anúncio não encontrado.');if(p.author_id!==req.user.id)fail(403,'Somente o anunciante pode alterar.');if(p.status!=='Disponível')fail(409,'Não altere o transporte de um item reservado ou encerrado.');if(req.body.areaLat===undefined&&req.body.areaLng===undefined){extras.lat=p.area_lat;extras.lng=p.area_lng;}await c.query('UPDATE posts SET transport_json=$1,area_lat=$2,area_lng=$3 WHERE id=$4',[extras.json,extras.lat,extras.lng,p.id])});res.json({ok:true})}));
 app.get('/api/needs',route(async(req,res)=>res.json({needs:await work(c=>rows(c,"SELECT n.*,u.name AS requester FROM material_needs n JOIN users u ON u.id=n.user_id WHERE status='open' AND deadline>=$1 ORDER BY created_at DESC",[clock().toISOString().slice(0,10)]))})));
 app.post('/api/needs',authenticate,route(async(req,res)=>{
  const title=clean(req.body?.title,5,100,'O que você precisa'),description=clean(req.body?.description,20,1500,'Descrição'),city=clean(req.body?.city,3,100,'Cidade'),deadline=clean(req.body?.deadline,10,10,'Prazo');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(deadline)||!Number.isFinite(Date.parse(deadline))||new Date(deadline).toISOString().slice(0,10)!==deadline||deadline<clock().toISOString().slice(0,10))fail(400,'Prazo inválido.');
  if(isLikelyResidentialAddress(city))fail(400,'Informe apenas cidade ou bairro, sem endereço completo.');
  const id=crypto.randomUUID();await work(c=>c.query('INSERT INTO material_needs(id,user_id,title,description,city,deadline,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,req.user.id,title,description,city,deadline,clock().toISOString()]));res.status(201).json({id});
 }));
 app.patch('/api/needs/:id/close',authenticate,route(async(req,res)=>{await work(async c=>{const n=await one(c,'SELECT * FROM material_needs WHERE id=$1',[req.params.id]);if(!n)fail(404,'Pedido não encontrado.');if(n.user_id!==req.user.id)fail(403,'Somente o autor pode encerrar.');await c.query("UPDATE material_needs SET status='closed' WHERE id=$1",[n.id])});res.json({ok:true})}));
 app.get('/api/needs/:id/offers',authenticate,route(async(req,res)=>{const offers=await work(async c=>{const n=await one(c,'SELECT * FROM material_needs WHERE id=$1',[req.params.id]);if(!n)fail(404,'Pedido não encontrado.');return rows(c,'SELECT o.id,o.thread_id,p.title,u.name AS donor FROM need_offers o JOIN posts p ON p.id=o.post_id JOIN users u ON u.id=o.donor_id WHERE o.need_id=$1'+(n.user_id!==req.user.id?' AND o.donor_id=$2':''),n.user_id===req.user.id?[n.id]:[n.id,req.user.id])});res.json({offers})}));
 app.post('/api/needs/:id/offers',authenticate,route(async(req,res)=>{
  const result=await work(async c=>{
   const n=await one(c,'SELECT * FROM material_needs WHERE id=$1'+(postgres?' FOR UPDATE':''),[req.params.id]);if(!n)fail(404,'Pedido não encontrado.');if(n.status!=='open'||n.deadline<clock().toISOString().slice(0,10))fail(409,'Pedido encerrado.');if(n.user_id===req.user.id)fail(400,'Não ofereça itens ao próprio pedido.');
   const p=await one(c,'SELECT * FROM posts WHERE id=$1'+(postgres?' FOR UPDATE':''),[String(req.body?.postId||'')]);if(!p||p.author_id!==req.user.id)fail(403,'Escolha um anúncio seu.');if(p.goal!=='Doação'||p.status!=='Disponível')fail(409,'Escolha um item disponível para doação.');if(await blocked(c,req.user.id,n.user_id))fail(403,'Usuário bloqueado.');
   const old=await one(c,'SELECT thread_id FROM need_offers WHERE need_id=$1 AND post_id=$2',[n.id,p.id]);if(old)return {threadId:old.thread_id};
   let negotiation=await one(c,'SELECT * FROM negotiations WHERE post_id=$1 AND interested_id=$2',[p.id,n.user_id]);
   const now=clock().toISOString(),threadId=negotiation?.thread_id||crypto.randomUUID(),negotiationId=negotiation?.id||crypto.randomUUID();
   if(negotiation&&['cancelled','completed'].includes(negotiation.status))fail(409,'Esta negociação já foi encerrada.');
   if(!negotiation){await c.query('INSERT INTO threads(id,post_id,participants_json,unread_count,last_message_at) VALUES($1,$2,$3,$4,$5)',[threadId,p.id,JSON.stringify([req.user.id,n.user_id]),0,now]);await c.query("INSERT INTO negotiations(id,post_id,owner_id,interested_id,thread_id,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'interested',$6,$7)",[negotiationId,p.id,req.user.id,n.user_id,threadId,now,now])}
   await c.query('INSERT INTO need_offers(id,need_id,donor_id,post_id,thread_id,negotiation_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[crypto.randomUUID(),n.id,req.user.id,p.id,threadId,negotiationId,now]);
   await notify(c,n.user_id,'Uma doação atende ao seu pedido',req.user.name+' ofereceu '+p.title+'. Combine pelo chat e siga a reserva e entrega.','/mensagens/ana?thread='+encodeURIComponent(threadId));return {threadId};
  });res.status(201).json(result);
 }));
 app.post('/api/negotiations/:id/problem',authenticate,route(async(req,res)=>{
  const reason=clean(req.body?.reason,3,100,'Motivo'),detail=clean(req.body?.detail,20,1500,'Detalhes');
  if(!['Não compareceu','Item diferente do anúncio','Não recebi o item','Outro problema'].includes(reason))fail(400,'Motivo inválido.');
  await work(async c=>{const n=await participant(c,req.params.id,req.user.id);if(!['reserved','completed'].includes(n.status))fail(409,'Registre um problema de uma negociação reservada ou concluída.');if(await one(c,"SELECT id FROM reports WHERE reporter_id=$1 AND target_type='negotiation' AND target_id=$2",[req.user.id,n.id]))fail(409,'Você já registrou um problema nesta negociação.');
   const p=await one(c,'SELECT title FROM posts WHERE id=$1',[n.post_id]),d=await one(c,'SELECT status FROM collection_deliveries WHERE negotiation_id=$1',[n.id]),payment=await one(c,'SELECT status FROM payments WHERE negotiation_id=$1 ORDER BY created_at DESC LIMIT 1',[n.id]);
   const snapshot='Anúncio: '+p.title+'\nNegociação: '+n.id+'\nEntrega: '+(d?.status||'não combinada')+'\nPagamento: '+(payment?.status||'não iniciado')+'\nRelato: '+detail;
   await c.query("INSERT INTO reports(id,reporter_id,target_type,target_id,reason,details,status,created_at) VALUES($1,$2,'negotiation',$3,$4,$5,'pending',$6)",[crypto.randomUUID(),req.user.id,n.id,reason,snapshot,clock().toISOString()]);
  });res.status(201).json({ok:true});
 }));
 let running=false;
 async function runDiscovery(){
  if(running)return;running=true;
  try{await work(async c=>{
   const alerts=await rows(c,'SELECT * FROM search_alerts');
   for(const a of alerts){const candidates=await rows(c,"SELECT * FROM posts WHERE status='Disponível' AND created_at>=$1 AND author_id<>$2",[a.created_at,a.user_id]);
    for(const p of candidates){if(!fold(p.title+' '+p.description).includes(fold(a.keyword))||(a.city&&!fold(p.location).includes(fold(a.city)))||(a.category&&fold(p.category)!==fold(a.category))||await blocked(c,a.user_id,p.author_id))continue;
     const inserted=await c.query('INSERT INTO search_alert_matches(alert_id,post_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[a.id,p.id]);
     const claimed=postgres?inserted.rowCount:(await one(c,'SELECT changes() AS count')).count;if(claimed)await notify(c,a.user_id,'Encontramos um item que você procura',p.title+' · '+p.location,'/anuncios/'+p.id);
    }
   }
   await c.query("UPDATE material_needs SET status='fulfilled' WHERE status='open' AND id IN (SELECT o.need_id FROM need_offers o JOIN negotiations n ON n.id=o.negotiation_id WHERE n.status='completed')");
  })}finally{running=false}
 }
 return {runDiscovery};
}
module.exports={registerCommunityRoutes,postExtras};
