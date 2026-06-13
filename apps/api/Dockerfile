FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
COPY packages/database/package*.json ./packages/database/
COPY apps/api/package*.json ./apps/api/
RUN npm ci
COPY . .
ENV PRISMA_CLI_BINARY_TARGETS="linux-musl-openssl-3.0.x"
RUN npx --prefix packages/database prisma generate --schema packages/database/prisma/schema.prisma
RUN npm run build --workspace=@hermes/api

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Install OpenSSL for Prisma engine compatibility on Alpine
RUN apk add --no-cache openssl
# Run as a non-root user (container hardening).
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 hermes
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/package.json ./package.json
COPY tsconfig.base.json ./
COPY apps/api/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && chown -R hermes:nodejs /app
USER hermes
EXPOSE 3001
# Apply pending DB migrations before booting the API.
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "apps/api/dist/main.js"]
