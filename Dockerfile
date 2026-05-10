# ── Stage 1: Build ──
FROM node:20-alpine AS builder

WORKDIR /app

# Install server dependencies
COPY server/package*.json ./server/
RUN cd server && npm ci

# Install client dependencies
COPY client/package*.json ./client/
RUN cd client && npm ci

# Copy source (server/prisma/ is included in server/)
COPY server/ ./server/
COPY client/ ./client/

# Generate Prisma client
RUN cd server && npx prisma generate

# Build server
RUN cd server && npm run build

# Build client
RUN cd client && npm run build

# ── Stage 2: Runtime ──
FROM node:20-alpine AS runtime

WORKDIR /app

# Install production dependencies only
COPY server/package*.json ./server/
RUN cd server && npm ci --production

# Copy Prisma schema and generate client (schema lives inside server/)
COPY server/prisma/ ./server/prisma/
RUN cd server && npx prisma generate

# Copy built artifacts
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

# Copy nginx config for potential use
COPY nginx.conf ./nginx.conf

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "server/dist/index.js"]
