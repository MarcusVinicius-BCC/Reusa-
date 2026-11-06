import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import './campaigns.css';

const dateLabel = date => new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
const statusLabel = { pledged: 'Entrega a combinar', received: 'Recebido', cancelled: 'Cancelado' };

function CampaignCard({ campaign: c, session, refresh }) {
  const [expanded, setExpanded] = useState(false);
  const [contributions, setContributions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const owner = session?.id === c.owner_id;
  const load = async () => { if (session) setContributions((await api.campaignContributions(c.id)).contributions); };
  useEffect(() => {
    let active = true;
    setContributions([]);
    if (expanded && session) api.campaignContributions(c.id).then(result => { if (active) setContributions(result.contributions); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [expanded, session?.id, c.id]);
  async function act(work, success) {
    setBusy(true); setError(''); setMessage('');
    try { await work(); await Promise.all([refresh(), load()]); setMessage(success); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  function contribute(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    act(async () => { await api.contributeCampaign(c.id, { quantity: Number(data.get('quantity')), note: data.get('note') }); form.reset(); }, 'Oferta enviada. Combine a entrega com o organizador; ela contará na meta após o recebimento.');
  }
  const label = c.status === 'closed' ? 'Encerrada' : c.received >= c.target ? 'Meta atingida' : !c.accepting ? 'Prazo encerrado' : 'Recebendo doações';
  return <article className="campaign-card">
    <div className="campaign-card-top"><span className="campaign-tag">Campanha da comunidade</span><span>{label}</span></div>
    <h3>{c.title}</h3>
    <p className="campaign-beneficiary">Para {c.beneficiary} · {c.city}</p>
    <p>{c.description}</p>
    <div className="campaign-progress-label"><strong>{c.received} de {c.target} recebidos</strong><span>{c.material}</span></div>
    <progress value={Math.min(c.received, c.target)} max={c.target} aria-label={`Meta: ${c.received} de ${c.target} ${c.material} recebidos`} />
    <p className="campaign-meta">{c.remaining ? `Faltam ${c.remaining} unidades` : 'Meta alcançada!'} · {c.pledged} prometidas, ainda não recebidas</p>
    <p className="campaign-meta">Até {dateLabel(c.deadline)} · Por {c.ownerName}</p>
    <button type="button" className="secondary-btn" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>{expanded ? 'Recolher detalhes' : owner ? 'Gerenciar contribuições' : 'Ver como ajudar'}</button>
    {expanded && <div className="campaign-details">
      <h4>Entrega ou retirada</h4><p>{c.logistics}</p>
      {error && <p role="alert" className="campaign-error">{error}</p>}
      {message && <p role="status" className="campaign-success">{message}</p>}
      {!session ? <p>Entre na sua conta para oferecer materiais.</p> : <>
        {!owner && c.accepting && <form onSubmit={contribute} className="campaign-form">
          <h4>Oferecer {c.material}</h4>
          <label>Quantidade de unidades<input name="quantity" type="number" min="1" max="100000" step="1" required defaultValue="1" /></label>
          <label>Como podemos combinar a entrega?<textarea name="note" minLength="10" maxLength="500" required placeholder="Informe a disponibilidade e como entrar em contato. Só você e o organizador verão esta mensagem." /></label>
          <button className="primary-btn" disabled={busy}>{busy ? 'Enviando…' : 'Oferecer materiais'}</button>
        </form>}
        <h4>{owner ? 'Contribuições da campanha' : 'Minhas contribuições'}</h4>
        {!contributions.length && <p>Ainda não há contribuições.</p>}
        <ul className="campaign-contributions">{contributions.map(item => <li key={item.id}>
          <strong>{item.quantity} unidades · {item.donor_name}</strong><span>{statusLabel[item.status]}</span><p>{item.note}</p>
          {item.reply && <p><strong>Resposta do organizador:</strong> {item.reply}</p>}
          {owner && item.status === 'pledged' && <form className="campaign-form" onSubmit={event => { event.preventDefault(); const reply = new FormData(event.currentTarget).get('reply'); act(() => api.replyCampaignContribution(c.id, item.id, reply), 'Resposta enviada ao doador.'); }}>
            <label>Combinar entrega com {item.donor_name}<textarea name="reply" required minLength="10" maxLength="500" defaultValue={item.reply} placeholder="Combine o local e a disponibilidade. Só o doador e você verão esta resposta." /></label>
            <button className="secondary-btn" disabled={busy}>Enviar resposta</button>
          </form>}
          {item.status === 'pledged' && <div className="campaign-actions">
            {owner && <button className="primary-btn" disabled={busy} onClick={() => act(() => api.updateCampaignContribution(c.id, item.id, 'received'), 'Recebimento confirmado e meta atualizada.')}>Confirmar recebimento</button>}
            <button className="secondary-btn" disabled={busy} onClick={() => act(() => api.updateCampaignContribution(c.id, item.id, 'cancelled'), 'Contribuição cancelada.')}>Cancelar contribuição</button>
          </div>}
        </li>)}</ul>
        {owner && c.status === 'active' && <button className="secondary-btn" disabled={busy} onClick={() => { if (window.confirm('Encerrar a campanha? Novas ofertas serão bloqueadas, mas você poderá confirmar entregas já combinadas.')) act(() => api.closeCampaign(c.id), 'Campanha encerrada.'); }}>Encerrar campanha</button>}
      </>}
    </div>}
  </article>;
}

export default function CampaignFeed({ session, search = '', showCampaigns = true, onCountChange }) {
  const [campaigns, setCampaigns] = useState([]);
  const [error, setError] = useState('');
  const refresh = async () => setCampaigns((await api.campaigns()).campaigns);
  useEffect(() => {
    let active = true;
    const sync = () => api.campaigns().then(result => { if (active) setCampaigns(result.campaigns); }).catch(e => { if (active) setError(e.message); });
    sync();
    const timer = window.setInterval(sync, 15000);
    window.addEventListener('focus', sync);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', sync); };
  }, []);
  const query = search.trim().toLocaleLowerCase('pt-BR');
  const visible = campaigns.filter(c => showCampaigns && c.accepting && (!query || [c.title,c.description,c.city,c.material,c.beneficiary].some(v => v.toLocaleLowerCase('pt-BR').includes(query))));
  useEffect(() => { onCountChange?.(visible.length); }, [visible.length, onCountChange]);
  if (!visible.length && !error) return null;
  return <div className="campaign-stream">
    {error && <p role="alert" className="campaign-error">{error} <button type="button" onClick={async () => { try { await refresh(); setError(''); } catch (e) { setError(e.message); } }}>Tentar novamente</button></p>}
    {visible.map(c => <CampaignCard key={c.id} campaign={c} session={session} refresh={refresh} />)}
  </div>;
}
