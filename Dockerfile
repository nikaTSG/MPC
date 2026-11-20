# --- Build React/Vite Frontend ---
FROM node:22-bookworm-slim AS client-builder
WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build


# --- Build Express/TypeScript Backend ---
FROM node:22-bookworm-slim AS server-builder
WORKDIR /app/server

# Build tools needed if better-sqlite3 compiles from source
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY server/package*.json ./
RUN npm ci

COPY server/ ./
RUN npm run build


# --- Slim Production Runtime ---
FROM node:22-bookworm-slim AS runner
WORKDIR /app/server

ENV NODE_ENV=production
ENV PORT=3001
ENV CLIENT_DIST_PATH=/app/client/dist

# Install only production dependencies
COPY server/package*.json ./
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && npm ci --omit=dev \
    && apt-get purge -y python3 make g++ \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Copy built frontend, built backend, and Prisma assets/seed DB
COPY --from=client-builder /app/client/dist /app/client/dist
COPY --from=server-builder /app/server/dist ./dist
COPY --from=server-builder /app/server/prisma ./prisma
COPY --from=server-builder /app/server/prisma.config.ts ./prisma.config.ts

# Directory for persistent SQLite volume
RUN mkdir -p /app/data

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]