FROM node:20-alpine

WORKDIR /app
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/chatroom?schema=public
RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci && npx prisma generate

ENV NODE_ENV=production

COPY src ./src

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/ready || exit 1

CMD ["node", "src/index.js"]
