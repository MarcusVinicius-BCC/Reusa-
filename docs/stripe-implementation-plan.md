# Plano de integração Stripe — ReUs+ (revisão técnica, 09/11/2026)

> **Status:** plano técnico independente preparado a partir da documentação pública oficial e da PR #8. **Não é a saída do `stripe_implementation_planner`**, pois o MCP da Stripe ainda não foi conectado. Nenhuma chave de API foi acessada.

## Escopo e premissas

- ReUs+ é um marketplace comunitário brasileiro para **doação**, **troca** e **venda** de objetos reutilizáveis e recicláveis.
- Tecnologias: React, Node.js/Express, PostgreSQL, Railway; histórico anterior Mercado Pago.
- Somente a **venda com valor acordado** gera cobrança. Doações e trocas não devem gerar Checkout.
- Negociação: comprador propõe valor e método, vendedor aceita/reserva; requisitos de coleta e entrega são conferidos antes da liberação do pagamento.
- A apresentação acadêmica temporária não precisa processar dinheiro real nem integrar contas verdadeiras de vendedores.
- A integração real de marketplace depende de verificação legal, identidade de participantes, requisitos de compliance, habilitação da conta Stripe e do país. Não confundir modo de teste com permissão de produção.
- Em ambiente de teste: `sk_test_`, `STRIPE_DEMO_MODE=true`, `STRIPE_ENABLE_LIVE=false`; não utilizar banco real.

## Fases e critérios de aceite

### Fase 1 — Checkout hospedado de teste (sem Connect real)
1. Criar conta Stripe e habilitar **modo de teste** no dashboard.
2. Definir em **Railway > Reusa > Variables**:
   ```env
   APP_BASE_URL=https://reusa.up.railway.app
   STRIPE_SECRET_KEY=sk_test_...             # somente no Railway
   STRIPE_WEBHOOK_SECRET=whsec_...          # somente no Railway
   STRIPE_DEMO_MODE=true
   STRIPE_ENABLE_LIVE=false
   STRIPE_CONNECT_ENABLED=false
   STRIPE_PIX_ENABLED=false
   ```
3. Registrar destino de eventos Stripe na conta da plataforma:
   `https://reusa.up.railway.app/api/payments/stripe/webhook`.
   Eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`.
4. Criar sessão **somente no servidor** depois de validar propriedade da negociação, estado reservado, valor, moeda BRL e método da proposta aceita.
5. Registrar `paymentId`, `checkout_session.id`, valor, moeda, comprador, vendedor, chave de idempotência, estado `processing` e trilha de auditoria.
6. Redirecionar o cliente para a página hospedada Stripe; nunca processar dados de cartão no ReUs+.
7. Verificar assinatura do webhook usando **corpo bruto**, recuperar a Session na API e comparar `session.id`, `client_reference_id`, `metadata.payment_id`, `currency`, `amount_total` e `payment_status`. **Não** confirmar apenas pelo retorno do navegador.
8. No UI distinguir claramente **pagamento de teste** de recebimento real do vendedor.
9. Testar aprovado, recusado, cancelado, evento duplicado, evento com assinatura inválida, alteração de valor, reenvio de webhook e expiração. **A aprovação dos testes com mocks não substitui um teste ponta a ponta em Stripe test mode.**

**Pronto quando:** o comprador recebe link `checkout.stripe.com`, a Stripe registra cobrança de teste, e o ReUs+ só mostra `succeeded` depois de webhook autenticado; nenhuma quantia real é movimentada.

### Fase 2 — Connect para contas de vendedores (ainda não pronta)
1. Na PR #8, o protótipo usa `POST /v1/accounts` com `type=express` (**Accounts v1**). Para uma **plataforma nova** Stripe recomenda avaliar **Accounts v2**. Antes de liberar o Connect, migrar/validar o modelo de conta de acordo com o [guia oficial Accounts v2](https://docs.stripe.com/connect/accounts-v2) e o [guia interativo](https://docs.stripe.com/connect/interactive-platform-guide). Não ativar o código legado só porque compila.
2. Definir o modelo financeiro com base no funcionamento pretendido:
   - **Plataforma**: comprador paga diretamente ao vendedor, sem custódia ou comissão — considerar *direct charges*; a Stripe cobra conforme responsabilidade configurada.
   - **Marketplace que coleta e distribui**: considerar *destination charges*; exige responsabilidades adicionais de risco, taxas, reembolsos e compliance. Como o ReUs+ não cobra comissão e pretende não custodiar recursos, **direct charge** é hipótese inicial, pendente de avaliação do planejador oficial.
3. Para vendedor real: criar conta conectada, onboarding hospedado, verificar requisitos pendentes, permissões de pagamento e repasse, capacidade e país. O simples retorno do onboarding **não** significa cadastro concluído.
4. Assinar os eventos de **contas conectadas** em destino separado e secret `STRIPE_CONNECT_WEBHOOK_SECRET`; validar `event.account` contra a conta cadastrada do vendedor.
5. Implementar reconciliação de estados de conta, expiração/restrições, atualização de cadastro, desligamento, reembolsos e disputas; políticas claras para vendedor e comprador.
6. **Não ativar cobranças reais** antes de validar termos legais, identidade comercial necessária, elegibilidade e fluxo de reembolsos/disputas.

### Fase 3 — Pix
1. Consultar elegibilidade real em [configurações de métodos de pagamento](https://dashboard.stripe.com/settings/payment_methods) e [documentação Stripe Pix](https://docs.stripe.com/payments/pix).
2. Quando a conta e o fluxo de fundos tiverem Pix habilitado, ativar `STRIPE_PIX_ENABLED=true` e testar em modo de teste com Stripe Checkout.
3. Não exibir Pix como opção utilizável no ReUs+ enquanto desabilitado; propostas antigas com Pix devem mostrar instrução de troca de método, em vez de gerar erro ao pagar.
4. Webhook de pagamento assíncrono controla confirmação; não criar QR Code Pix próprio se o Checkout hospedado é quem oferece instruções.

## Revisão da PR #8: pontos fortes e pendências

**Já implementado na branch:** Checkout Session hospedada; BRL em centavos; metadados e referência externa; chave de idempotência; sessão consultada no servidor; verificação HMAC no webhook; validação de valor; confirmação assíncrona; divisão entre sandbox e live; onboarding Express em teste; migração não destrutiva do campo `users.stripe_account_id`; testes unitários.

**Pendências antes do merge e da produção:**
- **Alta:** migrar/revisar Connect **Accounts v1 Express** para Accounts v2, conforme elegibilidade e desenho de responsabilidades; idealmente gerar plano oficial `stripe_implementation_planner` pelo plugin conectado.
- **Alta:** configurar Stripe em test mode e executar **fluxo real completo**, inclusive webhook e atualização de pagamento em PostgreSQL no Railway. Os testes atuais usam mocks.
- **Alta:** webhook replay e falhas de rede: tabela de `event.id` processados, idempotência, reconciliação periódica de sessões pendentes e novos eventos.
- **Alta:** proteger cobranças de eventos indevidos e tratar `refund`, `charge.dispute`, reversões de transferência e cancelamentos; não assumir que `succeeded` é irrevogável.
- **Alta:** decidir o comportamento das cobranças Mercado Pago históricas já `processing` antes de remover o webhook antigo; não perder reconciliação de pagamentos antigos.
- **Média:** adotar SDK Node.js oficial `stripe` para assinatura e acesso à API, quando o npm e o lockfile estiverem disponíveis (em vez de HMAC manual). Atualizar `package-lock.json` e testes.
- **Média:** esconder/desabilitar Pix no formulário de proposta quando não habilitado e tratar ofertas antigas Pix.
- **Média:** adicionar testes HTTP de ponta a ponta dos dois backends (PostgreSQL e SQLite), regressão em aceitar/reservar, liquidação, idempotência e conciliação, além dos testes unitários.
- **Média:** confirmar minimum/maximum para BRL e Pix, URLs de retorno, possíveis chargebacks, privacidade e mensagens de UI.

## Critérios de go-live

- Chaves secretas só em variáveis protegidas; `STRIPE_ENABLE_LIVE=false` até aprovação.
- Conta plataforma aprovada e modelo Connect validado com a Stripe.
- Vendedores reais passam onboarding/verificação; não haverá recebimento simulado representado como real.
- Webhooks testados e monitorados; deduplicação, retries, reconciliação e auditoria.
- Reembolsos/disputas documentados e testados.
- Plano de rollback e conciliação de pagamentos antigos Mercado Pago.
- Smoke test no Railway em modo de teste antes de trocar a origem do deploy de `main`.

## Referências oficiais

- https://docs.stripe.com/payments/checkout
- https://docs.stripe.com/connect/accounts-v2
- https://docs.stripe.com/connect/interactive-platform-guide
- https://docs.stripe.com/connect/direct-charges
- https://docs.stripe.com/events/manage-webhook-endpoints
- https://docs.stripe.com/payments/pix
- https://github.com/stripe/stripe-cli

## Estado do ambiente neste atendimento

- Tentativa `npm install -g @stripe/cli`: falhou por `EAI_AGAIN` ao acessar `registry.npmjs.org`. **Não** instalado.
- Tentativa `stripe agent setup`: comando não encontrado.
- `stripe_implementation_planner`: não listado entre ferramentas MCP autorizadas nesta sessão. Plugin Stripe foi sugerido para conexão pelo usuário.
- Chaves `sk_test_` / `whsec_` **não** foram recebidas nem lidas; nenhuma criação de pagamento real ou em Stripe test mode foi executada.
