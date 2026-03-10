FROM node:20-slim AS base
WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY prisma ./prisma

COPY services/ms-scraping/package*.json ./
RUN npm ci --omit=dev --ignore-scripts

RUN npx prisma@6.4.1 generate --schema=./prisma/schema.prisma

COPY services/ms-scraping/src ./src

EXPOSE 6006
CMD ["node", "src/infra/server.js"]
