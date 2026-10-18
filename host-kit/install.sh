#!/usr/bin/env bash
# Prepara una máquina (macOS, Linux o WSL) para tmux-web-bridge desde un clon del repo.
# Se ejecuta una vez; después basta con `git pull` en el clon.
#
#   git clone https://github.com/SantiagoSchez/tmux-web-bridge.git ~/tmux-web-bridge
#   ~/tmux-web-bridge/host-kit/install.sh --hub https://servidor --host wsl --token SECRETO
#
# Enlaza al clon (así un pull los pone al día):
#   ~/.scripts/tmux-window-title.sh     estados de Claude en tmux + aviso al servidor central
#   ~/.scripts/tmux-spaces.sh           spaces numerados (@space_num) y sus atajos
#   ~/.claude/scripts/statusline.sh     status line de Claude Code (publica los límites de uso)
# y además:
#   ~/.tmux.conf                        source-file del tmux.conf del kit (hooks, atajos, ratón)
#   ~/.claude/settings.json             hooks y status line de Claude Code (se fusionan, con copia)
#   ~/.config/tmux-web-bridge/notify.env  URL, id y token de esta máquina (no va al repo)
#   hooks de git post-merge y post-rewrite del clon: tras cada pull vuelven a ejecutar este
#   script (recarga el tmux.conf y fusiona los hooks de Claude si han cambiado)
#
# Opciones:
#   --hub URL --host ID --token TOKEN   escribe notify.env (van juntas; sin ellas se conserva)
#   --skip-tmux     no toca ~/.tmux.conf
#   --skip-claude   no toca ~/.claude (hooks y status line)
#   --check         solo comprueba la conexión con el servidor central
#   --quiet         solo cuenta lo que cambia (lo usan los hooks de git)

set -euo pipefail

KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/tmux-web-bridge"
ENV_FILE="$CONF_DIR/notify.env"
HUB="" HOST_ID="" TOKEN="" SKIP_TMUX=0 SKIP_CLAUDE=0 CHECK_ONLY=0 QUIET=0
STAMP="$(date +%Y%m%d-%H%M%S)"

say() { printf '\033[1;35m›\033[0m %s\n' "$*"; }
same() { [ "$QUIET" = 1 ] || say "$@"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
    case "$1" in
        --hub) HUB="${2:-}"; shift 2 ;;
        --host) HOST_ID="${2:-}"; shift 2 ;;
        --token) TOKEN="${2:-}"; shift 2 ;;
        --skip-tmux) SKIP_TMUX=1; shift ;;
        --skip-claude) SKIP_CLAUDE=1; shift ;;
        --check) CHECK_ONLY=1; shift ;;
        --quiet) QUIET=1; shift ;;
        -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
        *) die "Opción desconocida: $1" ;;
    esac
done
[ -z "$HUB$HOST_ID$TOKEN" ] || { [ -n "$HUB" ] && [ -n "$HOST_ID" ] && [ -n "$TOKEN" ]; } || die "--hub, --host y --token van juntos"

check_hub() {
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    [ -n "${HUB_URL:-}" ] || die "Falta HUB_URL en $ENV_FILE"
    local code
    # Un cuerpo vacío con el token bueno da 400 (autenticado); con uno malo, 401.
    code="$(curl -s -o /dev/null -w '%{http_code}' -m 8 -X POST -H "Authorization: Bearer ${NOTIFY_TOKEN:-}" \
        -H 'Content-Type: application/json' --data '{}' "${HUB_URL%/}/api/notify" || true)"
    case "$code" in
        400) say "Servidor central accesible y token correcto ($HUB_URL)" ;;
        401) die "El servidor central rechaza el token (revisa NOTIFY_TOKEN)" ;;
        000) die "No se puede conectar con $HUB_URL (¿Tailscale activo?)" ;;
        *) warn "Respuesta inesperada del servidor central: HTTP $code" ;;
    esac
}

if [ "$CHECK_ONLY" = 1 ]; then
    [ -f "$ENV_FILE" ] || die "Falta $ENV_FILE: ejecuta antes install.sh --hub ... --host ... --token ..."
    check_hub
    exit 0
fi

# ------------------------------------------------------------ requisitos
command -v tmux >/dev/null || die "tmux no está instalado"
command -v jq >/dev/null || die "Falta jq (brew install jq / sudo apt install jq)"
command -v curl >/dev/null || die "Falta curl"
TMUX_VER="$(tmux -V | grep -oE '[0-9]+\.[0-9]+' | head -1)"
awk -v v="$TMUX_VER" 'BEGIN { exit !(v + 0 >= 3.2) }' || die "Hace falta tmux 3.2 o posterior (tienes $TMUX_VER)"

# Enlaza dst al fichero del kit. Lo que hubiera antes (un fichero, u otro enlace) se
# guarda en .bak.<fecha>. Si dst vive en una carpeta enlazada (dotfiles), el enlace
# queda allí.
link() {
    local src="$1" dst="$2"
    mkdir -p "$(dirname "$dst")"
    if [ -L "$dst" ] && [ "$(readlink "$dst")" = "$src" ]; then
        same "Al día: $dst"
        return
    fi
    if [ -e "$dst" ] || [ -L "$dst" ]; then
        mv "$dst" "$dst.bak.$STAMP"
        say "Copia de seguridad: $dst.bak.$STAMP"
    fi
    ln -s "$src" "$dst"
    say "Enlazado: $dst → $src"
}

# ------------------------------------------------------------ scripts
chmod +x "$KIT/tmux-window-title.sh" "$KIT/tmux-spaces.sh" "$KIT/statusline.sh"
link "$KIT/tmux-window-title.sh" "$HOME/.scripts/tmux-window-title.sh"
link "$KIT/tmux-spaces.sh" "$HOME/.scripts/tmux-spaces.sh"

# ------------------------------------------------------------ notify.env
mkdir -p "$CONF_DIR"
if [ -n "$HUB" ]; then
    [ -f "$ENV_FILE" ] && cp "$ENV_FILE" "$ENV_FILE.bak.$STAMP"
    idle=0
    [ "$(uname -s)" = "Darwin" ] && idle=60
    (
        umask 077
        cat > "$ENV_FILE" <<EOF
# Generado por tmux-web-bridge/host-kit/install.sh ($STAMP)
HUB_URL=$HUB
HOST_ID=$HOST_ID
NOTIFY_TOKEN=$TOKEN
PUSH_MIN_IDLE=$idle
EOF
    )
    say "Configuración escrita: $ENV_FILE"
elif [ ! -f "$ENV_FILE" ]; then
    (umask 077; cp "$KIT/notify.env.example" "$ENV_FILE")
    warn "Edita $ENV_FILE (HUB_URL, HOST_ID, NOTIFY_TOKEN) para activar los avisos al móvil"
fi
chmod 600 "$ENV_FILE"

# ------------------------------------------------------------ tmux
if [ "$SKIP_TMUX" = 0 ]; then
    TMUX_CONF="$HOME/.tmux.conf"
    [ -f "$TMUX_CONF" ] || [ ! -f "$HOME/.config/tmux/tmux.conf" ] || TMUX_CONF="$HOME/.config/tmux/tmux.conf"
    LINE="source-file $KIT/tmux.conf"
    if [ -f "$TMUX_CONF" ] && grep -qxF "$LINE" "$TMUX_CONF"; then
        same "$TMUX_CONF ya carga el kit"
    elif [ -f "$TMUX_CONF" ] && grep -q 'source-file .*tmux-web-bridge.*tmux\.conf' "$TMUX_CONF"; then
        # Una instalación anterior (otra ruta del kit): se apunta a este clon.
        cp "$TMUX_CONF" "$TMUX_CONF.bak.$STAMP"
        tmp="$(mktemp)"
        awk -v line="$LINE" '/^source-file .*tmux-web-bridge.*tmux\.conf/ { print line; next } { print }' "$TMUX_CONF" > "$tmp"
        cat "$tmp" > "$TMUX_CONF"
        rm -f "$tmp"
        say "$TMUX_CONF carga ahora $KIT/tmux.conf (copia: $TMUX_CONF.bak.$STAMP)"
    else
        [ -f "$TMUX_CONF" ] && cp "$TMUX_CONF" "$TMUX_CONF.bak.$STAMP"
        printf '\n# tmux-web-bridge: estados de Claude, spaces y lo que necesita el panel web\n%s\n' "$LINE" >> "$TMUX_CONF"
        say "Añadido a $TMUX_CONF: $LINE"
    fi
    if tmux info >/dev/null 2>&1; then
        tmux source-file "$KIT/tmux.conf" && same "Cargado en el tmux en marcha"
    fi
fi

# ------------------------------------------------------------ Claude Code
if [ "$SKIP_CLAUDE" = 0 ]; then
    link "$KIT/statusline.sh" "$HOME/.claude/scripts/statusline.sh"
    SETTINGS="$HOME/.claude/settings.json"
    mkdir -p "$HOME/.claude"
    [ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
    # Quita los hooks anteriores de tmux-window-title.sh y añade los del kit (idempotente),
    # y apunta la status line al script del kit.
    tmp="$(mktemp)"
    jq --slurpfile kit "$KIT/claude-hooks.json" '
        .hooks = (.hooks // {})
        | reduce ($kit[0].hooks | to_entries[]) as $e (.;
            .hooks[$e.key] = (
                ((.hooks[$e.key] // [])
                  | map(select(((.hooks // []) | map(.command // "") | any(test("tmux-window-title\\.sh"))) | not)))
                + $e.value))
        | .statusLine = { type: "command", command: "~/.claude/scripts/statusline.sh", padding: 0 }
    ' "$SETTINGS" > "$tmp"
    # Se compara el contenido, no el formato: si ya estaban (aunque en otro orden), no se reescribe.
    if [ "$(jq -S . "$tmp")" = "$(jq -S . "$SETTINGS")" ]; then
        rm -f "$tmp"
        same "Hooks y status line de Claude Code ya al día"
    else
        cp "$SETTINGS" "$SETTINGS.bak.$STAMP"
        # cat y no mv: si settings.json es un enlace (dotfiles), sigue siéndolo.
        cat "$tmp" > "$SETTINGS"
        rm -f "$tmp"
        say "Hooks y status line de Claude Code en $SETTINGS (copia: $SETTINGS.bak.$STAMP)"
    fi
fi

# ------------------------------------------------------------ git pull
# Tras un pull (merge, o rebase con pull.rebase), este script vuelve a ejecutarse.
if git -C "$KIT" rev-parse --git-dir >/dev/null 2>&1; then
    for hook in post-merge post-rewrite; do
        path="$(git -C "$KIT" rev-parse --path-format=absolute --git-path "hooks/$hook")"
        want="#!/bin/sh
# tmux-web-bridge: aplica el kit tras cada git pull (lo instala host-kit/install.sh).
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE
exec \"$KIT/install.sh\" --quiet"
        if [ -f "$path" ] && [ "$(cat "$path")" = "$want" ]; then
            same "Hook de git al día: $hook"
        else
            [ -f "$path" ] && cp "$path" "$path.bak.$STAMP"
            mkdir -p "$(dirname "$path")"
            printf '%s\n' "$want" > "$path"
            chmod +x "$path"
            say "Hook de git: $hook (tras cada pull se vuelve a aplicar el kit)"
        fi
    done
else
    warn "$KIT no está en un clon de git: actualiza con un clon para que git pull lo aplique"
fi

# ------------------------------------------------------------ comprobación
if [ "$QUIET" = 0 ] && grep -q '^HUB_URL=https\?://' "$ENV_FILE" && ! grep -q 'example.com' "$ENV_FILE"; then
    (check_hub) || warn "Los avisos al móvil no funcionarán hasta que el servidor central sea accesible"
fi
same "Listo. Para actualizar: git -C $(dirname "$KIT") pull"
