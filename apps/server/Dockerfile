# ClawLive 后端 - 需以仓库根目录为构建上下文（Railway Root Directory 设为空）
FROM node:20-alpine

# Prisma 需要 OpenSSL
RUN apk add --no-cache openssl

WORKDIR /app

COPY . .

RUN npm install -g pnpm

RUN pnpm install --no-frozen-lockfile

RUN cd apps/server && pnpm prisma generate

RUN pnpm --filter @clawlive/server build

WORKDIR /app/apps/server

ENV NODE_ENV=production
EXPOSE 3001

# 迁移失败也尝试启动服务（便于排查；Railway 需配置 DATABASE_URL）
CMD ["sh", "-c", "npx prisma migrate deploy || echo 'Migration failed'; node dist/index.js"]
