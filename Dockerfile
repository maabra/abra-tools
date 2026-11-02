FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public
COPY server/utils.js ./server/utils.js
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
    && python3 -m venv /opt/yt-dlp \
    && /opt/yt-dlp/bin/pip install --no-cache-dir yt-dlp \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 YTDLP_BIN=/opt/yt-dlp/bin/yt-dlp
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
USER node
EXPOSE 10000
CMD ["node", "server/index.js"]
