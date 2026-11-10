# Stripe em produção — ReUsa+

O backend usa Stripe Checkout hospedado, cobrança direta em contas Connect Accounts v2 brasileiras e BRL. Cada vendedor cadastra seus dados na Stripe e recebe na própria conta conectada. A plataforma não cobra comissão nem mantém custódia dos valores. Taxas, repasses, saldos negativos e contestações seguem o contrato Connect da plataforma com a Stripe.

## Configuração da conta Stripe

1. Ative a conta **de produção** e conclua os dados da plataforma solicitados pela Stripe.
2. Habilite **Connect**, com onboarding hospedado, contas Accounts v2 no Brasil e **direct charges**. Os novos cadastros usam `configuration.merchant`, `dashboard=full` e `defaults.responsibilities` com `losses_collector=stripe` e `fees_collector=stripe`, conforme o modelo de risco gerenciado pela Stripe. A API não envia o campo legado `type` ao criar contas.
3. Habilite cartão. Pix é opcional e só deve ser exposto quando estiver liberado para as contas conectadas e para este fluxo de cobrança.
4. Crie os destinos de eventos em produção abaixo, em formato **snapshot**. Cada destino recebe seu próprio segredo de assinatura. Não use eventos thin nesta integração.

O Checkout usa formas de pagamento dinâmicas configuradas em **Configurações → Formas de pagamento** na Stripe. A API envia `allowed_payment_method_types` para limitar cada sessão à forma escolhida na oferta aceita. O parâmetro estático `payment_method_types` foi removido da criação de novas sessões na versão atual da API. Habilite a forma correspondente na conta conectada que recebe a cobrança; o filtro não ativa uma forma desabilitada no Dashboard. No modo de demonstração, essa configuração pertence à conta de teste da plataforma.

Ambos os destinos usam:

```text
https://reusa.up.railway.app/api/payments/stripe/webhook
```

Destino **Sua conta**: salve o signing secret em `STRIPE_WEBHOOK_SECRET` e selecione:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
charge.refunded
refund.created
refund.updated
refund.failed
charge.dispute.created
charge.dispute.updated
charge.dispute.closed
```

Destino **Contas conectadas**: salve o segredo diferente em `STRIPE_CONNECT_WEBHOOK_SECRET`. Selecione os mesmos eventos e acrescente:

```text
account.updated
account.application.deauthorized
```

Eventos da conta da plataforma e de contas conectadas são validados com segredos separados. O backend compara conta conectada e ambiente com o pagamento registrado. O SDK oficial Stripe valida a assinatura do corpo original, com tolerância de cinco minutos. O servidor consulta o objeto atualizado na API antes de alterar estados financeiros.

## Eventos de contas Accounts v2

Crie um terceiro destino **Sua conta**, com conteúdo **Mínimo (thin)**. Contas Accounts v2 criadas pela plataforma geram seus eventos de cadastro no escopo da própria plataforma. URL:

```text
https://reusa.up.railway.app/api/payments/stripe/accounts-webhook
```

Selecione:

```text
v2.core.account.created
v2.core.account.updated
v2.core.account.closed
v2.core.account[configuration.merchant].capability_status_updated
v2.core.account[configuration.merchant].updated
v2.core.account[requirements].updated
v2.core.account[defaults].updated
```

Salve o segredo próprio em `STRIPE_ACCOUNT_WEBHOOK_SECRET`. Este endpoint usa `parseEventNotification` do SDK oficial; cada notificação assinada é persistida e dispara uma consulta aos dados atuais da conta. Não reutilize os segredos dos dois destinos snapshot. As consultas de status e a verificação antes de cobrar continuam funcionando mesmo antes de configurar esse destino.

## Railway

Mantenha o serviço apontando para `main`, com Node 22, PostgreSQL configurado e `JWT_SECRET` estável. As migrações são aplicadas ao iniciar. Não exclua banco, volume, negociações ou pagamentos na troca de provedor.

Preencha **somente na aba Variables do backend**, nunca no frontend, Git ou chat:

```env
APP_BASE_URL=https://reusa.up.railway.app
STRIPE_SECRET_KEY=sk_live_SEU_SEGREDO
STRIPE_WEBHOOK_SECRET=whsec_SEGREDO_DA_SUA_CONTA
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_SEGREDO_DAS_CONTAS_CONECTADAS
STRIPE_ACCOUNT_WEBHOOK_SECRET=whsec_SEGREDO_DE_CONTAS_V2
STRIPE_DEMO_MODE=false
STRIPE_CONNECT_ENABLED=true
STRIPE_PIX_ENABLED=false
STRIPE_ENABLE_LIVE=false
```

Os valores acima são exemplos, não credenciais. Use os segredos dos destinos de **produção**, não os do Stripe CLI ou do ambiente de teste. Esta integração não usa chave publicável `pk_`, cadastro manual de produtos ou redirect URI de OAuth.

Após configurar destinos e credenciais, habilite novas operações reais com:

```env
STRIPE_ENABLE_LIVE=true
```

Reimplante o serviço após alterar variáveis. Não basta inserir `sk_live_`: demonstração deve estar desligada, Connect habilitado e ambos os segredos de assinatura configurados. Para interromper novas vendas, volte `STRIPE_ENABLE_LIVE=false`; consultas financeiras, webhooks de pagamentos já registrados e reembolsos continuam funcionando com as credenciais de produção preservadas.

## Vendedores

Em **Configurações → Ofertas e pagamentos**, cada vendedor:

1. Seleciona **Conectar Stripe** e conclui o cadastro hospedado com seus dados e conta bancária.
2. Retorna ao ReUsa+ e consulta a situação da conta. Contas de teste e de produção têm identificadores separados no banco.
3. Aguarda a Stripe habilitar `charges_enabled` e `payouts_enabled`.
4. Usa **Abrir painel de recebimentos** para acessar saldo, repasses, dados pendentes e contestações no painel completo da Stripe. O vendedor entra com o e-mail usado no cadastro e escolhe sua conta no seletor da Stripe. Contas antigas Express continuam usando seus links temporários, criados apenas para o proprietário autenticado.

Uma conta apenas criada não é considerada pronta. A API consulta a Stripe antes de permitir a aceitação de vendas e novamente antes de abrir o checkout. Revogação do acesso e restrições impedem novas cobranças.

No ambiente de teste, o cadastro do vendedor pode ser exercitado mesmo com `STRIPE_DEMO_MODE=true`. Esse modo preserva os pagamentos na conta de teste da plataforma e mostra separadamente as permissões do vendedor; não comprova cobranças diretas nem repasses ao vendedor. Para validar o fluxo conectado, use `STRIPE_DEMO_MODE=false` e aguarde a habilitação efetiva da conta. Em produção, mantenha demonstração desligada e os controles de habilitação descritos acima.

## Compra, entrega e devolução

- O comprador envia uma oferta; o vendedor aceita. Local e horário precisam ser propostos e aceitos por pessoas diferentes antes do pagamento.
- A tentativa é persistida **antes** da chamada externa. Apenas uma cobrança pode ficar ativa por negociação. A chave Stripe e os parâmetros originais são preservados para recuperar uma resposta perdida sem criar outra cobrança.
- Novas tentativas registram a versão do payload de Checkout. Tentativas anteriores à migração de formas dinâmicas mantêm o payload original ao repetir a mesma chave Stripe; uma rejeição definitiva permite iniciar uma nova tentativa com o contrato atual.
- O retorno do navegador não confirma pagamento. Webhooks assinados e conciliação pela API verificam sessão, referência, conta, ambiente, valor, moeda e confirmação efetiva.
- Uma rotina a cada minuto reprocessa eventos pendentes e seleciona pagamentos para conciliação. Pagamentos consultados com sucesso são normalmente revistos após cinco minutos; falhas têm nova tentativa após um minuto. Lotes de até 25 eventos e 25 pagamentos usam travas e leases no PostgreSQL.
- Eventos duplicados não duplicam a transição, os avisos ou o registro financeiro. A inbox persiste apenas os campos necessários para processamento, sem dados de cartão ou documentos dos vendedores.
- Se uma criação de checkout permanecer incerta por 23 horas, o backend não repete a criação: o pagamento permanece bloqueado para conciliação pelo suporte/painel Stripe, pois a retenção de idempotência do provedor não é ilimitada.
- O vendedor pode selecionar **Solicitar reembolso integral** no acordo. A solicitação é persistida antes da API; uma resposta perdida é recuperada pelo ID/metadados na Stripe. Reembolsos parciais feitos no painel também são acompanhados.
- Uma devolução integral confirmada antes da entrega cancela a negociação e libera o anúncio reservado. Se o item já teve recebimento confirmado, o sistema não declara automaticamente que ele foi devolvido.
- A confirmação de recebimento fica bloqueada durante contestação aberta ou reembolso em andamento. O vendedor responde à contestação pelo painel Stripe; o ReUsa+ acompanha a situação atualizada. Uma contestação perdida permanece visível para resolução, sem liberar nova cobrança na mesma negociação.
- Uma oferta Pix antiga sem cobrança pode ser reenviada por cartão pelo comprador, mantendo o valor. Isso encerra o acordo/reserva anteriores e exige novo aceite do vendedor. Pagamentos em andamento impedem essa mudança.

## Histórico financeiro

A integração ativa utiliza exclusivamente Stripe. A retirada da integração antiga preserva os registros de pagamentos e auditoria. Colunas antigas já presentes no banco permanecem inativas; o aplicativo não utiliza essas credenciais. Registros de outro provedor não são convertidos em cobranças Stripe nem expõem links de checkout desativados. A identificação do provedor desses registros fica como indisponível.

## Operação e validação

O endpoint autenticado **somente para administradores** `GET /api/admin/payments/stripe` mostra configuração incompleta, modo atual, quantidade de webhooks pendentes, pagamentos aguardando conciliação e data do último evento processado. Não revela chaves. Erros de conciliação são registrados nos logs com o identificador do pagamento/evento e código de falha.

Execute:

```sh
npm ci
npm test
npm run build
```

Para testar o fluxo financeiro com PostgreSQL descartável:

```sh
STRIPE_TEST_POSTGRES_URL=postgres://usuario:senha@localhost:5432/banco_de_testes node --test test/stripe-workflow.test.js
NODE_ENV=test DATABASE_PROVIDER=postgres POSTGRES_URL=postgres://usuario:senha@localhost:5432/banco_de_testes node --test test/postgres.integration.test.js
```

Os testes HTTP exercitam assinatura, concorrência, conta de vendedor, perda de respostas, replay, reembolso, contestação e recuperação com respostas Stripe simuladas. A integração real deve ser validada no Railway com conta e vendedores autorizados: onboarding, cobrança, entrega do evento, pagamento confirmado, consulta do vendedor e reembolso. Testes locais não comprovam habilitação da conta Stripe, repasse bancário ou entrega de eventos ao domínio público.

As contas já conectadas antes desta atualização mantêm seus identificadores e continuam consultadas pela API correspondente. Duas colunas adicionais registram a versão de cada conta, separadamente em teste e produção; a atualização não cria uma segunda conta para um vendedor já conectado nem altera suas responsabilidades antigas. Novos cadastros usam uma chave de idempotência específica para v2. Checkout, reembolsos e contestações continuam nos endpoints financeiros v1 com o ID da conta conectada.

Referências: [Risco gerenciado pela Stripe](https://docs.stripe.com/connect/risk-management/connected-accounts-with-managed-risk), [Accounts v2](https://docs.stripe.com/connect/accounts-v2), [Direct charges](https://docs.stripe.com/connect/direct-charges), [Webhooks](https://docs.stripe.com/webhooks), [Reembolsos](https://docs.stripe.com/refunds).
