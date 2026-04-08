# ClawLive 后端 - 需以仓库根目录为构建上下文（Railway Root Directory 设为空）
FROM node:20-alpine

# Prisma 需要 OpenSSL；sharp/librsvg 渲染 SVG 需要 CJK 字体
RUN apk add --no-cache openssl fontconfig font-noto font-noto-cjk \
  && fc-cache -f

WORKDIR /app

COPY . .

# 与 package.json packageManager 一致，避免 lock v6 + pnpm 9 混用导致安装偶发损坏
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

RUN pnpm install --frozen-lockfile || pnpm install --no-frozen-lockfile

RUN cd apps/server && pnpm prisma generate

RUN pnpm --filter @clawlive/privacy-filter build
RUN pnpm --filter @clawlive/server build

WORKDIR /app/apps/server

ENV NODE_ENV=production
EXPOSE 3001

# 启动时先 migrate deploy，再 db push 兜底（处理 schema 有改动但尚无迁移的情况）
ENV PRISMA_HIDE_UPDATE_MESSAGE=1
CMD ["sh", "-c", "echo '[boot] prisma migrate deploy ...' && npx prisma migrate deploy 2>&1 | tee /tmp/pm.log; grep -q 'P3005' /tmp/pm.log && npx prisma migrate reset --force --skip-seed; echo '[boot] prisma db push (safety net) ...' && npx prisma db push --skip-generate --accept-data-loss 2>&1; echo '[boot] starting server'; exec node dist/index.js"]
