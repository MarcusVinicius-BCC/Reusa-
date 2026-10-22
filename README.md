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
- [Pagamentos simulados](#pagamentos-simulados)
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
- Pagamento local simulado;
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
├── test/                       # Testes automatizados
├── data/                       # SQLite e uploads locais
└── uploads/                    # Diretório de uploads servido localmente
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

## Pagamentos simulados

O pagamento atual é um **provedor local simulado**. Ele não movimenta dinheiro
real e não exige conta em gateway externo.

```text
GET  /api/negotiations/:id/payment
POST /api/negotiations/:id/payment
```

O fluxo usa valores em centavos, chave de idempotência e métodos `pix`,
`card` ou `boleto`. A referência gerada possui formato `sim_...`.

Esse mecanismo existe para testar o ciclo de negociação. Para pagamentos reais,
seria necessário substituir o adaptador por um provedor regulado e implementar
confirmação por webhook antes de liberar qualquer item ou valor.

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

## Docker

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
