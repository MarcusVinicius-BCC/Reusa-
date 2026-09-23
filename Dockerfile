FROM node:20-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# The Vite build is served by the core service in production.
RUN npm run build

EXPOSE 3000
CMD ["node", "backend.js"]
