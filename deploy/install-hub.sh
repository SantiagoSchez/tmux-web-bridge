#!/usr/bin/env bash
# Instala el servidor central de tmux-web-bridge en un Linux con systemd:
#   1. compila el proyecto (pnpm install + build; node-pty se compila aquí),
#   2. crea config.yaml (con un notifyToken aleatorio) si no existe,
#   3. crea la clave SSH con la que el servidor central entra en las máquinas,
#   4. instala y arranca el servicio de usuario de systemd.
# Después: `tailscale serve` y añadir la clave pública a cada máquina (lo imprime al final).
#
# Uso: deploy/install-hub.sh [--no-service]

set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
KEY="$HOME/.ssh/tmux-web-bridge_ed25519"
SERVICE=1
[ "${1:-}" = "--no-service" ] && SERVICE=0

say() { printf '\033[1;35m›\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

# ------------------------------------------------------------ requisitos
NODE="$(command -v node || true)"
[ -n "$NODE" ] || die "Falta Node.js 22 o posterior"
NODE_MAJOR="$("$NODE" -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 22 ] || die "Hace falta Node.js 22 o posterior (tienes $("$NODE" -v))"
command -v tmux >/dev/null || warn "tmux no está instalado aquí (solo hace falta si este servidor es también una de las máquinas)"
command -v ssh >/dev/null || die "Falta el cliente ssh"
if ! command -v make >/dev/null || ! command -v g++ >/dev/null || ! command -v python3 >/dev/null; then
    die "node-pty se compila al instalar: hacen falta make, g++ y python3 (sudo apt install build-essential python3)"
fi
if ! command -v pnpm >/dev/null; then
    say "Activando pnpm con corepack (en ~/.local/bin)"
    mkdir -p "$HOME/.local/bin"
    export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
    corepack enable --install-directory "$HOME/.local/bin" pnpm || die "No se pudo activar pnpm (instálalo con: npm i -g pnpm)"
    export PATH="$HOME/.local/bin:$PATH"
fi

# ------------------------------------------------------------ compilación
cd "$APP_DIR"
say "Instalando dependencias"
pnpm install --frozen-lockfile
say "Compilando servidor y web"
pnpm build

# ------------------------------------------------------------ configuración
if [ ! -f config.yaml ]; then
    TOKEN="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
    sed -e "s/^notifyToken: .*/notifyToken: $TOKEN/" config.example.yaml > config.yaml
    chmod 600 config.yaml
    say "Creado config.yaml (edita las máquinas y allowedLogins antes de usarlo)"
else
    say "config.yaml ya existe: no se toca"
fi

# ------------------------------------------------------------ clave SSH
if [ ! -f "$KEY" ]; then
    mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
    ssh-keygen -q -t ed25519 -N '' -C "tmux-web-bridge@$(hostname)" -f "$KEY"
    say "Clave SSH creada: $KEY"
fi

# ------------------------------------------------------------ servicio
if [ "$SERVICE" = 1 ]; then
    command -v systemctl >/dev/null || die "No hay systemd (usa --no-service y arráncalo a mano: node server/dist/index.js)"
    UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
    mkdir -p "$UNIT_DIR"
    sed -e "s#@APP_DIR@#$APP_DIR#g" -e "s#@NODE@#$NODE#g" deploy/tmux-web-bridge.service > "$UNIT_DIR/tmux-web-bridge.service"
    systemctl --user daemon-reload
    systemctl --user enable --now tmux-web-bridge.service
    systemctl --user restart tmux-web-bridge.service
    say "Servicio activo: systemctl --user status tmux-web-bridge"
    if [ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" != "yes" ]; then
        warn "Para que arranque sin iniciar sesión: sudo loginctl enable-linger $USER"
    fi
fi

PORT="$(awk '/^listen:/ {f=1} f && /port:/ {print $2; exit}' config.yaml 2>/dev/null)"
cat <<EOF

$(say "Siguientes pasos")
  1. Publica el panel en la tailnet (HTTPS con certificado de Tailscale):
       sudo tailscale serve --bg ${PORT:-7681}
     y ábrelo en https://$(hostname).<tu-tailnet>.ts.net

  2. Autoriza esta clave en cada máquina (~/.ssh/authorized_keys):
       $(cat "$KEY.pub")
     Recomendado, limitada a la IP de Tailscale de este servidor:
       from="$(tailscale ip -4 2>/dev/null || echo 100.x.y.z)" $(cut -d' ' -f1,2 "$KEY.pub") tmux-web-bridge

  3. En cada máquina, para los estados de Claude y los avisos al móvil:
       host-kit/install.sh --hub https://$(hostname).<tu-tailnet>.ts.net --host <id> --token $(awk '/^notifyToken:/ {print $2}' config.yaml)
EOF
