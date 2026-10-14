# Fluxo tela, API e banco

Este arquivo mostra o caminho dos dados no ReUsa+.

## Visao geral

```text
Navegador
  |
  | React renderiza as telas
  v
src/routes.jsx
  |
  | chama estado global ou API
  v
src/state/store.js
  |
  | chama funcoes do cliente HTTP
  v
src/services/api.js
  |
  | fetch('/api/...')
  v
backend.js
  |
  | regras, autenticacao, uploads e rotas
  v
storage/postgres-api.js ou rotas internas do backend.js
  |
  | consultas e transacoes
  v
storage/postgres-repository.js
  |
  | pacote pg
  v
PostgreSQL
```

Se PostgreSQL nao estiver configurado em desenvolvimento, o backend usa SQL.js local.

## Por que a tela nao conecta direto no banco?

Porque a tela roda no navegador do usuario. Se ela conectasse direto, seria necessario expor usuario, senha e endereco do banco para qualquer pessoa que abrisse o site.

Por isso a arquitetura correta e:

```text
Frontend publico -> API protegida -> Banco privado
```

## Arquivos que provam esse fluxo

| Papel | Arquivo | O que observar |
| --- | --- | --- |
| Cliente HTTP do frontend | `src/services/api.js` | `API_BASE = '/api'` e uso de `fetch` |
| Servidor da API | `backend.js` | `const app = express()` e varias rotas `/api/...` |
| Proxy de desenvolvimento | `vite.config.js` | `/api` vai para `http://localhost:3000` |
| Configuracao do banco | `storage/database-config.js` | le `DATABASE_PROVIDER`, `DATABASE_URL` e `POSTGRES_URL` |
| Conexao PostgreSQL | `storage/postgres-repository.js` | usa `Pool` do pacote `pg` |
| Tabelas PostgreSQL | `migrations/` | scripts SQL do schema |

## Como explicar em apresentacao

Pode falar assim:

> As telas do meu sistema ficam no frontend React. Elas nao acessam o banco diretamente. Elas chamam uma API usando `fetch` para rotas que comecam com `/api`. Essa API fica no backend Node/Express, no arquivo `backend.js`. O backend e quem autentica o usuario, executa as regras do sistema e acessa o banco pelo repositorio em `storage/postgres-repository.js`.

## Exemplo: criar publicacao

```text
CreatePostScreen
  -> useAppStore.createPost()
  -> api.createPost()
  -> POST /api/posts
  -> backend valida usuario e recebe imagem
  -> backend salva dados no banco
  -> backend responde com o post criado
  -> frontend atualiza a lista na tela
```

## Exemplo: mensagens

```text
MessagesScreen ou ChatScreen
  -> useAppStore.loadThreads() ou api.thread(...)
  -> GET /api/messages/threads
  -> backend busca conversas do usuario
  -> backend retorna JSON
  -> React exibe as conversas
```

## Exemplo: mapa

```text
MapScreen
  -> loadCollectionPoints()
  -> api.collectionPoints()
  -> GET /api/collection-points
  -> backend busca pontos de coleta
  -> React renderiza os pontos no mapa com Leaflet
```

