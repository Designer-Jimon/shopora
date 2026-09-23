# SHOPORA production image (Next.js 14 on Node 22, non-standalone — keeps the
# Prisma query engine + argon2 native binding copies trivial and reliable).
# Runtime deps: PostgreSQL (external), optional Cloudflare R2 (external).

FROM node:22-slim AS base

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Prisma needs OpenSSL at runtime; curl for healthchecks.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

# Install prod deps FIRST (layer-cached).
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# Generate the Prisma client (postinstall also does this; explicit for clarity).
RUN npx prisma generate

# Build the app.
COPY . .
ENV NODE_ENV=production
RUN npm run build

EXPOSE 3000

# Prisma is applied at deploy time (Render preDeployCommand). The CMD also runs
# migrate deploy so a bare `docker run` is safe against a fresh DB.
CMD ["sh", "-c", "npx prisma migrate deploy && exec npm run start -- -p 3000"]