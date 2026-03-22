# ─────────────────────────────────────
# Stage 1: Install dependencies
# ─────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# ─────────────────────────────────────
# Stage 2: Build Next.js
# ─────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build Next.js (production)
RUN npm run build

# ─────────────────────────────────────
# Stage 3: Production runner
# ─────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install Chromium for Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    && rm -rf /var/cache/apk/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Copy production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# We still need tsx for the backend at runtime
RUN npm install tsx concurrently

# Copy built Next.js output
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Copy backend source (runs via tsx at runtime)
COPY --from=builder /app/src ./src

# Create directories for persistent data
RUN mkdir -p /app/data/browser-profiles /app/data/zalo-sessions /app/public/uploads

EXPOSE 3010 4010

CMD ["npx", "concurrently", "next start -p 3010", "node --import tsx src/bootstrap/index.ts"]
