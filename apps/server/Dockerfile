# ClawLive 后端 - 需以仓库根目录为构建上下文（Railway Root Directory 设为空）
FROM node:20-alpine

# Prisma 需要 OpenSSL
RUN apk add --no-cache openssl

WORKDIR /app

COPY . .

RUN npm install -g pnpm

RUN pnpm install --no-frozen-lockfile

RUN cd apps/server && pnpm prisma generate

RUN pnpm --filter @clawlive/privacy-filter build
RUN pnpm --filter @clawlive/server build

WORKDIR /app/apps/server

ENV NODE_ENV=production
EXPOSE 3001

# 启动时按 schema 自动补齐缺失表；抑制 Prisma 更新提示（避免 Railway 误判为 error）
ENV PRISMA_HIDE_UPDATE_MESSAGE=1
CMD ["sh", "-c", "npx prisma db push --skip-generate && exec node dist/index.js"]
