FROM mcr.microsoft.com/playwright:v1.58.2-jammy

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=6006
ENV SCRAPING_HEADLESS=true

COPY package*.json ./
COPY prisma ./prisma

RUN npm ci --omit=dev --ignore-scripts

# DATABASE_URL dummy: generate solo necesita provider, no conexion real.
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" \
    npx prisma@6.4.1 generate --schema=./prisma/schema.prisma

COPY src ./src
COPY public ./public

EXPOSE 6006

CMD ["node", "src/infra/server.js"]
