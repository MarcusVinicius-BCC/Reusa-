# Integração Stripe — implementação consolidada

O plano da branch foi incorporado à implementação compartilhada de PostgreSQL e SQLite. O procedimento atual está em [Stripe em produção](stripe-production.md).

Implementado: Checkout hospedado; Connect Accounts v2 com contas separadas por ambiente; verificação de cobranças/repasses; painel do vendedor; assinatura com SDK oficial; tentativas persistidas antes da API; inbox idempotente; conciliação periódica; reembolso integral e recuperação de resposta perdida; acompanhamento de reembolso parcial e contestação; bloqueio de recebimento durante pendência; testes HTTP nos dois bancos e CI com PostgreSQL.

Novos cadastros utilizam Accounts v2, configuração merchant, painel completo e Stripe como coletora de perdas/tarifas. O cadastro e os links são enviados pelo SDK oficial. Eventos financeiros continuam snapshot; mudanças de cadastro v2 usam um destino thin separado. Identificadores de contas existentes e sua versão de API são preservados. A plataforma não utiliza repasses separados ou comissão automática.

Pendente de configuração externa: ativar a plataforma Stripe em produção, habilitar Connect compatível com este modelo, cadastrar os dois destinos de eventos, inserir segredos no Railway, concluir o cadastro de vendedores e validar o fluxo efetivo no domínio publicado. Nenhuma credencial Stripe foi fornecida ao ambiente desta implementação e nenhuma cobrança real foi executada durante os testes.
