# Multi-stage build: install deps + compile TS in builder, ship slim runtime.
# Final image runs the HTTP transport (MCP_TRANSPORT=http) and serves Claude Web
# and any other remote MCP client. The stdio transport still works in this image
# but isn't the intended use — for local stdio, just `npx tsx src/index.ts`.

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --include=dev
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist

# 8080 inside the container; map to whatever you want at runtime.
ENV MCP_TRANSPORT=http
ENV MCP_HTTP_PORT=8080
EXPOSE 8080

# Lightweight healthcheck — /healthz returns {ok:true} without touching MCP state.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

CMD ["node", "dist/index.js"]
