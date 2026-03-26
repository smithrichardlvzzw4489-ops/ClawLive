# ClawLive 后端 - Railway 部署
# Root Directory 必须为空，否则 pnpm-lock.yaml 不在上下文中
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

# Railway: leave "Custom Start Command" EMPTY so this CMD runs.
# If you must override, use a shell — never bare `cd ... &&` (Railway reports: The executable `cd` could not be found).
# Example override: sh -c "npx prisma db push --skip-generate && node dist/index.js"
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
