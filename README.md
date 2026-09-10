# REUSA+

Aplicacao web para reutilizacao e doacao de itens. O backend Express serve a API e, depois do build, os arquivos do frontend React/Vite.

## Publicar na Railway

1. Crie um projeto na Railway e escolha **Deploy from GitHub Repo**.
2. Selecione `MarcusVinicius-BCC/Reusa-`. A Railway usara `railway.toml` automaticamente:
   - build: `npm run build`
   - inicio: `npm start`
   - healthcheck: `/api/health`
3. Em **Variables**, crie `JWT_SECRET` com um valor longo e aleatorio. Ela e obrigatoria em producao: sem ela, o app usa uma chave temporaria e encerra todas as sessoes ao reiniciar. Nao envie esse valor para o GitHub.
4. Em **Volumes**, adicione um Volume ao servico e use o ponto de montagem `/data`.
   O app detecta o caminho do Volume e guarda nele o banco SQLite e os uploads, preservando-os entre deploys.
5. Em **Networking**, gere um dominio publico. O app deve responder em `https://seu-dominio/api/health` com `{ "ok": true }`.

## Login com Google

O ReUsa+ suporta login e criação de conta com Google. Crie, no Google Cloud, uma credencial OAuth 2.0 do tipo **Aplicação da Web** e cadastre exatamente a URL de retorno:

- Local: `http://localhost:3000/api/auth/google/callback`
- Produção: `https://seu-dominio/api/auth/google/callback`

Configure na Railway as variáveis `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` e `APP_BASE_URL`. As contas do Google são vinculadas ao banco persistente da aplicação pelo identificador único da conta Google, permitindo o acesso da mesma pessoa em qualquer dispositivo.

## Desenvolvimento local

```bash
npm install
npm run build
npm start
```

O servidor usa a porta definida em `PORT` (ou `3000` localmente). Os dados locais ficam em `data/` e sao ignorados pelo Git.
