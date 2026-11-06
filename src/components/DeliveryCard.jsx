import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import './delivery.css';

const labels = { scheduled: 'Aguardando aceite', confirmed: 'Entrega combinada', in_transit: 'Entrega em andamento', completed: 'Recebimento confirmado', cancelled: 'Proposta cancelada' };
const dateText = value => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value));
export default function DeliveryCard({ negotiation, collection, onChange, onReceived, onChat, isSale, payment }) {
  const [form, setForm] = useState({ mode: 'pickup', scheduledFor: '', address: '', collectionPointId: '' });
  const [points, setPoints] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [receiptChecked, setReceiptChecked] = useState(false);
  const [pointsLoading, setPointsLoading] = useState(false);
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
  const step = !collection || collection.status === 'cancelled' ? 0 : collection.status === 'scheduled' ? 1 : collection.status === 'completed' ? 3 : 2;
  return <section className="review-form-card collection-card delivery-card" aria-labelledby="delivery-title">
    <header className="delivery-heading"><span className="delivery-symbol" aria-hidden="true"><svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h11v12H3zM14 10h4l3 4v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg></span><div><span className="eyebrow">Do acordo ao recebimento</span><h2 id="delivery-title">Coleta e entrega</h2><p>Combine os detalhes com a outra pessoa antes de pagar.</p></div></header>
    <ol className="delivery-steps">{['Propor entrega','Aceitar acordo',isSale ? 'Pagar e entregar' : 'Entregar item','Confirmar recebimento'].map((label,index) => <li key={label} className={index <= step ? 'is-current' : ''}><span>{index+1}</span>{label}</li>)}</ol>
    {error && <p className="delivery-error" role="alert">{error}</p>}
    {message && <p className="delivery-feedback" role="status">{message}</p>}
    {payment?.status === 'succeeded' && !collection?.acceptedBy && <p className="delivery-help">Seu pagamento já consta como aprovado. Combine e aceite a entrega para regularizar o recebimento; você não precisa pagar novamente.</p>}
    {newProposal && negotiation.status === 'reserved' ? <form className="delivery-proposal" onSubmit={propose}>
      <p>Uma pessoa propõe local e horário; a outra precisa aceitar. O endereço fica visível somente aos participantes.</p>
      <fieldset disabled={busy}>
        <label>Onde será o encontro?<select value={form.mode} onChange={e => patch('mode',e.target.value)}><option value="pickup">Retirada em endereço combinado</option><option value="dropoff">Encontro em ponto de coleta</option></select></label>
        <label>Data e horário do encontro<input type="datetime-local" value={form.scheduledFor} onChange={e => patch('scheduledFor',e.target.value)} required /><small>Use o horário local do seu dispositivo. Entre 30 minutos e 90 dias.</small></label>
        {form.mode === 'pickup' ? <label>Endereço completo e referência<textarea value={form.address} onChange={e => patch('address',e.target.value)} required minLength={10} maxLength={240} placeholder="Rua, número, bairro, cidade e ponto de referência" /></label> : <label>Local do encontro<select value={form.collectionPointId} onChange={e => patch('collectionPointId',e.target.value)} required disabled={pointsLoading}><option value="">{pointsLoading ? 'Carregando pontos…' : 'Selecione um ponto aberto'}</option>{points.map(point => <option key={point.id} value={point.id}>{point.name} · {point.location}</option>)}</select><small>Confirme com o local se esse encontro é permitido. O ponto não guarda o produto nem garante a entrega.</small>{!pointsLoading && !points.length && <small>Nenhum ponto disponível. Use um endereço combinado.</small>}</label>}
      </fieldset>
      <button className="primary-btn" disabled={busy || (form.mode === 'dropoff' && (pointsLoading || !points.length))}>{busy ? 'Enviando…' : 'Propor local e horário'}</button>
    </form> : collection && <>
      <div className="delivery-summary"><span className="delivery-status">{labels[collection.status]}</span><dl><div><dt>Quando</dt><dd>{dateText(collection.scheduledFor)} (Brasília)</dd></div><div><dt>Onde</dt><dd>{collection.address || `${collection.collectionPoint?.name || 'Ponto de coleta'} · ${collection.collectionPoint?.location || ''}`}</dd></div><div><dt>Pagamento</dt><dd>{!isSale ? 'Sem pagamento nesta negociação' : collection.paymentStatus === 'succeeded' ? 'Aprovado. Falta confirmar o recebimento do item.' : collection.paymentStatus === 'processing' ? 'Aguardando confirmação do Mercado Pago' : collection.paymentReady ? 'Acordo aceito. Confira o item antes de pagar.' : 'Bloqueado até o aceite do acordo de entrega'}</dd></div></dl></div>
      {collection.status === 'scheduled' && <p className="delivery-help">{collection.canAccept ? 'Confira os detalhes. Ao aceitar, você concorda com este local e horário.' : 'Aguardando a outra pessoa aceitar. Você não pode aceitar a própria proposta.'}</p>}
      {collection.expired && collection.status !== 'completed' && <p className="delivery-help">O prazo deste acordo venceu. Sem pagamento em andamento, cancele e proponha outra data; se já pagou, combine a solução pelo chat.</p>}
      <div className="delivery-actions">
        {collection.canAccept && <button className="primary-btn" disabled={busy} onClick={() => act(() => api.acceptCollection(collection.id), 'Acordo aceito pelas duas pessoas.')}>Aceitar local e horário</button>}
        {collection.canDispatch && <button className="secondary-btn" disabled={busy} onClick={() => act(() => api.updateCollectionStatus(collection.id,'in_transit'), 'Entrega iniciada. Quem recebe deverá confirmar o recebimento.')}>Informar saída para entrega</button>}
        {collection.canCancel && <button className="secondary-btn" disabled={busy} onClick={() => { if (window.confirm('Cancelar este acordo? Uma nova proposta precisará de outro aceite.')) act(() => api.updateCollectionStatus(collection.id,'cancelled'), 'Acordo cancelado. Você pode propor outros detalhes.'); }}>Cancelar acordo</button>}
      </div>
      {collection.canReceive && <div className="delivery-receipt"><label><input type="checkbox" checked={receiptChecked} onChange={e => setReceiptChecked(e.target.checked)} />Já recebi e conferi o item pessoalmente.</label><button className="primary-btn" disabled={busy || !receiptChecked} onClick={() => { if (window.confirm('Confirmar que o item está com você? Isso conclui a negociação e não pode ser desfeito por esta tela.')) act(() => api.confirmCollection(collection.id), 'Recebimento confirmado. Negociação concluída!', true); }}>Confirmar recebimento do item</button></div>}
      {collection.paymentLocked && collection.status !== 'completed' && <p className="delivery-help">Com pagamento em andamento ou aprovado, não é possível trocar local, horário ou pessoa da reserva pelo sistema. Use o chat para resolver imprevistos.</p>}
    </>}
    <footer className="delivery-footer"><button type="button" className="text-btn" onClick={onChat}>Conversar sobre a entrega</button><p>O ReUsa+ não oferece transporte, guarda do valor ou reembolso automático. Em caso de não recebimento, não confirme a entrega: fale com o anunciante e use o suporte do Mercado Pago, conforme as regras do pagamento.</p></footer>
  </section>;
}
