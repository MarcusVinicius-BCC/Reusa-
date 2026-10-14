# Entenda o sistema ReUsa+

Este documento e um mapa simples para explicar como o projeto esta organizado e como as telas se comunicam com o banco de dados.

## Resposta curta para o professor

O sistema nao conecta as telas diretamente ao banco de dados.

O fluxo e:

```text
Tela React no navegador
  -> chama funcoes em src/services/api.js
  -> faz requisicoes HTTP para /api
  -> backend Express em backend.js recebe a requisicao
  -> backend acessa o banco por storage/postgres-repository.js ou pelo banco local SQL.js
  -> backend devolve JSON para a tela
```

Ou seja: existe uma API entre as telas e o banco. A tela nunca recebe a senha nem a string de conexao do banco.

## Mapa das pastas principais

```text
src/
  Interface do usuario. Aqui ficam as telas, rotas, estado global, estilos e chamada para a API.

src/services/
  Cliente HTTP do frontend. O arquivo api.js concentra as chamadas para /api.

src/state/
  Estado global da aplicacao com Zustand. Ele chama a API e guarda dados como sessao, posts, mensagens e notificacoes.

src/data/
  Dados de fallback usados quando nao ha resposta do backend ou para estado inicial.

src/assets/
  Imagens e arquivos visuais usados na interface.

storage/
  Camada de persistencia. Aqui fica a conexao com PostgreSQL, repositorios e regras ligadas a dados.

migrations/
  Scripts SQL que criam ou alteram as tabelas do PostgreSQL.

distributed/
  Integracoes opcionais de infraestrutura: Redis, RabbitMQ, S3 e observabilidade.

services/
  Servicos separados/opcionais, como notificacoes e impacto.

scripts/
  Scripts de manutencao, migracao e verificacao do banco.

test/
  Testes automatizados.

backend.js
  Servidor principal Node.js/Express. Ele registra as rotas /api, autentica usuarios, recebe uploads e conversa com o banco.

vite.config.js
  Configuracao do Vite. Em desenvolvimento, encaminha chamadas /api para o backend em localhost:3000.

dist/
  Frontend compilado pelo Vite. E gerado por npm run build.

data/ e data-local-*/
  Bancos e dados locais de desenvolvimento. Nao sao a parte principal do codigo.

uploads/
  Imagens enviadas por usuarios quando nao ha armazenamento S3 configurado.
```

## Onde ficam as telas?

As telas ficam principalmente em `src/routes.jsx`.

Exemplos:

| Tela/fluxo | Funcao no arquivo |
| --- | --- |
| Splash/inicio | `SplashScreen` |
| Login | `LoginScreen` |
| Cadastro | `RegisterScreen` |
| Feed | `FeedScreen` |
| Detalhe do anuncio | `PostDetailScreen` |
| Criar publicacao | `CreatePostScreen` |
| Mensagens | `MessagesScreen` e `ChatScreen` |
| Perfil | `ProfileScreen` |
| Mapa | `MapScreen` |
| Configuracoes | `SettingsScreen` |
| Administracao | `AdminScreen` |

O ponto de entrada da interface e `src/main.jsx`. Ele carrega `src/App.jsx`, que encaminha para `src/routes.jsx`.

## Onde as telas chamam a API?

As telas usam duas formas principais:

1. Chamam a store global em `src/state/store.js`.
2. Chamam diretamente algumas funcoes do objeto `api` em `src/services/api.js`.

O arquivo mais importante para entender isso e `src/services/api.js`.

Ele define:

```js
const API_BASE = '/api';
```

Depois faz chamadas como:

```js
fetch(`${API_BASE}${path}`, ...)
```

Entao, quando a tela pede o feed, login, perfil ou mensagens, ela chama uma rota HTTP como:

```text
/api/feed
/api/auth/login
/api/profile
/api/messages/threads
```

## Onde fica a API?

A API principal fica em `backend.js`.

Esse arquivo:

- cria o servidor Express;
- registra rotas `/api/...`;
- valida login com JWT;
- recebe upload de imagens;
- decide se usa PostgreSQL ou SQL.js local;
- serve o frontend compilado em `dist/`.

Quando PostgreSQL esta habilitado, o backend tambem registra varias rotas em `storage/postgres-api.js`.

## Onde fica a conexao com o banco?

A conexao com PostgreSQL fica em:

```text
storage/database-config.js
storage/postgres-repository.js
```

`storage/database-config.js` le as variaveis:

```text
DATABASE_PROVIDER
DATABASE_URL
POSTGRES_URL
```

`storage/postgres-repository.js` usa o pacote `pg` do Node.js e cria um pool de conexoes:

```js
new Pool({ connectionString })
```

Isso confirma que quem conecta no banco e o backend, nao o navegador.

## Como o banco e escolhido?

O sistema tem dois modos:

| Modo | Quando usa | Onde fica |
| --- | --- | --- |
| PostgreSQL | Quando `DATABASE_PROVIDER=postgres` e existe `DATABASE_URL` ou `POSTGRES_URL` | Banco externo, Railway ou local |
| SQL.js local | Quando PostgreSQL nao esta configurado | Arquivo local dentro de `data/` |

Em producao, o sistema exige PostgreSQL.

## Explicacao em uma frase

O ReUsa+ e uma aplicacao React com backend Node/Express: as telas fazem chamadas HTTP para a API em `/api`, e somente a API acessa o banco de dados.

## Caminho de um exemplo real: login

```text
Usuario preenche login na tela
  -> LoginScreen chama a funcao login da store
  -> src/state/store.js chama api.login(...)
  -> src/services/api.js faz POST /api/auth/login
  -> backend.js ou storage/postgres-api.js valida o usuario
  -> backend consulta o banco
  -> backend devolve token e dados do usuario
  -> frontend salva o token no localStorage
```

## Caminho de outro exemplo: feed

```text
Usuario abre o feed
  -> FeedScreen carrega os posts
  -> store chama api.feed()
  -> api.js faz GET /api/feed
  -> backend consulta posts no banco
  -> backend devolve JSON com os posts
  -> React renderiza os cards na tela
```

## O que responder se perguntarem "onde esta cada camada?"

| Camada | Onde esta |
| --- | --- |
| Telas | `src/routes.jsx` |
| Entrada do React | `src/main.jsx` |
| Estado global | `src/state/store.js` |
| Chamadas HTTP do frontend | `src/services/api.js` |
| API/backend | `backend.js` |
| Rotas PostgreSQL | `storage/postgres-api.js` |
| Repositorio PostgreSQL | `storage/postgres-repository.js` |
| Configuracao do banco | `storage/database-config.js` |
| Estrutura do banco | `migrations/` |
| Testes | `test/` |

