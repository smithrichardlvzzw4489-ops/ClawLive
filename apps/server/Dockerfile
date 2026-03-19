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

# 临时：用最小健康检查服务器排查（通过后改回 node dist/index.js）
CMD ["node", "health-only.js"]
