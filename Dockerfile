FROM node:20-slim AS base
WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY prisma ./prisma

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# DATABASE_URL dummy: generate solo necesita el provider, NO se conecta a la BD
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" \
    npx prisma@6.4.1 generate --schema=./prisma/schema.prisma

COPY src ./src

EXPOSE 6006
CMD ["node", "src/infra/server.js"]
