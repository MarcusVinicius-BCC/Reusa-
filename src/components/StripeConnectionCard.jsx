import React from 'react';
import {stripeConnectionState} from '../services/stripe-connection-state.mjs';
import './stripe-connection.css';

export default function StripeConnectionCard({status,testMode,demoMode,error,busy,onConnect,onDashboard,onRefresh}) {
  const view=stripeConnectionState(status,{testMode,error});
  return <>
    {testMode&&<p className="delivery-feedback" role="status"><strong>Ambiente de teste.</strong> Cadastros de vendedores, saldos e pagamentos são simulados. Nenhum dinheiro real é movimentado.</p>}
    <div className={'marketplace-connection'+(view.connected||demoMode?' is-connected':'')}>
      {demoMode?<><div><strong>Modo de demonstração — pagamentos de teste</strong><small>As vendas são simuladas usando a conta de teste do projeto. Nenhum vendedor conecta uma conta real ou recebe repasses.</small></div><span className="connection-status">Simulação</span></>:<>
        <div><strong>{view.title}</strong><small>{view.description}</small></div>
        <span className={'connection-status stripe-connection-status '+(view.ready?'is-ready':'is-pending')} role="status">{view.label}</span>
      </>}
    </div>
    {!demoMode&&view.connected&&<dl className="stripe-account-status" aria-label="Situação da conta Stripe">
      <div><dt>Conexão</dt><dd>Reconhecida</dd></div>
      <div><dt>Cobranças</dt><dd>{view.ready||status?.chargesEnabled?'Liberadas':'Aguardando liberação'}</dd></div>
      <div><dt>Repasses</dt><dd>{view.ready||status?.payoutsEnabled?'Liberados':'Aguardando liberação'}</dd></div>
    </dl>}
    {error&&<p className="delivery-error" role="alert">{error}</p>}
    {!demoMode&&<div className="seller-payment-actions">
      {view.canResume&&<button type="button" className="primary-btn" disabled={busy} onClick={onConnect}>{view.connected?'Continuar cadastro':'Conectar Stripe'}</button>}
      {view.connected&&<button type="button" className="secondary-btn" disabled={busy} onClick={onDashboard}>Abrir painel de recebimentos</button>}
      <button type="button" className="secondary-btn" disabled={busy} onClick={onRefresh}>{busy?'Consultando…':'Atualizar situação da conta'}</button>
    </div>}
    {!demoMode&&view.kind==='needs_information'&&<details className="stripe-account-requirements"><summary>Informações solicitadas pela Stripe</summary><ul>{[...new Set(status.requirementsDue)].map(item=><li key={item}>{item}</li>)}</ul></details>}
    {!demoMode&&view.connected&&status?.dashboard==='full'&&<p className="community-hint">No painel da Stripe, entre com o e-mail usado no cadastro do vendedor e selecione sua conta para acompanhar os recebimentos.</p>}
  </>;
}
