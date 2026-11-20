# --- Stage 1: Build React/Vite Frontend ---
FROM node:22-bookworm-slim AS client-builder
WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build


# --- Stage 2: Build Express/TypeScript Backend ---
FROM node:22-bookworm-slim AS server-builder
WORKDIR /app/server

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY server/package*.json ./
RUN npm ci

COPY server/ ./
RUN npm run build


# --- Stage 3: Slim Production Runtime ---
FROM node:22-bookworm-slim AS runner
WORKDIR /app/server

ENV NODE_ENV=production
ENV PORT=3001
ENV CLIENT_DIST_PATH=/app/client/dist
ENV MPC_READER_PYTHON=/opt/venv/bin/python

# Install Python + venv for documentReader, build native better-sqlite3, then purge C++ compilers
COPY server/package*.json ./
COPY server/src/integrations/ai/requirements.txt /tmp/requirements.txt
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv make g++ \
    && python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt \
    && npm ci --omit=dev \
    && apt-get purge -y make g++ \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Copy built frontend, compiled backend, JSON contract, Python reader scripts, and Prisma seed DB
COPY --from=client-builder /app/client/dist /app/client/dist
COPY --from=server-builder /app/server/dist ./dist
COPY --from=server-builder /app/server/prisma/contract.json ./dist/prisma/contract.json
COPY --from=server-builder /app/server/src/integrations/ai/*.py ./dist/src/integrations/ai/
COPY --from=server-builder /app/server/prisma ./prisma
COPY --from=server-builder /app/server/prisma.config.ts ./prisma.config.ts

# Persistent directory for production SQLite DB
RUN mkdir -p /app/data

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/src/server.js"]