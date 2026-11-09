# Integração Stripe — implementação consolidada

O plano da branch foi incorporado à implementação compartilhada de PostgreSQL e SQLite. O procedimento atual está em [Stripe em produção](stripe-production.md).

Implementado: Checkout hospedado; Express Connect com contas separadas por ambiente; verificação de cobranças/repasses; painel do vendedor; assinatura com SDK oficial; tentativas persistidas antes da API; inbox idempotente; conciliação periódica; reembolso integral e recuperação de resposta perdida; acompanhamento de reembolso parcial e contestação; bloqueio de recebimento durante pendência; preservação do webhook Mercado Pago; testes HTTP nos dois bancos e CI com PostgreSQL.

O modelo escolhido continua sendo Accounts v1 Express com cobranças diretas. A plataforma não utiliza cobranças com repasses separados ou comissão automática. Alterar o modelo Connect exige rever onboarding e responsabilidades financeiras com a Stripe.

Pendente de configuração externa: ativar a plataforma Stripe em produção, habilitar Connect compatível com este modelo, cadastrar os dois destinos de eventos, inserir segredos no Railway, concluir o cadastro de vendedores e validar o fluxo efetivo no domínio publicado. Nenhuma credencial Stripe foi fornecida ao ambiente desta implementação e nenhuma cobrança real foi executada durante os testes.
