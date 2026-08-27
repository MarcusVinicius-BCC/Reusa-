# REUSA+

Aplicacao web para reutilizacao e doacao de itens. O backend Express serve a API e, depois do build, os arquivos do frontend React/Vite.

## Publicar na Railway

1. Crie um projeto na Railway e escolha **Deploy from GitHub Repo**.
2. Selecione `MarcusVinicius-BCC/Reusa-`. A Railway usara `railway.toml` automaticamente:
   - build: `npm run build`
   - inicio: `npm start`
   - healthcheck: `/api/health`
3. Em **Variables**, crie `JWT_SECRET` com um valor longo e aleatorio. Nao envie esse valor para o GitHub.
4. Em **Volumes**, adicione um Volume ao servico e use o ponto de montagem `/data`.
   O app detecta o caminho do Volume e guarda nele o banco SQLite e os uploads, preservando-os entre deploys.
5. Em **Networking**, gere um dominio publico. O app deve responder em `https://seu-dominio/api/health` com `{ "ok": true }`.

## Desenvolvimento local

```bash
npm install
npm run build
npm start
```

O servidor usa a porta definida em `PORT` (ou `3000` localmente). Os dados locais ficam em `data/` e sao ignorados pelo Git.
