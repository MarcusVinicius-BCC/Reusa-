# Vendedores Stripe em ambiente de teste

É possível demonstrar cadastro de vendedores, compras, saldos e reembolsos sem dinheiro real e sem ativar a conta de produção.

No Stripe, habilite Connect no mesmo ambiente de teste/sandbox da chave utilizada. Configure contas brasileiras com Accounts v2, cadastro hospedado, painel completo e cobranças diretas. A API define a Stripe como responsável pela coleta de perdas e tarifas, conforme o modelo exigido pela plataforma. Use somente os dados e cartões de teste indicados pela [documentação Stripe Connect](https://docs.stripe.com/connect/testing).

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
STRIPE_ACCOUNT_WEBHOOK_SECRET=whsec_SEGREDO_CONTAS_V2_EM_TESTE
```

`STRIPE_DEMO_MODE` controla onde os pagamentos de teste são criados. Com `false`, cada venda exige um vendedor conectado e habilitado. Com `true`, os pagamentos são simulados na conta de teste da plataforma, permitindo demonstrar compras enquanto o cadastro do vendedor ainda está pendente. Nos dois modos, `STRIPE_CONNECT_ENABLED=true` permite conectar vendedores de teste, retomar o cadastro e consultar os requisitos reais da conta. O modo de demonstração não marca vendedores pendentes como aprovados nem envia os pagamentos para eles. A chave `sk_test_` determina que as operações sejam de teste; desligar o modo de demonstração não as transforma em operações reais. Mantenha `NODE_ENV=production` no Railway: o ambiente do servidor é independente do ambiente financeiro Stripe.

No mesmo ambiente de teste, habilite **Cartão** em **Configurações → Formas de pagamento** na Stripe. Em demonstração, use as configurações da plataforma; com vendedores conectados, confira a conta do vendedor que recebe a cobrança. O Checkout usa formas dinâmicas do Dashboard e `allowed_payment_method_types` para preservar a forma escolhida no acordo. Para Pix, também é necessário habilitá-lo na Stripe e definir `STRIPE_PIX_ENABLED=true`; a variável isolada não ativa o método no provedor.

Crie os dois destinos de eventos **no ambiente de teste/sandbox**, ambos com a URL:

```text
https://reusa.up.railway.app/api/payments/stripe/webhook
```

Um destino deve receber eventos da sua conta e o outro de contas conectadas. Para estes dois destinos de pagamentos, use formato snapshot e os eventos listados no [guia de webhooks](stripe-production.md#configuração-da-conta-stripe).

Para as atualizações de cadastro Accounts v2, crie ainda um destino **Sua conta → Mínimo** apontando para `https://reusa.up.railway.app/api/payments/stripe/accounts-webhook`. Salve o segredo em `STRIPE_ACCOUNT_WEBHOOK_SECRET`; os eventos estão na seção [Eventos de contas Accounts v2](stripe-production.md#eventos-de-contas-accounts-v2). A conexão e a consulta manual da conta não dependem desse terceiro webhook; ele permite acompanhar as alterações automaticamente. Use os segredos correspondentes ao mesmo ambiente de teste. Chaves e segredos de sandboxes diferentes não devem ser misturados.

Após reimplantar, entre no ReUsa+, acesse **Configurações → Ofertas e pagamentos → Conectar Stripe** e conclua o cadastro com dados de teste. O aviso “Ambiente de teste” deve aparecer. Uma conta vinculada será exibida como “Conta Stripe de teste conectada”, com a situação de cobranças e repasses separada. “Em análise” ou “Aguardando liberação” significa que a conexão foi reconhecida, mas a Stripe ainda não liberou todas as permissões; “Teste habilitado” confirma ambas as permissões ativas. “Continuar cadastro” aparece quando ainda há informações a fornecer.

A situação é consultada ao abrir a seção, ao voltar da Stripe e a cada 15 segundos enquanto a seção estiver visível. Também é possível usar “Atualizar situação da conta”. Uma falha de consulta mantém a última situação conhecida e exibe o erro. O vendedor pode abrir o painel e visualizar saldos simulados. Teste a compra com um segundo usuário do ReUsa+ e cartão de teste, após a liberação das permissões, o aceite da oferta e o acordo de entrega.

As pendências aparecem em português na própria seção, com o botão “Continuar cadastro”. Em “Identificar minha conta Stripe”, o vendedor encontra o ID da conta vinculada ao seu usuário para comparar com o Dashboard ou informar ao suporte. O endpoint de status exige autenticação e retorna somente o vínculo do usuário autenticado.

A conexão criada não equivale à aprovação de identidade. Complete o cadastro hospedado e as etapas solicitadas pela Stripe. Os tokens genéricos de identificação de nove dígitos da documentação não constituem um CPF brasileiro documentado de onze dígitos; os testes de documento também não comprovam a conclusão da prova de vida. Caso o formulário brasileiro não ofereça dados de teste adequados, confirme o procedimento aplicável com o suporte Stripe. O ReUsa+ continua mostrando as pendências até a API indicar a habilitação efetiva.

As contas de vendedores de teste e de produção são armazenadas separadamente. Não é necessário cadastrar produtos manualmente no Stripe nem habilitar `STRIPE_ENABLE_LIVE` para esta demonstração.

## Troca de conta Stripe ou sandbox

Uma chave de outra conta Stripe ou sandbox não dá acesso aos vendedores criados no ambiente anterior. Se a conta antiga foi excluída ou o ambiente foi substituído, o ReUsa+ mostra “Sem acesso”, mantém o ID do vínculo anterior e pausa as consultas automáticas. Isso não é uma verificação de identidade em andamento.

Configure no Railway a chave `sk_test_` e os segredos de webhook do ambiente atual, com `STRIPE_CONNECT_ENABLED=true`. Em **Configurações → Ofertas e pagamentos**, use **Criar novo cadastro de teste**. O backend confirma a falta de acesso à conta anterior, cria uma conta Accounts v2 no ambiente atual, preserva o vínculo anterior em `stripe_account_link_history` e encaminha ao cadastro hospedado. Uma falha na geração do link pode ser retomada pelo botão “Continuar cadastro”, usando a conta já salva.

A recuperação exige autenticação, confere o ID atualmente vinculado e utiliza uma chave de idempotência para não duplicar contas em chamadas concorrentes. Só está disponível com chave de teste, quando a conta anterior está inacessível e não possui registros de pagamentos associados. Contas acessíveis, falhas de autenticação, erros temporários e vínculos de produção não são substituídos por esse fluxo. Se existem pagamentos vinculados à conta antiga, o sistema exige revisão pelo suporte para preservar a conciliação. Após corrigir as permissões da mesma conta, use “Atualizar situação da conta” para retomar as consultas.

Durante a consulta e a recuperação em teste, o sistema verifica o acesso à conta anterior. Uma resposta `403 forbidden` ou `404 resource_missing` nessa verificação é registrada como `[stripe] sandbox account inaccessible`, em nível informativo; ela não comprova falha na criação da nova conta. Os registros `[stripe-connect] test account replacement saved` e `[stripe-connect] test onboarding ready` identificam, respectivamente, o vínculo novo salvo e o link de cadastro gerado. Falhas de autenticação, consultas financeiras, operações de criação e erros de produção continuam sendo registradas como erros. Os logs não incluem chaves nem URLs de cadastro com tokens.
