# ReUsa+

> **Economia circular, comunidade e impacto em um só lugar.**

O **ReUsa+** é uma plataforma web para dar uma nova vida a itens que seriam
descartados. A comunidade pode publicar produtos para **doação, troca ou
venda**, conversar com interessados, concluir negociações e encontrar pontos
de coleta.

Além do marketplace comunitário, o sistema oferece mapa colaborativo,
inspirações de reaproveitamento, notificações, indicadores de impacto e uma
área administrativa.

<p align="center">
  <img src="src/assets/reusa-logo.png" alt="Logo ReUsa+" width="220">
</p>

## Sumário

- [Visão geral](#visão-geral)
- [Funcionalidades](#funcionalidades)
- [Arquitetura](#arquitetura)
- [Tecnologias](#tecnologias)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Pré-requisitos](#pré-requisitos)
- [Executar localmente](#executar-localmente)
- [Configuração](#configuração)
- [Comandos](#comandos)
- [Banco de dados](#banco-de-dados)
- [Serviços distribuídos](#serviços-distribuídos)
- [APIs externas](#apis-externas)
- [API própria](#api-própria)
- [Pagamentos com Mercado Pago](#pagamentos-com-mercado-pago)
- [Testes e validação](#testes-e-validação)
- [Docker](#docker)
- [Deploy na Railway](#deploy-na-railway)
- [Segurança](#segurança)
- [Licença e uso](#licença-e-uso)

## Visão geral

```text
+----------------------+        +----------------------+
| React + Vite         |        | PostgreSQL ou SQLite |
| Interface web        |        | Persistencia         |
+----------+-----------+        +----------^-----------+
           | /api                           |
           v                                |
+----------------------+                     |
| Core ReUsa+          +---------------------+
| Node.js + Express    |
+----------+-----------+
           | eventos
           v
+----------------------+        +----------------------+
| RabbitMQ             +------->| Notificacoes         |
| Outbox transacional  +------->| Impacto ambiental    |
+----------------------+        +----------------------+
```

Em desenvolvimento, a aplicação pode funcionar apenas com Node.js e SQLite.
Em uma instalação completa, o Docker Compose adiciona PostgreSQL, Redis,
RabbitMQ, o serviço de notificações e o serviço de impacto.

## Funcionalidades

### Comunidade e anúncios

- Cadastro de pessoas e empresas;
- Login com e-mail e senha;
- Confirmação de e-mail;
- Login opcional com Google;
- Feed de publicações;
- Publicações para doação, troca ou venda;
- Upload de até oito imagens por anúncio;
- Curtidas, favoritos, comentários e visualizações;
- Edição e exclusão de anúncios;
- Status `Disponível`, `Reservado`, `Doado`, `Trocado`, `Vendido` e `Encerrado`.

### Negociação

- Demonstração de interesse;
- Conversas relacionadas aos anúncios;
- Propostas de negociação;
- Reserva de itens;
- Conclusão como doação, troca ou venda;
- Checkout de pagamento via Mercado Pago;
- Avaliações entre participantes.

### Mapa e impacto

- Mapa com Leaflet e OpenStreetMap;
- Pontos de coleta cadastrados;
- Sugestão de novos pontos pela comunidade;
- Busca de pontos próximos;
- Cálculo de rotas;
- Indicadores de itens reutilizados, doações, trocas e beneficiários.

### Administração

- Dashboard administrativo;
- Consulta e suspensão de usuários;
- Moderação de anúncios e denúncias;
- Gerenciamento de pontos de coleta;
- Aprovação ou rejeição de sugestões da comunidade.

## Arquitetura

O frontend e o backend ficam no mesmo repositório. Em produção, o serviço
`core` compila e serve a interface React e também expõe a API Express.

```text
Usuário
  │
  ▼
React / React Router / Zustand
  │
  ▼
src/services/api.js
  │
  ▼
API própria: /api/*
  │
  ├──► SQLite local ou PostgreSQL
  ├──► Outbox de eventos
  ├──► Integrações externas
  └──► RabbitMQ
          ├──► services/notification-service.js
          └──► services/impact-service.js
```

O arquivo central do backend é [`backend.js`](backend.js). A comunicação
HTTP do frontend é centralizada em [`src/services/api.js`](src/services/api.js)
e o estado global é mantido em [`src/state/store.js`](src/state/store.js).

## Tecnologias

| Camada | Tecnologias |
| --- | --- |
| Interface | React 18, JSX, React Router, Zustand, Vite |
| Mapas | Leaflet, React Leaflet, OpenStreetMap |
| Backend | Node.js 22 LTS, Express |
| Autenticação | JWT, `scrypt`, OAuth 2.0 do Google (opcional) |
| Uploads | Multer, armazenamento local ou compatível com S3 |
| Banco local | SQLite via SQL.js |
| Banco de produção | PostgreSQL |
| Mensageria | RabbitMQ via AMQP |
| Cache/infraestrutura | Redis |
| Observabilidade | Endpoint de métricas em `/metrics` |
| Deploy | Railway ou Docker Compose |

## Estrutura do projeto

```text
.
├── backend.js                  # API Express e servidor principal
├── package.json                # Dependências e scripts
├── Dockerfile                  # Imagem de produção
├── docker-compose.yml          # Ambiente completo
├── railway.toml                # Configuração de deploy na Railway
├── index.html                  # Entrada do frontend
├── src/
│   ├── main.jsx                # Montagem do React
│   ├── App.jsx                 # Entrada da aplicação
│   ├── routes.jsx              # Telas e navegação
│   ├── services/api.js         # Cliente da API própria
│   ├── state/store.js          # Estado global com Zustand
│   ├── data/                   # Dados de fallback
│   └── assets/                 # Imagens da interface
├── storage/
│   ├── postgres-api.js         # Rotas no modo PostgreSQL
│   ├── postgres-repository.js  # Acesso ao PostgreSQL
│   ├── postgres-domains.js     # Repositórios de domínio
│   └── location-validation.js  # Validações de localização
├── distributed/
│   ├── event-publisher.js      # Publicação na outbox/RabbitMQ
│   ├── object-storage.js       # Integração compatível com S3
│   ├── redis-client.js         # Cliente Redis
│   └── observability.js        # Métricas HTTP
├── services/
│   ├── notification-service.js # Consumidor de notificações
│   ├── impact-service.js       # Consumidor de impacto
│   └── persistence.js          # Persistência dos serviços
├── migrations/                 # Migrações e índices SQL
├── scripts/                    # Migração e verificação do banco
└── test/                       # Testes automatizados
```

## Pré-requisitos

Para a execução básica:

- [Node.js](https://nodejs.org/) 22 LTS;
- npm, incluído no Node.js;
- Git.

Docker Desktop é opcional e necessário apenas para executar a infraestrutura
completa.

## Executar localmente

### Instalação e produção local

```bash
git clone https://github.com/MarcusVinicius-BCC/Reusa-.git
cd Reusa-
npm install
npm run build
npm start
```

Abra:

- Interface e API: <http://localhost:3000>
- Health check: <http://localhost:3000/api/health>

### Desenvolvimento com atualização automática

Em dois terminais:

```bash
# Terminal 1: backend Node.js
npm run dev
```

```bash
# Terminal 2: frontend Vite
npm run dev:ui
```

Abra <http://localhost:5173>. O Vite encaminha `/api` para
`http://localhost:3000`.

Na primeira execução, o sistema cria o banco local em `data/reusa.sqlite`.

## Configuração

O sistema funciona sem arquivo `.env` na configuração mínima. Para produção,
defina as variáveis diretamente no ambiente de execução. Nunca publique
segredos no Git.

### Variáveis principais

| Variável | Quando usar | Finalidade |
| --- | --- | --- |
| `PORT` | Opcional | Porta HTTP; padrão `3000`. |
| `JWT_SECRET` | Produção | Segredo longo e aleatório para assinar sessões. |
| `DATA_DIR` | Opcional | Diretório do SQLite e dos uploads; padrão `./data`. |
| `DATABASE_PROVIDER` | PostgreSQL | Use `postgres` para ativar PostgreSQL. |
| `DATABASE_URL` ou `POSTGRES_URL` | PostgreSQL | String de conexão do banco. |
| `APP_BASE_URL` | Produção | URL pública da aplicação. |
| `ADMIN_EMAILS` | Opcional | E-mails administrativos separados por vírgula. |
| `GOOGLE_CLIENT_ID` | Login Google | Client ID OAuth. |
| `GOOGLE_CLIENT_SECRET` | Login Google | Segredo OAuth; não versionar. |
| `GOOGLE_REDIRECT_URI` | Login Google | Callback `/api/auth/google/callback`. |
| `RESEND_API_KEY` | E-mail | Chave para envio de confirmação por e-mail. |
| `EMAIL_FROM` | E-mail | Remetente das mensagens de confirmação. |
| `REDIS_URL` | Opcional | Conexão Redis. |
| `AMQP_URL` | Opcional | Conexão RabbitMQ. |
| `EVENT_EXCHANGE` | Opcional | Exchange de eventos; padrão `reusa.events`. |
| `SERVICE_AUTH_TOKEN` | Serviços | Autenticação entre serviços internos. |
| `NOTIFICATION_SERVICE_URL` | Distribuído | URL do serviço de notificações. |
| `IMPACT_SERVICE_URL` | Distribuído | URL do serviço de impacto. |
| `S3_*` | Upload externo | Configuração do armazenamento compatível com S3. |

> `S3_PUBLIC_BASE_URL` deve ser a URL pública que já aponta para o bucket,
> por exemplo `https://pub-xxxx.r2.dev` ou um domínio personalizado. As
> imagens serão acessadas como `/uploads/<arquivo>`.

> Em produção, defina obrigatoriamente `JWT_SECRET`. Para preservar uploads
> locais na Railway, use um Volume montado em `/data` e `DATA_DIR=/data`.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm start` | Inicia o backend principal. |
| `npm run dev` | Inicia o backend com `node --watch`. |
| `npm run dev:ui` | Inicia o servidor Vite. |
| `npm run build` | Gera o frontend em `dist/`. |
| `npm test` | Executa os testes Node.js. |
| `npm run migrate:postgres:schema` | Aplica as migrações PostgreSQL. |
| `npm run migrate:postgres` | Migra dados do SQLite para PostgreSQL. |
| `npm run verify:postgres` | Verifica a migração PostgreSQL. |

## Banco de dados

### SQLite

É o modo padrão local. O arquivo principal é:

```text
data/reusa.sqlite
```

O banco é carregado pelo SQL.js e persistido em arquivo. Diretórios
`data-debug`, `data-run` e `data-local-*` podem existir como ambientes
temporários de desenvolvimento ou testes.

### PostgreSQL

Ative com:

```env
DATABASE_PROVIDER=postgres
POSTGRES_URL=postgres://usuario:senha@localhost:5432/reusa
JWT_SECRET=troque-por-um-segredo-longo-e-aleatorio
```

As migrações ficam em [`migrations/`](migrations/) e são aplicadas pelo
script [`scripts/run-postgres-migrations.js`](scripts/run-postgres-migrations.js).

As entidades principais incluem:

`users`, `posts`, `post_images`, `threads`, `messages`, `negotiations`,
`negotiation_proposals`, `payments`, `reviews`, `comments`, `favorites`,
`notifications`, `reports`, `collection_points` e `event_outbox`.

## Serviços distribuídos

O fluxo de eventos usa uma outbox transacional:

```text
Operação concluída
  ↓
event_outbox
  ↓
RabbitMQ / reusa.events
  ├── negotiation.*
  ├── message.sent
  └── review.created
       ↓
notification-service
impact-service
```

Os eventos são processados com entrega **at-least-once**, permitindo retentativa
quando o broker está indisponível.

Serviços internos:

| Serviço | Porta padrão | Arquivo |
| --- | ---: | --- |
| Core | 3000 | [`backend.js`](backend.js) |
| Notificações | 3001 | [`services/notification-service.js`](services/notification-service.js) |
| Impacto | 3002 | [`services/impact-service.js`](services/impact-service.js) |

## APIs externas

Estas integrações não pertencem ao domínio principal do ReUsa+; são chamadas
pelo backend quando a funcionalidade correspondente é utilizada.

| Serviço externo | Uso |
| --- | --- |
| Google OAuth | Login social |
| BrasilAPI | Consulta de empresas por CNPJ |
| Resend | Envio de confirmação de e-mail |
| Nominatim | Geocodificação de endereços |
| Overpass API | Busca de pontos públicos no OpenStreetMap |
| OSRM | Cálculo de rotas |
| OpenStreetMap | Tiles e dados visuais do mapa |
| Google Fonts | Fontes e ícones da interface |

As rotas `/api/*` são a API própria do ReUsa+. O frontend não precisa chamar
diretamente APIs externas que exigem segredo.

## API própria

### Saúde e operação

```text
GET /api/health
GET /api/health/live
GET /api/health/ready
GET /api/distributed/status
GET /api/distributed/overview
GET /metrics
```

### Autenticação

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
GET  /api/auth/verify-email
POST /api/auth/resend-verification
GET  /api/auth/google
GET  /api/auth/google/callback
```

### Publicações e interação

```text
GET    /api/feed
GET    /api/posts/:id
POST   /api/posts
PUT    /api/posts/:id
DELETE /api/posts/:id
PATCH  /api/posts/:id/status
POST   /api/posts/:id/like
POST   /api/posts/:id/favorite
GET    /api/posts/:id/comments
POST   /api/posts/:id/comments
```

### Negociação, mensagens e perfil

```text
GET|POST|PATCH /api/negotiations/*
GET|POST|DELETE /api/messages/threads/*
GET|POST       /api/notifications/*
GET|PUT|DELETE /api/profile/*
GET             /api/impact/community
```

### Mapa e administração

```text
GET|POST /api/collection-points/*
GET      /api/map-route
GET      /api/businesses/cnpj/:cnpj
GET|POST|PATCH|DELETE /api/admin/*
```

Rotas protegidas exigem `Authorization: Bearer <token>`. Rotas administrativas
exigem, além do token, um usuário com `role=admin`.

## Pagamentos com Stripe Checkout e Stripe Connect

A Stripe substitui o Mercado Pago nos **novos pagamentos**. O ReUsa+ usa a
API Stripe Checkout Sessions (`POST /v1/checkout/sessions`) e redireciona o
comprador ao checkout hospedado. Dados de cartão nunca passam pelo backend.

### Demonstração acadêmica (sem dinheiro real)

Crie uma conta Stripe e use somente **chaves de teste** (`sk_test_`).
Em Railway > Reusa > Variables, configure:

```text
APP_BASE_URL=https://reusa.up.railway.app
STRIPE_SECRET_KEY=sk_test_SEU_SEGREDO
STRIPE_WEBHOOK_SECRET=whsec_SEGREDO_DA_CONTA
STRIPE_DEMO_MODE=true
STRIPE_PIX_ENABLED=false
STRIPE_CONNECT_ENABLED=false
STRIPE_ENABLE_LIVE=false
```

No Dashboard Stripe > Developers/Workbench > Webhooks/Event destinations,
adicione um destino **da sua própria conta** apontando para:
`https://reusa.up.railway.app/api/payments/stripe/webhook`.

Inscreva-se em `checkout.session.completed`,
`checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed` e `checkout.session.expired`.
Copie o signing secret `whsec_...` para `STRIPE_WEBHOOK_SECRET`.
Configure a URL pública HTTPS sem barra final e reinicie o serviço.

No modo demonstração, o backend ignora contas de vendedores: não há repasses.
Cartões de teste podem simular compras; nenhuma transação pode ser aprovada
somente pelo retorno do navegador. Uma cobrança só é confirmada após webhook
com assinatura válida e verificação do Checkout Session ID, referência,
valor, moeda e `payment_status=paid` na API Stripe.

### Pix

O Pix da Stripe pode exigir convite e habilitação. Não assuma que estará
disponível para uma conta nova. O ReUsa+ inicia com
`STRIPE_PIX_ENABLED=false`. Ao habilitar na Stripe, configure a variável
como `true`; o Checkout hospedado gerenciará QR Code e instruções.
O ReUsa+ não gera Pix nem mostra QR próprio. Nunca tente pagar um QR Code
com um banco real durante testes.

### Stripe Connect para vendedores

Em uma conta de plataforma habilitada para Connect, defina
`STRIPE_DEMO_MODE=false` e `STRIPE_CONNECT_ENABLED=true` **somente após**
revisar elegibilidade e onboarding. O botão **Conectar Stripe** abre o
onboarding hospedado para contas Express brasileiras. O servidor consulta
`charges_enabled` e `payouts_enabled` antes de indicar conta pronta.
Checkout é criado na conta conectada (cobrança direta), sem guardar senhas
ou tokens de vendedores no banco.

Para pagamentos de contas conectadas, crie **outro destino webhook** no
painel Stripe configurado para **contas conectadas**, na mesma URL
`/api/payments/stripe/webhook`, e salve o segredo desse destino em
`STRIPE_CONNECT_WEBHOOK_SECRET`. Não confunda os segredos.

**A produção não está pronta apenas porque o código compila.** É preciso
conta verificada, Connect habilitado, webhook configurado, política de
estornos/reembolsos, teste real autorizado e requisitos de conformidade
aplicáveis. O backend bloqueia `sk_live_` enquanto
`STRIPE_ENABLE_LIVE` não for explicitamente `true`.

Rotas:

```text
GET  /api/payments/stripe/connect
GET  /api/payments/stripe/refresh
GET  /api/payments/stripe/status
POST /api/payments/stripe/webhook
GET  /api/negotiations/:id/payment
POST /api/negotiations/:id/payment
```

Os registros históricos de pagamentos Mercado Pago continuam no banco para
consulta, mas **nenhum novo pagamento** utiliza o provedor antigo. A migração
SQL acrescenta `users.stripe_account_id` sem apagar dados existentes.

Documentação:
- https://docs.stripe.com/payments/checkout
- https://docs.stripe.com/connect/express-accounts
- https://docs.stripe.com/webhooks
- https://support.stripe.com/questions/how-to-enable-pix-as-a-payment-method-in-brazil


## Testes e validação

Execute:

```bash
npm test
npm run build
```

Os testes usam diretórios temporários e não devem alterar o banco local de
desenvolvimento. O health check pode ser verificado com:

```bash
curl http://localhost:3000/api/health
```

Resposta esperada:

```json
{
  "ok": true
}
```

## Entrega em um único contêiner

A imagem padrão funciona sem PostgreSQL, Redis, RabbitMQ ou credenciais de
serviços externos. Ela usa SQLite e armazenamento local para permitir que a
avaliação comece imediatamente. O Cloudflare R2 e o PostgreSQL continuam
disponíveis quando suas variáveis são fornecidas no ambiente.

Para criar e executar:

```bash
docker build -t reusa-plus .
docker run --rm -p 3000:3000 -e JWT_SECRET=chave-local-de-avaliacao reusa-plus
```

Abra <http://localhost:3000> e valide <http://localhost:3000/api/health>.
Para manter o SQLite e os uploads entre execuções, use um volume:

```bash
docker run --rm -p 3000:3000 -e JWT_SECRET=chave-local-de-avaliacao \
  -v reusa-plus-data:/app/data reusa-plus
```

Para exportar uma imagem para envio pelo SIGAA:

```bash
docker save reusa-plus -o reusa-plus.tar
```

No computador do professor:

```bash
docker load -i reusa-plus.tar
docker run --rm -p 3000:3000 -e JWT_SECRET=chave-local-de-avaliacao reusa-plus
```

Não inclua chaves do Cloudflare, PostgreSQL ou outros serviços na imagem.

## Ambiente completo com Docker Compose

O ambiente completo sobe PostgreSQL, RabbitMQ, Redis, core, notificações e
impacto:

```bash
docker compose up --build
```

Abra <http://localhost:3000>.

Para encerrar:

```bash
docker compose down
```

Os dados persistentes ficam nos volumes Docker declarados em
[`docker-compose.yml`](docker-compose.yml).

## Deploy na Railway

O arquivo [`railway.toml`](railway.toml) já define:

- Build: `npm run build`;
- Inicialização: `npm start`;
- Health check: `/api/health`;
- Reinício em caso de falha.

Passos:

1. Crie um projeto na [Railway](https://railway.app/);
2. Escolha **Deploy from GitHub Repo**;
3. Selecione o repositório;
4. Adicione PostgreSQL;
5. Configure `DATABASE_PROVIDER=postgres`;
6. Configure `DATABASE_URL`;
7. Configure um `JWT_SECRET` forte;
8. Gere um domínio público;
9. Teste `https://seu-dominio/api/health`.

Para login Google, cadastre no Google Cloud:

```text
https://seu-dominio/api/auth/google/callback
```

Depois configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_REDIRECT_URI` e `APP_BASE_URL`.

## Pix integrado — testes controlados

O desenvolvimento do Pix por QR Code está isolado na branch `feat/pix-in-site`,
que preserva o Checkout Pro para cartão. **Não ative para clientes reais** até
validar a configuração da aplicação Mercado Pago e a reconciliação financeira.

No Railway, utilizando exclusivamente o Access Token de teste da aplicação:

```env
MERCADOPAGO_TEST_MODE=true
MERCADOPAGO_PIX_ENABLED=true
```

O fluxo de teste envia `payer.first_name=APRO` apenas no modo de teste,
conforme a documentação de testes do Mercado Pago para Pix via Orders API:
https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-test/pix

A ordem Pix automática usa `POST /v1/orders`, com `payment_method.id=pix`.
A resposta fornece `qr_code` e possivelmente `qr_code_base64`; quando a
imagem Base64 vem vazia, o servidor gera uma imagem QR **a partir do próprio
código retornado pela API**, sem inventar uma cobrança. O comprador consulta
o estado por sua sessão; a confirmação definitiva depende da order consultada
no webhook autenticado.

**Limitações:** a simulação do Mercado Pago não equivale a uma transferência
Pix real. A disponibilidade da funcionalidade na mesma aplicação cadastrada
para Checkout Pro precisa ser validada com credenciais de teste. A reconciliação
contra falhas externas, duplicidade concorrente e expiração ainda requer testes
de integração com PostgreSQL e cenários de produção.

## Segurança

O projeto inclui:

- JWT para sessões;
- Senhas protegidas com `scrypt`;
- Confirmação de e-mail;
- Limitação de tentativas em rotas sensíveis;
- Validação de upload e limite de tamanho;
- Validação de CNPJ, coordenadas e endereços;
- Controle de acesso administrativo;
- Cabeçalhos de segurança HTTP;
- Token para comunicação entre serviços;
- Identificador de correlação por requisição.

Nunca versione:

```text
.env
node_modules/
dist/
data/
uploads/
data-local-*/
```

## Licença e uso

Este projeto está identificado no `package.json` como privado e foi organizado
para uso acadêmico e de demonstração. Antes de uma operação comercial, revise
licenciamento, privacidade, retenção de dados, e-mails, armazenamento de
imagens e pagamentos reais.

## Campanhas da comunidade

No início do feed, usuários autenticados podem criar pedidos de materiais com
beneficiário, objetivo, meta em unidades, cidade, prazo e instruções de entrega.
Cada campanha solicita um tipo de material; para materiais diferentes, crie
campanhas separadas. Visitantes podem consultar as campanhas.

Outros usuários oferecem uma quantidade e uma mensagem privada de entrega.
O organizador consulta as contribuições, responde em particular para combinar
local e horário e confirma o recebimento. Somente itens efetivamente recebidos
entram na meta; ofertas pendentes são exibidas separadamente. O doador ou
organizador pode cancelar uma oferta pendente. Contribuições finalizadas não
podem ser alteradas, e repetir uma confirmação não soma a quantidade novamente.

O organizador pode encerrar a campanha e ainda confirmar entregas combinadas.
Prazo vencido, encerramento ou meta atingida impedem novas ofertas. Campanhas abertas aparecem junto às publicações do feed. O ícone de campanha no
cabeçalho abre a tela `/nova-campanha`, com cabeçalho e botão de voltar; não há painel fixo quando não existem
campanhas abertas. A busca do feed também pesquisa título, material, beneficiário
e cidade. Não há selo de verificação de
instituições nem integração de contribuições com anúncios nesta versão.

As tabelas `campaigns` e `campaign_contributions` são criadas automaticamente
no SQLite e pela migração `012_community_campaigns.sql` no PostgreSQL. Alterações
e eventos `campaign.*` são gravados na mesma transação da outbox. As notificações
de oferta, resposta e recebimento são locais e não dependem de RabbitMQ.
As mensagens de entrega e respostas não aparecem na listagem pública.

Validação: `npm run build` e `npm test`. O teste de integração PostgreSQL também
exercita campanhas quando `DATABASE_PROVIDER=postgres` e a conexão estão
configurados; esse teste precisa de um banco de testes isolado.

## Acordo de entrega e confirmação de recebimento

A reserva e a aceitação de uma oferta **não liberam mais o pagamento sozinhas**.
O fluxo de venda é:

1. O anunciante aceita a oferta e reserva o item.
2. Uma das pessoas propõe endereço (ou ponto de encontro), data e horário.
3. A outra pessoa aceita explicitamente os detalhes. Ninguém aceita a própria proposta.
4. O comprador pode iniciar o pagamento pelo valor e método da oferta aceita.
5. O anunciante pode informar saída para entrega após aprovação do pagamento.
6. Apenas o comprador confirma que recebeu e conferiu o item. Isso conclui
   a negociação, marca o anúncio como vendido e libera avaliações.

Doações e trocas usam o mesmo acordo e confirmação pelo destinatário, sem
pagamento. Em trocas, essa confirmação representa o aceite da troca pelo
destinatário; o sistema não oferece transporte nem custódia dos objetos.

Antes do pagamento, qualquer participante pode cancelar a proposta de entrega e
propor outra. Um novo local ou horário exige novo aceite. Durante pagamento em
processamento ou aprovado, ficam bloqueadas mudanças da entrega, preço, reserva,
edição e exclusão do anúncio. Pagamentos recusados ou estornados pelo provedor
liberam o bloqueio financeiro. O servidor também impede pagamentos duplicados
com novas chaves enquanto já há pagamento em andamento ou aprovado.

Os horários são enviados ao servidor em ISO UTC e exibidos no acompanhamento
em horário de Brasília. O agendamento deve ficar entre 30 minutos e 90 dias no
futuro; acordos com prazo vencido não liberam novos pagamentos. A confirmação
de recebimento pode registrar uma entrega efetivamente feita com atraso.

Um ponto de coleta é apenas um local proposto para encontro: é necessário
confirmar previamente sua disponibilidade. Não há integração para reservar
espaço, armazenar produtos ou contratar um entregador. O endereço é privado aos
participantes da negociação.

O QR Code antigo de coleta foi retirado: os dois participantes podiam acessá-lo,
e sua posse não comprovava recebimento. A migração `013_delivery_agreement.sql`
adiciona os autores/horários de proposta, aceite e recebimento e invalida agendas
legadas sem aceite registrado; os participantes devem combinar novamente.
Pagamentos antigos já aprovados não são cobrados outra vez: podem receber um
acordo de entrega para regularizar o recebimento. Links de checkout já emitidos
externamente antes dessa mudança não são revogados pela migração.

**Limite financeiro:** o pagamento pelo Mercado Pago não é uma reserva de valor
administrada pelo ReUsa+. Esta implementação não cria escrow nem reembolso
automático por não recebimento. Não confirme recebimento sem estar com o item;
resolva imprevistos pelo chat e, quando necessário, pelo suporte do provedor.
O app não promete garantia de entrega física.

Endpoints de logística:

```text
GET|POST /api/negotiations/:id/collection
POST     /api/collection-deliveries/:id/accept
POST     /api/collection-deliveries/:id/confirm
PATCH    /api/collection-deliveries/:id/status
```

Propostas, aceite e recebimento geram registros na outbox e notificações. A antiga
conclusão unilateral por `POST /api/posts/:id/complete` é bloqueada; o recebimento
confirmado pelo destinatário é a fonte da conclusão.


## Versão do Node e armazenamento Cloudflare R2

O projeto usa Node.js **22 LTS**, indicado em `package.json`, `.nvmrc` e
`Dockerfile`. No Railway/Railpack, `engines.node` seleciona a versão. Se o serviço
já tiver `RAILPACK_NODE_VERSION` definido como 20, ajuste para `22` nas variáveis
do Railway: uma configuração explícita do ambiente prevalece sobre o repositório.
Não use `NODE_NO_WARNINGS` para esconder avisos de compatibilidade.

O Cloudflare R2 não suporta a operação S3 `PutBucketPolicy`. O sistema identifica
endpoints `*.r2.cloudflarestorage.com`, usa região `auto` por padrão e verifica o
bucket sem tentar aplicar essa política. A mensagem de acesso verificado é
informativa; falhas reais de credenciais, permissões ou upload continuam sendo
erros. Outros provedores compatíveis com políticas S3 mantêm esse comportamento.

Para imagens no R2, configure nas variáveis do serviço:

- `S3_ENDPOINT`: endpoint S3 da conta R2.
- `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`: bucket e credenciais.
- `S3_PUBLIC_BASE_URL`: domínio público do bucket, como `https://pub-xxxx.r2.dev`
  ou domínio personalizado. Não use o endpoint autenticado de `S3_ENDPOINT`.
- `S3_REGION`: opcional; no R2, o padrão é `auto`.

O acesso público precisa estar habilitado na Cloudflare. O app não torna um
bucket R2 público automaticamente. Valide um upload e abra a imagem em uma
janela sem autenticação depois do deploy. Os testes locais verificam o SDK e um
servidor S3 de teste; não validam as permissões do bucket real sem acesso a ele.

### Cancelar o aceite de uma oferta

Na lista de interessados, o anunciante pode usar **Cancelar aceite** enquanto a
reserva aceita ainda não tiver proposta de entrega nem qualquer registro de
pagamento. O servidor valida a regra na mesma transação que desfaz a reserva.
Abrir a tela não conta como avanço; enviar uma proposta de entrega ou iniciar
um pagamento conta, mesmo que a etapa seja cancelada ou o pagamento falhe depois.

O cancelamento recusa a oferta selecionada, libera o anúncio e avisa o comprador.
As demais propostas pendentes permanecem disponíveis para escolha; só são
encerradas quando o recebimento conclui a negociação. Ofertas anteriormente
recusadas podem ser reconsideradas explicitamente enquanto o anúncio estiver
disponível, inclusive as recusadas automaticamente por versões antigas.

`POST /api/negotiations/:id/cancel-acceptance` permite essa ação somente ao
anunciante. A lista de interessados informa `canCancelAcceptance`; a interface
atualiza a permissão periodicamente e o servidor sempre verifica novamente ao
clicar. Cancelar o aceite e avançar para entrega simultaneamente não permite
que as duas operações sejam concluídas.

## Painel de negociações, lembretes e imprevistos

A tela /negociacoes, disponível pelo ícone no cabeçalho do feed e pelo perfil,
reúne as ofertas enviadas e recebidas, com busca e filtros por resposta, acordo,
pagamento, entrega/recebimento e encerradas. “Minha vez” destaca ações que
dependem do usuário. Os botões abrem o anúncio com seu acordo ou a conversa.
A lista é privada e atualiza a cada 15 segundos e quando a janela ganha foco.

Entregas aceitas e ativas geram lembretes para os dois participantes nas janelas
de até 24 horas e até 1 hora antes do encontro. O backend verifica a agenda ao
iniciar e a cada minuto. As notificações são internas ao app, não e-mail/SMS.
A tabela delivery_reminders impede repetição por usuário, horário e janela,
inclusive após reinício e em réplicas PostgreSQL. Se o servidor ficar desligado,
só as janelas ainda futuras são processadas ao voltar; não há envio retroativo
após o encontro. Entregas pendentes de aceite, canceladas ou concluídas não
recebem lembretes.

“Informar imprevisto” no acordo permite comunicar atraso, ausência, problema com
o local ou outra situação. O registro fica visível aos dois participantes e no
painel, e notifica a outra pessoa. Enviar a mesma mensagem duas vezes em cinco
minutos não duplica o registro. O aviso não altera o acordo ou libera mudanças
em pagamentos; os participantes devem combinar uma solução pelo chat.
A migração 014_negotiation_followup.sql cria o histórico e o controle de lembretes.

## Descoberta de itens e ferramentas da comunidade

- **Alertas (/alertas):** cada usuário pode salvar até 20 buscas por palavra,
  cidade/bairro e categoria. O backend verifica novos anúncios disponíveis a
  cada minuto e ao iniciar. As notificações são internas ao app; cada anúncio
  avisa apenas uma vez por alerta, inclusive após reinício. Itens antigos,
  próprios, indisponíveis ou de usuários bloqueados não geram avisos.
- **Proximidade:** o feed permite filtrar a cidade/bairro e, com autorização de
  geolocalização, escolher raio de 2 a 100 km. O resultado é aproximado e contém
  apenas anúncios cuja região foi cadastrada. A posição de consulta não é salva.
- **Transporte:** nova publicação e edição de transporte no detalhe permitem
  medidas, peso, desmontagem, escadas, veículo e cuidados com retirada. O dono
  pode alterar enquanto o anúncio estiver disponível. Coordenadas de anúncios
  são arredondadas a duas casas decimais antes de armazenamento e não são
  expostas na resposta pública. Informações exatas de entrega ficam no acordo.
- **Perguntas públicas:** interessados perguntam no detalhe do item; somente
  o anunciante responde. Perguntas e respostas são públicas; contatos e
  endereços devem ser combinados no chat. Há notificação de pergunta/resposta.
- **Pedidos (/pedidos):** uma pessoa publica uma necessidade individual com
  descrição, cidade e prazo. Outra pode oferecer um anúncio próprio disponível
  para doação. A oferta abre uma conversa e uma negociação com quem pediu,
  seguindo reserva, acordo e recebimento existentes; não conclui uma doação
  automaticamente. O backend marca o pedido como atendido após recebimento
  confirmado (verificação a cada minuto). Pedidos abertos podem ser encerrados
  pelo autor. Para metas de várias unidades, use campanhas.
- **Problemas de negociação:** participantes de negociação reservada ou
  concluída podem registrar não comparecimento, item diferente, não recebimento
  ou outro problema. A central administrativa de Denúncias recebe o relato com
  contexto de entrega/pagamento. Somente administradores alteram seu status.
  Registrar um problema não cancela acordos nem estorna valores automaticamente.

A migração 015_community_tools.sql prepara as tabelas e metadados no PostgreSQL;
o SQLite recebe as mesmas estruturas ao iniciar. A suíte inclui permissões,
concorrência de ofertas, localização aproximada e alertas sem duplicação.
