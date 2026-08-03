# Remotion render worker — headless Chrome (per frame) + ffmpeg → mp4.
# Chrome Headless Shell is downloaded via `npx remotion browser ensure`
# (Remotion 4 official approach); the apt packages below are its shared libs.
FROM node:22-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    fonts-noto-cjk \
  && rm -rf /var/lib/apt/lists/*

# fonts-noto-cjk: CJK glyphs for headless Chrome. Without it every Chinese
# character in the spec renders as tofu boxes (□). Noto Sans SC inside this
# package is also the DSL font whitelist's body/title family, and it is OFL —
# safe to redistribute inside the image (see 视频生成计划 §十 字体风险).

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# tsconfig + full TS source: tsc builds dist/, and the Remotion bundler
# also compiles src/remotion directly at render time.
COPY tsconfig.json ./
COPY src ./src
RUN npm run build \
  && npx remotion browser ensure

ENV PORT=3100
# Override with a mounted volume in docker-compose, e.g. ../data/videos/renders
ENV RENDER_OUT_DIR=/app/renders
VOLUME ["/app/renders"]

EXPOSE 3100
CMD ["node", "dist/server.js"]
