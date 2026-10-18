#!/usr/bin/env bash
# Despliegue de twb en su stack de Docker, lanzado por el workflow `deploy` en el runner
# self-hosted del host (ver .github/workflows/deploy.yml).
#
# Copia el commit a `<stack>/app`, reconstruye la imagen y levanta el panel. Si la imagen
# no compila, no toca el panel en marcha; si el panel nuevo no responde en /api/health,
# vuelve a la imagen y al código anteriores. Avisa por `notify` si existe en el host.
set -euo pipefail

STACK=${TWB_STACK:-$HOME/docker/stacks/twb}
SRC=${GITHUB_WORKSPACE:-$(git rev-parse --show-toplevel)}
NOTIFY=/usr/local/sbin/notify
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-90}

sha=$(git -C "$SRC" rev-parse --short HEAD)
subject=$(git -C "$SRC" log -1 --format=%s)
run_url="${GITHUB_SERVER_URL:-}/${GITHUB_REPOSITORY:-}/actions/runs/${GITHUB_RUN_ID:-}"

avisar() {  # nivel título cuerpo
  [ -x "$NOTIFY" ] && "$NOTIFY" "$1" "$2" "$3" || true
}

health() {
  local deadline=$((SECONDS + HEALTH_TIMEOUT))
  while ((SECONDS < deadline)); do
    curl -fsS --max-time 3 "http://$bind:7681/api/health" >/dev/null 2>&1 && return 0
    sleep 3
  done
  return 1
}

cd "$STACK"
bind=$(sed -n 's/^TWB_BIND=//p' .env)
bind=${bind:-127.0.0.1}

# Código nuevo en app.new; el anterior se queda en app.prev hasta el siguiente despliegue.
rm -rf app.new
mkdir app.new
git -C "$SRC" archive HEAD | tar -x -C app.new

if docker image inspect twb:local >/dev/null 2>&1; then
  docker image tag twb:local twb:previous
fi

rm -rf app.prev
mv app app.prev
mv app.new app

echo "Construyendo $sha: $subject"
if ! docker compose build -q twb; then
  rm -rf app && mv app.prev app
  docker image tag twb:previous twb:local 2>/dev/null || true
  avisar danger "twb: no compila $sha" "El panel sigue con la versión anterior. $subject — $run_url"
  exit 1
fi

docker compose up -d twb
if health; then
  docker image prune -f >/dev/null
  echo "Desplegado $sha"
  avisar good "twb desplegado: $sha" "$subject"
  exit 0
fi

echo "El panel nuevo no responde en /api/health: vuelvo a la versión anterior" >&2
docker compose logs --tail 40 twb >&2 || true
rm -rf app && mv app.prev app
docker image tag twb:previous twb:local 2>/dev/null || true
docker compose up -d --no-build --force-recreate twb
if health; then
  avisar danger "twb: rollback de $sha" "La versión nueva no respondía en /api/health; vuelve a funcionar la anterior. $subject — $run_url"
else
  avisar danger "twb CAÍDO tras desplegar $sha" "Ni la versión nueva ni la anterior responden en /api/health. $run_url"
fi
exit 1
