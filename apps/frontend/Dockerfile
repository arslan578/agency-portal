FROM node:18-alpine AS builder
WORKDIR /app
# Enable corepack for pnpm support
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY apps/frontend/package.json ./
COPY apps/frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY apps/frontend .
RUN pnpm run build

FROM node:18-alpine AS runner
WORKDIR /app
# Enable corepack for pnpm support
RUN corepack enable && corepack prepare pnpm@latest --activate
ENV NODE_ENV=production
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000
CMD ["pnpm", "start"]
