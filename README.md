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
| Backend | Node.js 20+, Express |
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

- [Node.js](https://nodejs.org/) 20, 22 ou 24;
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

## Pagamentos com Mercado Pago (Checkout Pro via Orders API)

O ReUsa+ usa **Checkout Pro via Orders API** (`POST /v1/orders`), que devolve
`checkout_url`. O frontend já redireciona o comprador ao Mercado Pago, sem receber
ou armazenar dados de cartão. O sistema só confirma um pagamento após o webhook
assinado e uma consulta à order na API do Mercado Pago, conferindo referência,
moeda, valor esperado e valor efetivamente pago.

**Modelo existente:** o anunciante conecta sua própria conta Mercado Pago
em **Configurações > Ofertas e pagamentos > Conectar conta**. O backend usa
o token autorizado desse vendedor para criar as orders. Esta integração
**não** implementa divisão automática de comissões nem custódia dos valores
pela plataforma; valide a elegibilidade da aplicação para OAuth/marketplace
no painel antes de habilitar vendas reais.

### Apresentação acadêmica: pagamentos em modo de demonstração

Para apresentar o fluxo completo sem CNPJ, conta de vendedor real ou OAuth,
utilize **exclusivamente** o Access Token de **TESTE** da aplicação e configure
`MERCADOPAGO_TEST_MODE=true` no serviço backend do Railway.

- O modo de teste usa a conta sandbox da aplicação em todas as orders; não faz
  repasses a contas individuais de vendedores e não requer OAuth.
- O perfil mostra **Modo de demonstração — pagamentos de teste**, em vez de
  induzir vendedores a conectar contas reais.
- O Checkout Pro pode ser demonstrado com cartões de **teste**; a aprovação
  vem do provedor sandbox e o ReUsa+ atualiza o estado via webhook.
- O Pix de teste pode mostrar QR Code, mas **não deve ser pago por aplicativo
  bancário real**. Não prometa conclusão da transação Pix no sandbox.
- Em nenhuma hipótese use credenciais de produção para esta apresentação.
  `MERCADOPAGO_TEST_MODE` não transforma um token de produção em sandbox.
- Ao encerrar a apresentação, desligue o serviço público no Railway ou
  desabilite os fluxos de pagamento. Não basta mudar a variável para false:
  isso ativaria o caminho de produção que ainda depende de OAuth de vendedores.

A interface usa a indicação de modo teste enviada pelo backend autenticado,
e a indicação é exibida somente quando as credenciais estão configuradas e
`MERCADOPAGO_TEST_MODE=true`. A remoção da demonstração não afeta anúncios,
negociações e o restante da plataforma.

### Configuração no Railway / backend

Configure as variáveis (nunca envie tokens ao GitHub):

```text
MERCADOPAGO_ACCESS_TOKEN=seu-access-token-da-aplicacao
MERCADOPAGO_CLIENT_ID=seu-client-id
MERCADOPAGO_CLIENT_SECRET=seu-client-secret
MERCADOPAGO_WEBHOOK_SECRET=assinatura-secreta-do-webhook
APP_BASE_URL=https://seu-dominio-publico.example
MERCADOPAGO_REDIRECT_URI=https://seu-dominio-publico.example/api/payments/mercadopago/callback
```

O painel Mercado Pago deve autorizar a URL exata de redirecionamento OAuth:
`https://seu-dominio-publico.example/api/payments/mercadopago/callback`.

Em **Configuração de Webhooks**, selecione o ambiente correto (Teste ou
Produção), a URL pública HTTPS
`https://seu-dominio-publico.example/api/payments/mercadopago/webhook`
e o evento **Order (Mercado Pago)**, não somente o evento Payment.
Use a assinatura secreta daquele ambiente na variável
`MERCADOPAGO_WEBHOOK_SECRET`. A verificação da assinatura inclui
o parâmetro `data.id` e o header `x-request-id`.

### Fluxo existente

1. Comprador propõe um valor em centavos, e o vendedor aceita e reserva o item.
2. Backend verifica a proposta aceita e cria uma order no token do vendedor,
   com `external_reference` apontando para o pagamento no ReUsa+.
3. Backend salva `provider_reference` (ID da order) e `checkout_url`.
4. Comprador abre o Checkout Pro. Retorno no navegador **não é confirmação**.
5. Webhook `order` assinado aciona `GET /v1/orders/{id}`, e o backend
   só registra sucesso quando a order e o valor pago são validados.

Rotas:

```text
GET  /api/negotiations/:id/payment
POST /api/negotiations/:id/payment
POST /api/payments/mercadopago/webhook
GET  /api/payments/mercadopago/connect
GET  /api/payments/mercadopago/callback
```

**Antes de produção:** executar `npm test` e `npm run build`,
realizar testes reais no ambiente de teste do Mercado Pago, revisar
concorrência e recuperação de webhooks que chegam antes de a order
ser persistida, rotação/renovação de tokens OAuth e tratamento de
estornos parciais. Não faça merge nem deploy antes dessa validação.

Documentação oficial:
- https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-orders/create-order
- https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-orders/notifications
- https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-orders/web-integration/configure-back-urls

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
