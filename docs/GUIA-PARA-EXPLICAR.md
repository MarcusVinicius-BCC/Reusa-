# Guia para explicar o projeto

Use este guia como cola para responder perguntas sobre a estrutura do ReUsa+.

## Pergunta: onde ficam as telas?

As telas ficam no frontend, principalmente em:

```text
src/routes.jsx
```

Esse arquivo tem componentes como `LoginScreen`, `FeedScreen`, `CreatePostScreen`, `ProfileScreen`, `MapScreen` e `AdminScreen`.

## Pergunta: as telas conectam direto no banco?

Nao.

As telas chamam a API pelo arquivo:

```text
src/services/api.js
```

Esse arquivo usa `fetch('/api/...')`. Quem acessa o banco e o backend.

## Pergunta: onde fica o backend?

O backend principal fica em:

```text
backend.js
```

Ele usa Express para criar as rotas da API.

## Pergunta: onde fica a conexao com PostgreSQL?

Fica em:

```text
storage/postgres-repository.js
```

As variaveis de configuracao ficam em:

```text
storage/database-config.js
```

## Pergunta: onde fica o schema do banco?

Fica na pasta:

```text
migrations/
```

Ali estao os arquivos SQL que criam e alteram as tabelas.

## Pergunta: qual e a arquitetura?

Pode responder:

> Meu sistema tem frontend em React, backend em Node.js/Express e banco PostgreSQL em producao. O frontend nao acessa o banco diretamente. Ele chama rotas `/api`, e o backend acessa o banco usando uma camada de repositorio.

## Pergunta: como roda em desenvolvimento?

Tem dois processos possiveis:

```text
npm run dev
```

Inicia o backend em `localhost:3000`.

```text
npm run dev:ui
```

Inicia o frontend Vite em `localhost:5173`.

O Vite encaminha `/api` para o backend, conforme `vite.config.js`.

## Pergunta: o que e cada pasta?

| Pasta/arquivo | Explicacao simples |
| --- | --- |
| `src/` | Frontend React |
| `src/routes.jsx` | Telas e navegacao |
| `src/services/api.js` | Chamadas do frontend para a API |
| `src/state/store.js` | Estado global e acoes da interface |
| `backend.js` | API Node/Express |
| `storage/` | Persistencia e banco |
| `migrations/` | SQL do PostgreSQL |
| `distributed/` | Redis, RabbitMQ, S3 e metricas |
| `services/` | Servicos separados de notificacao e impacto |
| `scripts/` | Scripts de migracao/verificacao |
| `test/` | Testes |
| `uploads/` | Imagens enviadas localmente |
| `data/` | Banco local/dados de desenvolvimento |

## Frase final boa para apresentar

> A separacao principal e: `src` e a interface, `backend.js` e a API, `storage` e a camada de banco, e `migrations` define a estrutura do banco. O navegador nunca fala direto com o banco; ele fala com a API.

