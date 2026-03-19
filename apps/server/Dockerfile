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

# 迁移放后台，先启动服务以通过健康检查（Railway 30s 超时）
CMD ["sh", "-c", "(npx prisma migrate deploy || true) & exec node dist/index.js"]
