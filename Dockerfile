# Servidor central de tmux-web-bridge en Docker (ver deploy/docker/compose.yaml).

FROM node:22-bookworm-slim AS build
# node-pty se compila al instalar.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY scripts ./scripts
COPY server/package.json server/
COPY web/package.json web/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build \
 && pnpm --filter server deploy --prod --legacy /out/server \
 && cp -r server/dist /out/server/dist \
 && mkdir -p /out/web && cp -r web/dist /out/web/dist

FROM node:22-bookworm-slim
# ssh para entrar en las máquinas; nc para pasar por el proxy SOCKS5 de Tailscale.
RUN apt-get update && apt-get install -y --no-install-recommends openssh-client netcat-openbsd ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /out/ ./
ENV NODE_ENV=production TMUX_WEB_CONFIG=/app/config.yaml
USER node
EXPOSE 7681
CMD ["node", "server/dist/index.js"]
