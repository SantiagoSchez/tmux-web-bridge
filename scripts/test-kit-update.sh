#!/usr/bin/env bash
# Prueba de punta a punta de «Actualizar el kit» (server/src/kit.ts) sin tocar nada de la
# máquina: HOME, configuración de git, tmux (TMUX_TMPDIR, socket incluido) y el origen del
# clon son de una carpeta temporal que se borra al acabar (KEEP=1 la conserva).
#
# Monta un origen falso con el árbol de trabajo como release nueva (la última versión +1
# de parche), un clon del kit en la última release instalado en el HOME falso y su tmux,
# y llama a updateKit como el panel. Comprueba los errores (origen ajeno, cambios locales,
# tag inexistente) y la actualización buena, y que el tmux por defecto no se ha tocado.
#
# Uso: scripts/test-kit-update.sh   (necesita pnpm install hecho: usa el tsx de server/)

set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
TSX="$REPO/server/node_modules/.bin/tsx"
[ -x "$TSX" ] || { echo "Falta $TSX: ejecuta pnpm install" >&2; exit 1; }

# En /tmp y no en $TMPDIR: la ruta del socket de tmux tiene un límite de ~100 caracteres.
T="$(mktemp -d /tmp/twb-kit-test.XXXXXX)"

# ------------------------------------------------------------ aislamiento
export HOME="$T/home" TMUX_TMPDIR="$T/tmux" GIT_CONFIG_GLOBAL="$T/gitconfig" GIT_CONFIG_NOSYSTEM=1
unset TMUX TMUX_PANE XDG_CONFIG_HOME CLAUDE_CONFIG_DIR
# Después del aislamiento, y solo con él: un kill-server sin él cerraría el tmux de verdad.
cleanup() {
    if [ "${TMUX_TMPDIR:-}" = "$T/tmux" ]; then
        tmux -L twbkit kill-server 2>/dev/null || true
        tmux kill-server 2>/dev/null || true
    fi
    if [ "${KEEP:-0}" = 1 ]; then echo "Conservado: $T"; else rm -rf "$T"; fi
}
trap cleanup EXIT
mkdir -p "$HOME" "$TMUX_TMPDIR" "$T/data"
git config --global user.name twb-test
git config --global user.email twb-test@example.invalid
git config --global advice.detachedHead false

# ------------------------------------------------------------ origen con una release nueva
OLD="$(git -C "$REPO" describe --tags --abbrev=0)"
IFS=. read -r MA MI PA <<<"${OLD#v}"
NEW="$MA.$MI.$((PA + 1))"
ORIGIN="$T/github/SantiagoSchez/tmux-web-bridge.git"
git clone -q --bare "$REPO" "$ORIGIN"
git clone -q "$ORIGIN" "$T/work"
(cd "$REPO" && git ls-files -m -o --exclude-standard) | while read -r f; do
    [ -f "$REPO/$f" ] || continue
    mkdir -p "$T/work/$(dirname "$f")"
    cp "$REPO/$f" "$T/work/$f"
done
echo "$NEW" > "$T/work/VERSION"
git -C "$T/work" add -A
git -C "$T/work" commit -qm "Release $NEW (prueba)"
git -C "$T/work" tag "v$NEW"
git -C "$T/work" push -q origin HEAD:refs/heads/master "v$NEW"

# ------------------------------------------------------------ máquina: kit en la release anterior
KIT="$HOME/tmux-web-bridge"
git clone -q "$ORIGIN" "$KIT"
git -C "$KIT" checkout -q "$OLD"
"$KIT/host-kit/install.sh" > "$T/install-inicial.log" 2>&1
tmux -L twbkit -f "$KIT/host-kit/tmux.conf" new-session -d -s demo -c "$HOME"
# Un tmux en el socket por defecto: la actualización no debe recargar el kit en él.
tmux -f /dev/null new-session -d -s centinela
sleep 1

cat > "$T/config.yaml" <<EOF
dataDir: $T/data
auth:
  allowWithoutTailscale: true
hosts:
  - id: maquina
    name: maquina
    local: true
    socketName: twbkit
EOF
cat > "$T/driver.mts" <<EOF
import { loadConfig } from '$REPO/server/src/config.ts';
import { HostMonitor } from '$REPO/server/src/host.ts';
import { updateKit } from '$REPO/server/src/kit.ts';
const config = loadConfig();
const host = new HostMonitor(config.hosts[0], config);
try {
  const r = await updateKit(host, process.argv[2]);
  console.log('OK ' + r.version);
} catch (err) {
  console.log('ERR ' + (err as Error).message);
}
EOF
update() { TMUX_WEB_CONFIG="$T/config.yaml" "$TSX" "$T/driver.mts" "$1" 2>&1 | tee -a "$T/driver.log" | tail -n 1; }

FAILS=0
ok() { printf '\033[32m✓\033[0m %s\n' "$1"; }
ko() { printf '\033[31m✗\033[0m %s\n' "$1"; FAILS=$((FAILS + 1)); }
expect() {  # descripción salida patrón
    if printf '%s' "$2" | grep -qE "$3"; then ok "$1"; else ko "$1 — salió: $2"; fi
}

echo "Kit $OLD → v$NEW en $KIT"

# ------------------------------------------------------------ errores
git -C "$KIT" remote set-url origin "$T/github/otro/repo.git"
expect "Un clon de otro repo no se toca" "$(update "$NEW")" "^ERR maquina: El clon del kit en $KIT no es de twb"
git -C "$KIT" remote set-url origin "$ORIGIN"

echo "# cambio local" >> "$KIT/README.md"
expect "Con cambios locales no se toca" "$(update "$NEW")" "^ERR maquina: Cambios locales en el clon del kit \($KIT\)"
git -C "$KIT" -c core.hooksPath=/dev/null checkout -q -- README.md

expect "Un tag que no existe dice qué clon" "$(update 99.0.0)" "^ERR maquina: No existe el tag v99.0.0 en el clon del kit \($KIT"
expect "Los errores dejan el clon donde estaba" "$(git -C "$KIT" describe --tags)" "^$OLD\$"

# ------------------------------------------------------------ actualización
expect "Actualiza a la release" "$(update "$NEW")" "^OK $NEW\$"
expect "El clon queda en el tag" "$(git -C "$KIT" describe --tags)" "^v$NEW\$"
expect "El tmux de la máquina publica la versión nueva" "$(tmux -L twbkit show -gqv @twb_kit_version)" "^$NEW\$"
expect "…y la ruta del clon" "$(tmux -L twbkit show -gqv @twb_kit_dir)" "^$KIT\$"
expect "El tmux por defecto no se ha tocado" "[$(tmux show -gqv @twb_kit_version)]" '^\[\]$'
expect "Hook post-checkout instalado" "$(ls "$KIT/.git/hooks")" "post-checkout"
expect "Hooks de Claude en el settings.json del HOME falso" "$(grep -c tmux-window-title "$HOME/.claude/settings.json")" "^[1-9]"

echo
if [ "$FAILS" = 0 ]; then echo "Todo bien."; else echo "$FAILS comprobaciones fallidas (KEEP=1 para conservar $T)."; exit 1; fi
