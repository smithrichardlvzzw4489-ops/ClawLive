FROM node:20-alpine AS base
RUN npm install -g pnpm turbo

FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune --scope=@clawlive/server --docker

FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
RUN cd apps/server && pnpm prisma generate
RUN pnpm turbo run build --filter=@clawlive/server

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 serveruser

COPY --from=installer --chown=serveruser:nodejs /app/apps/server/dist ./dist
COPY --from=installer --chown=serveruser:nodejs /app/apps/server/package.json ./
COPY --from=installer --chown=serveruser:nodejs /app/apps/server/prisma ./prisma
COPY --from=installer --chown=serveruser:nodejs /app/apps/server/node_modules ./node_modules
COPY --from=installer --chown=serveruser:nodejs /app/node_modules/.prisma ./node_modules/.prisma

USER serveruser

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
