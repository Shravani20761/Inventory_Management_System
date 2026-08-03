# Coolify / production — Express API (MongoDB + Puppeteer PDFs)
# Coolify: set Base Directory to `backend` (if deploying from monorepo root)
# or deploy this folder as the build context.

FROM node:20-bookworm-slim AS deps
WORKDIR /app

# Use system Chromium in the final image (smaller, more reliable in containers)
ENV PUPPETEER_SKIP_DOWNLOAD=1

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

FROM node:20-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 app \
  && useradd --system --uid 1001 --gid app --home-dir /app --shell /usr/sbin/nologin app

ENV NODE_ENV=production \
    PORT=3001 \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY index.js ./
COPY config ./config
COPY constants ./constants
COPY controllers ./controllers
COPY data ./data
COPY middleware ./middleware
COPY models ./models
COPY public ./public
COPY routes ./routes
COPY scripts ./scripts
COPY services ./services
COPY shared ./shared
COPY templates ./templates
COPY utils ./utils
COPY schema.sql ./

RUN mkdir -p generated/invoices generated/accounts .cache/puppeteer \
  && chown -R app:app /app

USER app

# Coolify maps its PORT env at runtime; app already listens on 0.0.0.0
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/api/health" || exit 1

CMD ["node", "index.js"]
