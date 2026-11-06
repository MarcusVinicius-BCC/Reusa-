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

export default function CampaignFeed({ session, search = '' }) {
  const [campaigns, setCampaigns] = useState([]);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const refresh = async () => setCampaigns((await api.campaigns()).campaigns);
  useEffect(() => {
    let active = true;
    api.campaigns().then(result => { if (active) setCampaigns(result.campaigns); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function create(event) {
    event.preventDefault(); setBusy(true); setError('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try { await api.createCampaign({ ...data, target: Number(data.target) }); await refresh(); setCreating(false); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const query = search.trim().toLocaleLowerCase('pt-BR');
  const visible = campaigns.filter(c => (showAll || c.accepting || c.owner_id === session?.id) && (!query || [c.title,c.description,c.city,c.material,c.beneficiary].some(v => v.toLocaleLowerCase('pt-BR').includes(query))));
  return <section className="campaign-feed" aria-labelledby="campaign-heading">
    <div className="campaign-heading"><div><span className="campaign-tag">Ajude uma necessidade real</span><h2 id="campaign-heading">Campanhas da comunidade</h2><p>Conecte materiais disponíveis a quem precisa deles.</p></div>
      {session && <button type="button" className="primary-btn" onClick={() => setCreating(v => !v)} aria-expanded={creating}>{creating ? 'Fechar formulário' : 'Criar campanha'}</button>}
    </div>
    {error && <p role="alert" className="campaign-error">{error} <button type="button" onClick={async () => { try { await refresh(); setError(''); } catch (e) { setError(e.message); } }}>Tentar novamente</button></p>}
    {creating && session && <form className="campaign-form campaign-create" onSubmit={create}>
      <h3>Qual necessidade você quer atender?</h3>
      <label>Título<input name="title" required minLength="5" maxLength="100" placeholder="20 cadeiras para a sala de reforço" /></label>
      <label>Instituição, projeto ou pessoa beneficiada<input name="beneficiary" required minLength="3" maxLength="120" placeholder="Escola ou projeto comunitário" /></label>
      <label>Objetivo e condições dos materiais<textarea name="description" required minLength="20" maxLength="2000" placeholder="Conte como os materiais serão utilizados e quais condições são necessárias." /></label>
      <div className="campaign-form-row"><label>Material solicitado<input name="material" required minLength="2" maxLength="80" placeholder="Cadeiras em bom estado" /></label><label>Meta em unidades<input name="target" type="number" min="1" max="100000" step="1" required /></label></div>
      <div className="campaign-form-row"><label>Cidade / UF<input name="city" required minLength="3" maxLength="100" defaultValue={session.city || ''} placeholder="Santarém, PA" /></label><label>Receber ofertas até<input name="deadline" type="date" min={new Date().toISOString().slice(0,10)} required /></label></div>
      <label>Como será a entrega ou retirada?<textarea name="logistics" required minLength="10" maxLength="500" placeholder="Informe a região e se o projeto pode retirar. Combine endereços pessoais em particular." /></label>
      <p className="campaign-meta">Publique somente pedidos que você está autorizado a organizar. A meta contará apenas contribuições cujo recebimento você confirmar.</p>
      <button className="primary-btn" disabled={busy}>{busy ? 'Publicando…' : 'Publicar campanha'}</button>
    </form>}
    <label className="campaign-filter"><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> Incluir campanhas encerradas e metas atingidas</label>
    {loading ? <p role="status">Carregando campanhas…</p> : !visible.length ? <p className="campaign-empty">{query ? 'Nenhuma campanha corresponde à busca.' : 'Nenhuma campanha aberta por enquanto. Organize um pedido de materiais para sua comunidade.'}</p> : <div className="campaign-grid">{visible.map(c => <CampaignCard key={c.id} campaign={c} session={session} refresh={refresh} />)}</div>}
  </section>;
}
