# ReUsa+

> Plataforma web de economia circular para doar, trocar, reaproveitar itens e encontrar pontos de coleta na comunidade.

![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=20232a)
![License](https://img.shields.io/badge/uso-acad%C3%AAmico-0b5b3a)

O ReUsa+ reúne anúncios, conversas, favoritos, perfil, inspirações de reaproveitamento, administração e um mapa colaborativo de pontos de coleta. O frontend React é compilado pelo Vite e servido pelo mesmo backend Express, simplificando a execução e o deploy.

## Índice

- [Tecnologias](#tecnologias)
- [Pré-requisitos](#pré-requisitos)
- [Como executar localmente](#como-executar-localmente)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Comandos disponíveis](#comandos-disponíveis)
- [Banco de dados e serviços opcionais](#banco-de-dados-e-serviços-opcionais)
- [Testes](#testes)
- [Deploy na Railway](#deploy-na-railway)
- [Estrutura do projeto](#estrutura-do-projeto)

## Tecnologias

| Camada | Tecnologias |
| --- | --- |
| Interface | React 18, React Router, Zustand, Vite |
| API | Node.js, Express, JWT, Multer |
| Banco local | SQL.js (não exige instalação adicional) |
| Produção | PostgreSQL, Railway |
| Mapa | Leaflet e OpenStreetMap |
| Opcional | Redis, RabbitMQ e armazenamento compatível com S3 |

## Pré-requisitos

Para executar a versão básica, instale apenas:

- [Node.js](https://nodejs.org/) **20.x, 22.x ou 24.x**;
- npm (instalado junto com o Node.js);
- Git.

Docker Desktop é opcional e só é necessário para subir o ambiente completo com PostgreSQL, Redis e RabbitMQ.

## Como executar localmente

```bash
# 1. Clone o repositório
git clone <URL_DO_SEU_REPOSITORIO>
cd Reusa-

# 2. Instale as dependências
npm install

# 3. Gere o frontend de produção
npm run build

# 4. Inicie a aplicação
npm start
```

Abra [http://localhost:3000](http://localhost:3000) no navegador.

A primeira execução cria os dados locais automaticamente na pasta `data/`. A aplicação funciona sem PostgreSQL, Redis, RabbitMQ ou chave de mapa.

### Desenvolvimento com atualização da interface

Em dois terminais, execute:

```bash
# Terminal 1: API e backend com reinício automático
npm run dev
```

```bash
# Terminal 2: interface Vite com atualização automática
npm run dev:ui
```

Abra [http://localhost:5173](http://localhost:5173). O Vite encaminha as chamadas `/api` para o backend em `http://localhost:3000`.

## Variáveis de ambiente

Copie o arquivo de exemplo antes de configurar integrações opcionais:

```bash
# Windows PowerShell
Copy-Item .env.example .env

# macOS/Linux
cp .env.example .env
```

| Variável | Obrigatória? | Finalidade |
| --- | --- | --- |
| `JWT_SECRET` | Produção: sim | Assina as sessões de usuário. Use um valor longo e aleatório. |
| `DATA_DIR` | Não | Diretório de dados locais e uploads. O padrão é `./data`. |
| `DATABASE_PROVIDER` | Não | Use `postgres` para habilitar PostgreSQL. Sem ela, a aplicação usa SQL.js local. |
| `DATABASE_URL` ou `POSTGRES_URL` | Com PostgreSQL | String de conexão do PostgreSQL. |
| `APP_BASE_URL` | Não | URL pública da aplicação, sem barra no final. |
| `GOOGLE_CLIENT_ID` | Não | Client ID do login Google. |
| `GOOGLE_CLIENT_SECRET` | Não | Client Secret do login Google. Nunca o envie ao Git. |
| `GOOGLE_REDIRECT_URI` | Com Google | Callback OAuth, por exemplo `https://dominio/api/auth/google/callback`. |
| `ADMIN_EMAIL` | Não | E-mail que receberá perfil de administrador automaticamente. |
| `REDIS_URL`, `AMQP_URL`, `EVENT_EXCHANGE` | Não | Integrações distribuídas opcionais. |
| Variáveis `S3_*` | Não | Persistência de imagens em um serviço compatível com S3. |

> Nunca versione o arquivo `.env`, bancos locais, imagens enviadas por usuários ou a pasta `dist/`.

## Comandos disponíveis

| Comando | Descrição |
| --- | --- |
| `npm start` | Inicia o servidor Express em produção. |
| `npm run dev` | Inicia o backend com reinício automático. |
| `npm run dev:ui` | Inicia o Vite para desenvolvimento da interface. |
| `npm run build` | Compila o frontend para `dist/`. |
| `npm test` | Executa os testes automatizados. |
| `npm run migrate:postgres:schema` | Executa as migrações PostgreSQL. |
| `npm run migrate:postgres` | Migra dados do banco local para PostgreSQL. |
| `npm run verify:postgres` | Verifica a migração PostgreSQL. |

## Banco de dados e serviços opcionais

### PostgreSQL

Para usar PostgreSQL localmente, defina no `.env`:

```env
DATABASE_PROVIDER=postgres
POSTGRES_URL=postgres://usuario:senha@localhost:5432/reusa
JWT_SECRET=troque-por-um-segredo-longo-e-aleatorio
```

As migrações também são aplicadas automaticamente quando o backend inicia com PostgreSQL configurado.

### Ambiente completo com Docker

O `docker-compose.yml` sobe PostgreSQL, Redis, RabbitMQ, API principal e os serviços de notificações e impacto.

```bash
docker compose up --build
```

Depois, abra [http://localhost:3000](http://localhost:3000). Para encerrar os contêineres, use `docker compose down`.

## Testes

Execute antes de criar um commit ou enviar o projeto:

```bash
npm test
npm run build
```

Os testes usam uma pasta temporária e não alteram o banco local de desenvolvimento.

## Deploy na Railway

1. Crie um projeto na [Railway](https://railway.app/) e selecione **Deploy from GitHub Repo**.
2. Escolha este repositório. O `railway.toml` já define build, comando de início e healthcheck.
3. Adicione um serviço PostgreSQL.
4. Em **Variables** do serviço da aplicação, configure:

   ```env
   DATABASE_PROVIDER=postgres
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   JWT_SECRET=um-segredo-longo-e-aleatorio
   ```

   Ajuste `Postgres` caso o serviço tenha outro nome.

5. Gere um domínio público em **Networking**.
6. Confirme o healthcheck em `https://seu-dominio/api/health`.

### Login com Google em produção

No Google Cloud, cadastre esta URL de redirecionamento no cliente OAuth Web:

```text
https://seu-dominio/api/auth/google/callback
```

Depois configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` e `APP_BASE_URL` nas variáveis da Railway.

Se não usar S3, adicione um **Volume** na Railway montado em `/data` e defina `DATA_DIR=/data` para preservar uploads locais entre deploys.

## Estrutura do projeto

```text
src/            # Interface React, rotas, estado e estilos
storage/        # Persistência local/PostgreSQL e regras de localização
distributed/    # Integrações Redis, RabbitMQ, S3 e observabilidade
services/       # Serviços de notificações e impacto
migrations/     # Esquema e índices PostgreSQL
scripts/        # Migração e verificação do banco
test/           # Testes automatizados
backend.js      # API Express e servidor da aplicação
```

## Entrega acadêmica

Para entregar o projeto em outro repositório, envie os arquivos versionados e execute `npm install`, `npm run build` e `npm start` após o clone. Não inclua `node_modules/`, `.env`, `dist/`, `data/`, `uploads/` ou pastas `data-local-*`.
