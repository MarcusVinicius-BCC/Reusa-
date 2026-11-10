import React from 'react';
import {stripeConnectionState,stripeRequirementLabel} from '../services/stripe-connection-state.mjs';
import './stripe-connection.css';

export default function StripeConnectionCard({status,testMode,demoMode,error,busy,onConnect,onDashboard,onRefresh}) {
  const view=stripeConnectionState(status,{testMode,demoMode,error});
  const canOnboard=status?.connectEnabled!==false;
  const requirements=[...new Set((status?.requirementsDue || []).map(stripeRequirementLabel))];
  return <>
    {testMode&&<p className="delivery-feedback" role="status"><strong>Ambiente de teste.</strong> {demoMode?'Os pagamentos são simulados na conta de teste da plataforma. O cadastro do vendedor de teste pode ser concluído abaixo.':'Cadastros de vendedores, saldos e pagamentos são simulados.'} Nenhum dinheiro real é movimentado.</p>}
    <div className={'marketplace-connection'+(view.connected?' is-connected':'')}>
        <div><strong>{view.title}</strong><small>{view.description}</small></div>
        <span className={'connection-status stripe-connection-status '+(view.ready?'is-ready':'is-pending')} role="status">{view.label}</span>
    </div>
    {view.connected&&<dl className="stripe-account-status" aria-label="Situação da conta Stripe">
      <div><dt>Conexão</dt><dd>Reconhecida</dd></div>
      <div><dt>Cobranças</dt><dd>{view.ready||status?.chargesEnabled?'Liberadas':'Aguardando liberação'}</dd></div>
      <div><dt>Repasses</dt><dd>{view.ready||status?.payoutsEnabled?'Liberados':'Aguardando liberação'}</dd></div>
    </dl>}
    {error&&<p className="delivery-error" role="alert">{error}</p>}
    <div className="seller-payment-actions">
      {view.canResume&&canOnboard&&<button type="button" className="primary-btn" disabled={busy} onClick={onConnect}>{view.connected?'Continuar cadastro':'Conectar Stripe'}</button>}
      {view.connected&&<button type="button" className="secondary-btn" disabled={busy} onClick={onDashboard}>Abrir painel de recebimentos</button>}
      <button type="button" className="secondary-btn" disabled={busy} onClick={onRefresh}>{busy?'Consultando…':'Atualizar situação da conta'}</button>
    </div>
    {!canOnboard&&view.canResume&&<p className="community-hint">O cadastro de vendedores está temporariamente indisponível. Entre em contato com o suporte do ReUsa+.</p>}
    {view.kind==='needs_information'&&<section className="stripe-account-requirements" aria-label="Informações solicitadas pela Stripe"><strong>Complete seu cadastro na Stripe</strong><p>Use “Continuar cadastro” para preencher e enviar as informações abaixo. A Stripe confirma quando cobranças e repasses estão liberados.</p><ul>{requirements.map(item=><li key={item}>{item}</li>)}</ul>{(status.requirementsDue || []).some(item=>/proof_of_liveness/i.test(item))&&<p>A prova de vida é concluída na página segura da Stripe, seguindo as instruções apresentadas durante o cadastro.</p>}</section>}
    {view.connected&&status?.accountId&&<details className="stripe-account-details"><summary>Identificar minha conta Stripe</summary><p>Use este identificador para localizar a mesma conta no Dashboard ou informar ao suporte.</p><code>{status.accountId}</code></details>}
    {view.connected&&status?.dashboard==='full'&&<p className="community-hint">No painel da Stripe, entre com o e-mail usado no cadastro do vendedor e selecione sua conta para acompanhar os recebimentos.</p>}
  </>;
}
