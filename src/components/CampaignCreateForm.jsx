import React, { useState } from 'react';
import { api } from '../services/api';
import './campaigns.css';

export default function CampaignCreateForm({ session, onCancel, onSuccess }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function create(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try { await api.createCampaign({ ...data, target: Number(data.target) }); onSuccess(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <form id="campaign-create-form" className="campaign-form campaign-create" onSubmit={create} aria-labelledby="campaign-create-title" aria-busy={busy}>
    {error && <p role="alert" className="campaign-error">{error}</p>}
      <div className="campaign-create-header">
        <div className="campaign-create-intro"><span className="edit-section-icon campaign-form-icon" aria-hidden="true"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7.5-7.3a4.5 4.5 0 0 1 6.4-6.4L12 6.5l1.1-1.2a4.5 4.5 0 0 1 6.4 6.4Z"/><path d="M12 9v5m-2.5-2.5h5"/></svg></span><div><span className="eyebrow">Juntos, fazemos a diferença</span><h3 id="campaign-create-title">Uma nova campanha</h3><p>Transforme uma necessidade em uma ação da comunidade.</p></div></div>
        <button type="button" className="edit-close-btn" aria-label="Fechar formulário de campanha" disabled={busy} onClick={onCancel}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg></button>
      </div>
      <fieldset className="campaign-create-section" disabled={busy}>
        <legend><span className="campaign-step">01</span> Conte a sua causa</legend>
        <p className="campaign-section-description">Quem será beneficiado e o que vocês querem realizar?</p>
        <label>Título<input name="title" required minLength="5" maxLength="100" placeholder="Ex.: Cadeiras para a sala de reforço" /></label>
        <label>Instituição, projeto ou pessoa beneficiada<input name="beneficiary" required minLength="3" maxLength="120" placeholder="Nome da escola, projeto ou pessoa" /></label>
        <label>Objetivo e condições dos materiais<textarea name="description" required minLength="20" maxLength="2000" placeholder="Conte como os materiais vão ajudar e em quais condições precisam estar." /></label>
      </fieldset>
      <fieldset className="campaign-create-section" disabled={busy}>
        <legend><span className="campaign-step">02</span> Defina a meta</legend>
        <p className="campaign-section-description">Cada campanha reúne um tipo de material, contado em unidades.</p>
        <div className="campaign-form-row"><label>Material solicitado<input name="material" required minLength="2" maxLength="80" placeholder="Ex.: Cadeiras em bom estado" /></label><label>Meta em unidades<input name="target" type="number" min="1" max="100000" step="1" required placeholder="Ex.: 20" /></label></div>
      </fieldset>
      <fieldset className="campaign-create-section" disabled={busy}>
        <legend><span className="campaign-step">03</span> Combine os próximos passos</legend>
        <p className="campaign-section-description">Ajude quem quer contribuir a se organizar para a entrega.</p>
        <div className="campaign-form-row"><label>Cidade / UF<input name="city" required minLength="3" maxLength="100" defaultValue={session.city || ''} placeholder="Santarém, PA" /></label><label>Receber ofertas até<input name="deadline" type="date" min={new Date().toISOString().slice(0,10)} required /></label></div>
        <label>Como será a entrega ou retirada?<textarea name="logistics" required minLength="10" maxLength="500" placeholder="Informe a região e se vocês podem retirar os materiais. Combine endereços pessoais em particular." /></label>
      </fieldset>
      <div className="campaign-create-footer"><p><svg className="campaign-hint-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/></svg>A meta avança a cada recebimento confirmado por você.</p><div><button type="button" className="secondary-btn" disabled={busy} onClick={onCancel}>Cancelar</button><button className="primary-btn" disabled={busy}>{busy ? 'Publicando…' : 'Publicar campanha'}<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6"/></svg></button></div></div>
  </form>;
}
