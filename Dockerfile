FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

RUN npm run build
RUN npm prune --omit=dev \
  && mkdir -p /app/data /app/uploads \
  && chown -R node:node /app

ENV PORT=3000
ENV DATA_DIR=/app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "backend.js"]
