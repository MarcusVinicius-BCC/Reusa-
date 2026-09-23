# REUSA+

Aplicacao web para reutilizacao e doacao de itens. O backend Express serve a API e, depois do build, os arquivos do frontend React/Vite.

## Deploy na Railway

1. Crie um projeto na Railway e selecione **Deploy from GitHub Repo**.
2. Escolha `MarcusVinicius-BCC/Reusa-`. O arquivo `railway.toml` configura o build, o start e o healthcheck.
3. Adicione um servico **PostgreSQL** ao projeto. No servico da aplicacao, crie:
   - `DATABASE_PROVIDER=postgres`
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}` (ajuste `Postgres` para o nome do servico, se necessario)
   - `JWT_SECRET` com um valor longo, aleatorio e permanente
4. Gere um dominio publico em **Networking**. O app responde em `https://seu-dominio/api/health`.

As migracoes do PostgreSQL sao aplicadas automaticamente no boot do backend. O `DATABASE_URL` e o nome padrao fornecido pela Railway; localmente tambem e possivel usar `POSTGRES_URL`.

### Variaveis opcionais

- `APP_BASE_URL`: URL publica sem barra final.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `GOOGLE_REDIRECT_URI`: login com Google.
- `REDIS_URL`: cache compartilhado.
- `AMQP_URL` e `EVENT_EXCHANGE`: eventos para os servicos distribuidos.
- `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` e `S3_PUBLIC_BASE_URL`: armazenamento persistente de imagens. Sem S3, as imagens usam o volume local.

Para login com Google, cadastre no Google Cloud:

```text
https://seu-dominio/api/auth/google/callback
```

Se usar uploads sem S3, adicione um **Volume** Railway montado em `/data` e defina `DATA_DIR=/data`.

## Desenvolvimento local

```bash
npm install
npm run build
npm start
```

O servidor usa `PORT` (padrao `3000`). Para usar PostgreSQL local, copie `.env.example`, defina `DATABASE_PROVIDER=postgres` e `POSTGRES_URL` ou `DATABASE_URL`. Para o ambiente completo com PostgreSQL, RabbitMQ e Redis:

```bash
docker compose up --build
```

## Validacao

```bash
npm test
npm run build
```

Arquivos `.env`, bancos locais, uploads e o bundle `dist/` nao devem ser enviados ao GitHub.
