import {NegotiationProblem} from './CommunityTools';
import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import './delivery.css';
import './negotiations.css';

const labels = { scheduled: 'Aguardando aceite', confirmed: 'Entrega combinada', in_transit: 'Entrega em andamento', completed: 'Recebimento confirmado', cancelled: 'Proposta cancelada' };
const dateText = value => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value));
export default function DeliveryCard({ negotiation, collection, onChange, onReceived, onChat, isSale, payment, isOwner, onRefreshStatus, children }) {
  const [form, setForm] = useState({ mode: 'pickup', scheduledFor: '', address: '', collectionPointId: '' });
  const [points, setPoints] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [receiptChecked, setReceiptChecked] = useState(false);
  const [pointsLoading, setPointsLoading] = useState(false);
  const [incident, setIncident] = useState({kind:'delay',detail:''});
  useEffect(() => {
    let active = true;
    if (form.mode === 'dropoff') {
      setPointsLoading(true);
      api.collectionPoints().then(result => { if (active) setPoints((result.collectionPoints || []).filter(point => !/fechado|inativo/i.test(point.status || ''))); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setPointsLoading(false); });
    }
    return () => { active = false; };
  }, [form.mode]);
  const patch = (key, value) => setForm(current => ({ ...current, [key]: value }));
  async function act(fn, success, received = false) {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try { const result = await fn(); onChange(result.collection); setMessage(success); if (received) await onReceived(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  function propose(event) {
    event.preventDefault();
    const date = new Date(form.scheduledFor);
    if (!Number.isFinite(date.getTime())) return setError('Informe uma data e um horário válidos.');
    act(() => api.scheduleCollection(negotiation.id, { ...form, scheduledFor: date.toISOString() }), 'Proposta enviada. Aguarde o aceite da outra pessoa.');
  }
  const newProposal = !collection || collection.status === 'cancelled';
  const disputed = payment?.disputeStatus && !['won','warning_closed'].includes(payment.disputeStatus);
  const refundPending = ['requested','pending','requires_action'].includes(payment?.refundStatus);
  const paymentLabel = disputed ? 'Pagamento em contestação' : refundPending ? 'Reembolso em andamento' : ({ succeeded:'Pagamento confirmado', processing:'Aguardando pagamento', failed:'Pagamento não aprovado', refunded:'Pagamento estornado' })[payment?.status] || 'Pagamento não iniciado';
  const step = !collection || collection.status === 'cancelled' ? 0 : collection.status === 'scheduled' ? 1 : collection.status === 'completed' ? 3 : 2;
  return <section className="review-form-card collection-card delivery-card" aria-labelledby="delivery-title">
    <header className="delivery-heading"><span className="delivery-symbol" aria-hidden="true"><svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h11v12H3zM14 10h4l3 4v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg></span><h2 id="delivery-title">{isSale ? 'Entrega e pagamento' : 'Detalhes da entrega'}</h2></header>
    {isSale && <div className="delivery-overview">
      <div><span>Valor combinado</span><strong>{new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(Number(payment?.amountCents || negotiation.proposalAmountCents || 0)/100)}</strong></div>
      <div><span>Forma de pagamento</span><strong>{{card:'Cartão',pix:'Pix'}[payment?.method || negotiation.proposalMethod] || 'A combinar'}</strong></div>
    </div>}
    <ol className="delivery-steps" aria-label="Etapas da entrega" style={{ '--delivery-progress': step / 3 }}>{['Local e horário','Aceite do acordo',isSale ? 'Pagamento' : 'Entrega do item','Recebimento'].map((label,index) => <li key={label} className={index <= step ? 'is-current' : ''} aria-current={index === step ? 'step' : undefined}><span>{index+1}</span>{label}</li>)}</ol>
    {error && <p className="delivery-error" role="alert">{error}</p>}
    {message && <p className="delivery-feedback" role="status">{message}</p>}
    {payment?.status === 'succeeded' && !collection?.acceptedBy && <p className="delivery-help">Seu pagamento já consta como aprovado. Combine e aceite a entrega para regularizar o recebimento; você não precisa pagar novamente.</p>}
    {newProposal && negotiation.status === 'reserved' ? <form className="delivery-proposal" onSubmit={propose}>
      <p>Escolha o local e o horário da entrega e envie para {isOwner ? 'quem vai receber' : 'o anunciante'} confirmar. Os detalhes ficam visíveis apenas para vocês.</p>
      <fieldset disabled={busy}>
        <label className="delivery-field"><span>Onde será o encontro?</span><select value={form.mode} onChange={e => patch('mode',e.target.value)}><option value="pickup">Retirada em endereço combinado</option><option value="dropoff">Encontro em ponto de coleta</option></select></label>
        <label className="delivery-field"><span>Data e horário do encontro</span><input type="datetime-local" value={form.scheduledFor} onChange={e => patch('scheduledFor',e.target.value)} required /></label>
        {form.mode === 'pickup' ? <label>Endereço completo e referência<textarea value={form.address} onChange={e => patch('address',e.target.value)} required minLength={10} maxLength={240} placeholder="Rua, número, bairro, cidade e ponto de referência" /></label> : <label>Local do encontro<select value={form.collectionPointId} onChange={e => patch('collectionPointId',e.target.value)} required disabled={pointsLoading}><option value="">{pointsLoading ? 'Carregando pontos…' : 'Selecione um ponto aberto'}</option>{points.map(point => <option key={point.id} value={point.id}>{point.name} · {point.location}</option>)}</select><small>Confirme com o local se esse encontro é permitido. O ponto não guarda o produto nem garante a entrega.</small>{!pointsLoading && !points.length && <small>Nenhum ponto disponível. Use um endereço combinado.</small>}</label>}
      </fieldset>
      <button className="primary-btn" disabled={busy || (form.mode === 'dropoff' && (pointsLoading || !points.length))}>{busy ? 'Enviando…' : 'Propor local e horário'}</button>
    </form> : collection && <>
      <div className="delivery-summary"><span className="delivery-status">{labels[collection.status]}</span><dl><div><dt>Quando</dt><dd>{dateText(collection.scheduledFor)} (Brasília)</dd></div><div><dt>Onde</dt><dd>{collection.address || `${collection.collectionPoint?.name || 'Ponto de coleta'} · ${collection.collectionPoint?.location || ''}`}</dd></div></dl></div>
      {collection.status === 'scheduled' && <p className="delivery-help">{collection.canAccept ? 'Confira os detalhes. Ao aceitar, você concorda com este local e horário.' : 'Aguardando a outra pessoa aceitar. Você não pode aceitar a própria proposta.'}</p>}
      {collection.expired && collection.status !== 'completed' && <p className="delivery-help">O prazo deste acordo venceu. Sem pagamento em andamento, cancele e proponha outra data; se já pagou, combine a solução pelo chat.</p>}
      <div className="delivery-actions">
        {collection.canAccept && <button className="primary-btn" disabled={busy} onClick={() => act(() => api.acceptCollection(collection.id), 'Acordo aceito pelas duas pessoas.')}>Aceitar local e horário</button>}
        {collection.canDispatch && <button className="secondary-btn" disabled={busy} onClick={() => act(() => api.updateCollectionStatus(collection.id,'in_transit'), 'Entrega iniciada. Quem recebe deverá confirmar o recebimento.')}>Informar saída para entrega</button>}
        {collection.canCancel && <button className="secondary-btn" disabled={busy} onClick={() => { if (window.confirm('Cancelar este acordo? Uma nova proposta precisará de outro aceite.')) act(() => api.updateCollectionStatus(collection.id,'cancelled'), 'Acordo cancelado. Você pode propor outros detalhes.'); }}>Cancelar acordo</button>}
      </div>
      {collection.paymentLocked && collection.status !== 'completed' && <p className="delivery-help">Com pagamento em andamento ou aprovado, não é possível trocar local, horário ou pessoa da reserva pelo sistema. Use o chat para resolver imprevistos.</p>}
    </>}
    {collection && negotiation.status==='reserved' && ['scheduled','confirmed','in_transit'].includes(collection.status) && <details className="delivery-incident"><summary>Informar imprevisto</summary><form onSubmit={e=>{e.preventDefault();act(async()=>{await api.reportDeliveryIncident(collection.id,incident);const result=await api.collection(negotiation.id);setIncident({kind:'delay',detail:''});return result},'Imprevisto registrado. A outra pessoa foi avisada.')}}><p>Avise o que aconteceu. Isso não altera automaticamente a data, o local ou o pagamento; combinem a solução pelo chat.</p><label>Tipo de imprevisto<select value={incident.kind} onChange={e=>setIncident({...incident,kind:e.target.value})}><option value="delay">Vou me atrasar</option><option value="cannot_attend">Não poderei comparecer</option><option value="location">Problema com o local</option><option value="other">Outro</option></select></label><label>O que aconteceu?<textarea required minLength={10} maxLength={500} value={incident.detail} onChange={e=>setIncident({...incident,detail:e.target.value})} placeholder="Explique a situação e sugira como combinar a entrega."/></label><button className="secondary-btn" disabled={busy}>Avisar a outra pessoa</button></form></details>}
    {collection?.incidents?.length>0 && <ul className="delivery-incident-history" aria-label="Imprevistos da entrega">{collection.incidents.map(item=><li key={item.id}><strong>{item.reporter_name}</strong>{item.detail}<time>{dateText(item.created_at)}</time></li>)}</ul>}
    <div className="delivery-status-row" aria-label="Status e conversa">
      <button type="button" className="delivery-refresh-status" aria-label="Atualizar status" title="Atualizar status" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await onRefreshStatus(); } catch(e) { setError(e.message); } finally { setBusy(false); } }}>Status</button>
      <span role="status" aria-live="polite" className={`delivery-current-status is-${isSale ? payment?.status || 'waiting' : collection?.status || 'waiting'}`}>{isSale ? paymentLabel : labels[collection?.status] || 'Entrega a combinar'}</span>
      <button type="button" className="delivery-chat-button" onClick={onChat}>Conversar sobre a entrega</button>
    </div>
    {payment?.refundedAmountCents > 0 && payment.status !== 'refunded' && <p className="delivery-help">Reembolso parcial registrado: {new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(payment.refundedAmountCents/100)}.</p>}
    {disputed && <p className="delivery-help">Há uma contestação deste pagamento. O vendedor deve acompanhar o prazo e responder pelo painel Stripe. A confirmação do recebimento fica bloqueada enquanto a contestação estiver aberta.</p>}
    {payment?.refundStatus === 'failed' && <p className="delivery-error" role="alert">A Stripe não concluiu o reembolso. O vendedor deve conferir o motivo e resolver pelo painel de recebimentos.</p>}
    {isOwner && payment?.provider === 'stripe' && payment.status === 'succeeded' && !disputed && !refundPending && !payment.refundStatus && <div className="delivery-refund">
      <p>Se a venda não puder ser concluída, você pode solicitar a devolução integral do valor ainda não reembolsado. O prazo e eventuais taxas seguem as regras da Stripe.</p>
      <button className="secondary-btn" disabled={busy} onClick={async()=>{if(!window.confirm('Solicitar à Stripe o reembolso integral do saldo desta compra? Após a confirmação, uma entrega ainda não realizada será cancelada.'))return;setBusy(true);setError('');try{await api.refundPayment(negotiation.id);await onRefreshStatus();setMessage('Solicitação registrada. Acompanhe o status do reembolso.');}catch(e){setError(e.message);}finally{setBusy(false);}}}>Solicitar reembolso integral</button>
    </div>}
    {children}
      {collection?.canReceive && <div className="delivery-receipt"><label><input type="checkbox" checked={receiptChecked} onChange={e => setReceiptChecked(e.target.checked)} />Já recebi e conferi o item pessoalmente.</label><button className="primary-btn" disabled={busy || !receiptChecked} onClick={() => { if (window.confirm('Confirmar que o item está com você? Isso conclui a negociação e não pode ser desfeito por esta tela.')) act(() => api.confirmCollection(collection.id), 'Recebimento confirmado. Negociação concluída!', true); }}>Confirmar recebimento do item</button></div>}
    <NegotiationProblem negotiation={negotiation}/>
    <footer className="delivery-footer"><details><summary>Sobre entrega e pagamento</summary><p>O ReUsa+ não oferece transporte, guarda do valor ou reembolso automático. Se não receber o item, não confirme a entrega: converse com o vendedor e registre um problema neste acordo. O vendedor pode solicitar o reembolso pela negociação. Para contestar uma compra no cartão, procure o banco emissor; o vendedor acompanha a contestação no painel Stripe.</p></details></footer>
  </section>;
}
