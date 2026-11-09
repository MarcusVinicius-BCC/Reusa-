# Vendedores Stripe em ambiente de teste

É possível demonstrar cadastro de vendedores, compras, saldos e reembolsos sem dinheiro real e sem ativar a conta de produção.

No Stripe, habilite Connect no mesmo ambiente de teste/sandbox da chave utilizada. Configure contas Express brasileiras, cadastro hospedado e cobranças diretas. Use somente os dados e cartões de teste indicados pela [documentação Stripe Connect](https://docs.stripe.com/connect/testing).

No backend do Railway, configure:

```env
APP_BASE_URL=https://reusa.up.railway.app
STRIPE_SECRET_KEY=sk_test_SUA_CHAVE_DO_AMBIENTE
STRIPE_DEMO_MODE=false
STRIPE_CONNECT_ENABLED=true
STRIPE_ENABLE_LIVE=false
STRIPE_PIX_ENABLED=false
STRIPE_WEBHOOK_SECRET=whsec_SEGREDO_DA_CONTA_EM_TESTE
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_SEGREDO_CONNECT_EM_TESTE
```

`STRIPE_DEMO_MODE=false` permite que cada vendedor conecte sua conta de teste. O modo `true` usa apenas a conta de teste da plataforma e dispensa a conexão de vendedores. A chave `sk_test_` determina que as operações sejam de teste; desligar o modo de demonstração não as transforma em operações reais. Mantenha `NODE_ENV=production` no Railway: o ambiente do servidor é independente do ambiente financeiro Stripe.

Crie os dois destinos de eventos **no ambiente de teste/sandbox**, ambos com a URL:

```text
https://reusa.up.railway.app/api/payments/stripe/webhook
```

Um destino deve receber eventos da sua conta e o outro de contas conectadas. Use formato snapshot, os eventos listados no [guia de webhooks](stripe-production.md#configuração-da-conta-stripe) e os segredos correspondentes ao ambiente de teste. Chaves e segredos de sandboxes diferentes não devem ser misturados.

Após reimplantar, entre no ReUsa+, acesse **Configurações → Ofertas e pagamentos → Conectar Stripe** e conclua o cadastro com dados de teste. O aviso “Ambiente de teste” deve aparecer; quando a conta estiver habilitada, será exibido “Conta Stripe de teste conectada”. O vendedor pode abrir o painel e visualizar saldos simulados. Teste a compra com um segundo usuário do ReUsa+ e cartão de teste, após aceitar a oferta e o acordo de entrega.

As contas de vendedores de teste e de produção são armazenadas separadamente. Não é necessário cadastrar produtos manualmente no Stripe nem habilitar `STRIPE_ENABLE_LIVE` para esta demonstração.
