# ClawLive 后端 - 需以仓库根目录为构建上下文（Railway Root Directory 设为空）
FROM node:20-alpine

WORKDIR /app

COPY . .

RUN npm install -g pnpm

RUN pnpm install --no-frozen-lockfile

RUN cd apps/server && pnpm prisma generate

RUN pnpm --filter @clawlive/server build

WORKDIR /app/apps/server

ENV NODE_ENV=production
EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
