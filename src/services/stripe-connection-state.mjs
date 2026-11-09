export function stripeConnectionState(status, {testMode=false,error=''}={}) {
  const connected=Boolean(status?.connected);
  const ready=connected&&Boolean(status.chargesEnabled&&status.payoutsEnabled);
  const test=Boolean(status?.testMode??testMode);
  const due=Array.isArray(status?.requirementsDue)?status.requirementsDue.filter(Boolean):[];
  const title=connected?(test?'Conta Stripe de teste conectada':ready?'Conta Stripe pronta para receber':'Conta Stripe conectada'):'Receba suas vendas pela Stripe';
  if(!status)return {kind:error?'unavailable':'checking',connected:false,ready:false,canResume:false,title:error?'Consulta à Stripe indisponível':'Consultando sua conta Stripe',label:error?'Consulta pendente':'Consultando',description:error?'Atualize a situação para consultar a conexão novamente.':'Aguarde a consulta da conexão e das permissões da conta.'};
  if(!connected)return {kind:'disconnected',connected,ready:false,canResume:true,title,label:'Não conectada',description:test?'Conecte um vendedor usando os dados de teste indicados pela Stripe.':'Cadastre seus dados pela página segura da Stripe para receber pelas vendas.'};
  if(['account_closed','platform_access_revoked','unsupported_account_configuration'].includes(status.disabledReason))return {kind:'restricted',connected,ready:false,canResume:false,title,label:'Revisão necessária',description:'A conexão foi reconhecida, mas a situação da conta precisa ser revisada no painel Stripe para liberar vendas.'};
  if(ready)return {kind:'ready',connected,ready,canResume:false,title,label:test?'Teste habilitado':'Habilitada',description:test?'Use esta conta para testar vendas e acompanhar o saldo simulado no painel Stripe.':'Receba diretamente na sua conta. A Stripe administra o saldo, as taxas e os repasses.'};
  if(due.length)return {kind:'needs_information',connected,ready:false,canResume:true,title,label:'Dados pendentes',description:test?'A conexão está reconhecida. Conclua somente as informações de teste solicitadas pela Stripe.':'A conexão está reconhecida. Conclua as informações solicitadas pela Stripe para liberar cobranças e repasses.'};
  if(status.pendingVerification)return {kind:'verifying',connected,ready:false,canResume:false,title,label:'Em análise',description:'A conexão foi concluída e a Stripe está analisando o cadastro. A situação será atualizada automaticamente.'};
  if(status.detailsSubmitted)return {kind:'awaiting_activation',connected,ready:false,canResume:false,title,label:'Aguardando liberação',description:status.chargesEnabled?'A conexão está reconhecida e as cobranças estão liberadas. Os repasses ainda aguardam a liberação da Stripe.':'A conexão está reconhecida. Aguarde a Stripe liberar as permissões de cobrança e repasse da conta.'};
  return {kind:'connected',connected,ready:false,canResume:true,title,label:'Conectada',description:'Sua conta já está vinculada ao ReUsa+. Revise as informações solicitadas pela Stripe para concluir a habilitação das vendas.'};
}
