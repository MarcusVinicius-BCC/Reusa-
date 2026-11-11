import React,{useEffect,useRef,useState} from 'react';
import {api} from '../services/api';
import './negotiations.css';
const date=value=>new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value));
const filters=[['all','Todas'],['action','Minha vez'],['decision','Resposta'],['agreement','Acordo'],['payment','Pagamento'],['delivery','Entrega e recebimento'],['completed','Encerradas']];
export default function NegotiationsPage({onNavigate}){
 const [items,setItems]=useState([]),[filter,setFilter]=useState('all'),[search,setSearch]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [cancellingOffer,setCancellingOffer]=useState(''),[withdrawingPurchase,setWithdrawingPurchase]=useState(''),[notice,setNotice]=useState('');
 const cancellingOfferRef=useRef(false);
 useEffect(()=>{let active=true;const sync=()=>api.negotiations().then(r=>{if(active){setItems(r.negotiations);setError('');}}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});sync();const timer=setInterval(sync,15000);window.addEventListener('focus',sync);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',sync)}},[]);
 const matches=(i,k)=>k==='all'||(k==='action'?i.needsYourAction:k==='delivery'?['delivery','receipt'].includes(i.stage):k==='completed'?['completed','closed'].includes(i.stage):i.stage===k);
 const visible=items.filter(i=>matches(i,filter)&&[i.title,i.counterparty,i.location].some(v=>String(v).toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'))));
 async function cancelOffer(item){
  if(cancellingOfferRef.current||item.role!=='interested'||!item.canCancelOffer)return;
  cancellingOfferRef.current=true;setCancellingOffer(item.id);setError('');setNotice('');
  let cancelled=false;
  try{
   await api.cancelOffer(item.id,item.proposalCreatedAt);cancelled=true;
   setItems(current=>current.map(i=>i.id===item.id?{...i,stage:'closed',label:'Oferta cancelada',needsYourAction:false,canCancelOffer:false}:i));
   setNotice('Oferta cancelada. Você pode enviar outra proposta no anúncio, se ele estiver disponível.');
   setItems((await api.negotiations()).negotiations);
  }catch(e){
   if(!cancelled)try{setItems((await api.negotiations()).negotiations);}catch{}
   setError(cancelled?'A oferta foi cancelada, mas não foi possível atualizar a lista. Tente atualizar novamente.':e.message);
  }finally{cancellingOfferRef.current=false;setCancellingOffer('');}
 }
 async function withdrawPurchase(item){
  if(withdrawingPurchase||item.role!=='interested'||item.goal!=='Venda'||['completed','closed'].includes(item.stage))return;
  if(!window.confirm('Você realmente deseja desistir desta compra? O anúncio ficará disponível novamente para outras pessoas.'))return;
  setWithdrawingPurchase(item.id);setError('');setNotice('');
  try{
   const result=await api.withdrawPurchase(item.id);
   setNotice(result.refundRequested?'Compra cancelada. O anúncio voltou a ficar disponível e o reembolso foi solicitado.':'Compra cancelada. O anúncio voltou a ficar disponível no feed.');
   setItems((await api.negotiations()).negotiations);
  }catch(e){setError(e.message);}
  finally{setWithdrawingPurchase('');}
 }
 return <main className="page negotiations-page"><header className="negotiations-heading"><h1>Minhas negociações</h1><p>Veja o que precisa da sua atenção e acompanhe cada entrega.</p></header>
 <section className="negotiations-toolbar"><label>Buscar negociação<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Item, pessoa ou cidade" type="search"/></label><div className="negotiations-filters" aria-label="Filtrar negociações">{filters.map(([key,label])=><button key={key} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label}<span>{items.filter(i=>matches(i,key)).length}</span></button>)}</div></section>
 <p className="negotiations-reminders">Lembretes de entregas combinadas aparecem nas suas notificações: até 24 horas e até 1 hora antes do encontro.</p>
 {notice&&<p className="offer-cancellation-feedback" role="status">{notice}</p>}
 {error&&<p role="alert" className="negotiations-error">{error}<button className="text-btn" onClick={async()=>{try{setItems((await api.negotiations()).negotiations);setError('')}catch(e){setError(e.message)}}}>Tentar novamente</button></p>}
 {loading?<p role="status">Carregando negociações…</p>:!visible.length?<section className="negotiation-empty"><h2>Nenhuma negociação nesta lista</h2><p>Suas ofertas e os interessados nos seus anúncios aparecerão aqui.</p><button className="primary-btn" onClick={()=>onNavigate('/feed')}>Explorar o feed</button></section>:<div className="negotiations-list">{visible.map(i=><article className="negotiation-card" key={i.id}>
 <div className="negotiation-card-heading"><div><span className="eyebrow">{i.role==='owner'?'Estou anunciando':'Tenho interesse'} · {i.goal}</span><h2>{i.title}</h2><p>Com {i.counterparty} · {i.location}</p></div><span className={i.needsYourAction?'negotiation-status your-turn':'negotiation-status'}>{i.label}</span></div>
 <div className="negotiation-facts">{i.amountCents>0&&<span><strong>Valor combinado</strong>{new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(i.amountCents/100)}</span>}{i.scheduledFor&&<span><strong>Encontro combinado</strong>{date(i.scheduledFor)} (Brasília)</span>}<span><strong>Próximo passo</strong>{i.needsYourAction?'Depende de você':'Acompanhar atualizações'}</span></div>
 {i.incident&&<p className="negotiation-incident"><strong>Imprevisto informado:</strong> {i.incident.detail}</p>}
 <footer><button className="primary-btn" onClick={()=>onNavigate('/anuncios/'+i.postId)}>Abrir negociação</button>{i.threadId&&<button className="secondary-btn" onClick={()=>onNavigate('/mensagens/ana?thread='+encodeURIComponent(i.threadId))}>Conversar</button>}{i.role==='interested'&&i.canCancelOffer&&<button type="button" className="cancel-offer-btn" disabled={Boolean(cancellingOffer)||Boolean(withdrawingPurchase)} onClick={()=>cancelOffer(i)}>{cancellingOffer===i.id?'Cancelando…':'Cancelar oferta'}</button>}{i.role==='interested'&&i.goal==='Venda'&&!['completed','closed'].includes(i.stage)&&<button type="button" className="cancel-offer-btn purchase-withdraw-btn" disabled={Boolean(cancellingOffer)||Boolean(withdrawingPurchase)} onClick={()=>withdrawPurchase(i)}>{withdrawingPurchase===i.id?'Cancelando compra…':'Desistir da compra'}</button>}</footer></article>)}</div>}
 </main>;
}
