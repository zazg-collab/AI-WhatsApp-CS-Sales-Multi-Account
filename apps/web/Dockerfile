FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY apps/web/package*.json ./apps/web/
RUN npm ci
COPY . .
# Next.js inlines NEXT_PUBLIC_* into the client bundle at build time, so they
# must be supplied as build args (docker build --build-arg ...), not just as
# a runtime `environment:` entry.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_SOCKET_URL=${NEXT_PUBLIC_SOCKET_URL}
RUN npm run build --workspace=@sentinel/web

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
RUN mkdir -p ./apps/web/public
COPY --from=builder /app/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
