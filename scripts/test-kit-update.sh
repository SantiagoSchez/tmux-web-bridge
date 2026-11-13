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
EOF
# La clave del hub en el authorized_keys de la máquina: la desinstalación la quita.
KEY_BLOB=AAAAC3NzaC1lZDI1NTE5AAAAIPruebaDelHub
mkdir -p "$HOME/.ssh"
printf 'ssh-ed25519 AAAAotra yo\nfrom="10.0.0.1" ssh-ed25519 %s tmux-web-bridge\n' "$KEY_BLOB" > "$HOME/.ssh/authorized_keys"
# git clone de la URL de GitHub (la de installKit) va al origen falso.
git config --global "url.$ORIGIN.insteadOf" https://github.com/SantiagoSchez/tmux-web-bridge.git
cat > "$T/driver.mts" <<EOF
import { loadConfig } from '$REPO/server/src/config.ts';
import { HostMonitor } from '$REPO/server/src/host.ts';
import { installKit, setTrelloExtension, uninstallKit, updateKit } from '$REPO/server/src/kit.ts';
import { hostConfig } from '$REPO/server/src/machines.ts';
const config = loadConfig();
const host = new HostMonitor(hostConfig({ id: 'maquina', name: 'maquina', local: true, socketName: 'twbkit' }), config);
const [what, arg] = process.argv.slice(2);
try {
  if (what === 'trello') {
    const r = await setTrelloExtension(host, arg === 'on');
    console.log('OK ' + (r.dir ?? '-'));
  } else if (what === 'uninstall' || what === 'install') {
    const r = what === 'install' ? await installKit(host, arg, 'https://twb.example.invalid', 'TOKEN-PRUEBA') : await uninstallKit(host, 'ssh-ed25519 $KEY_BLOB');
    if (r.log) console.log(r.log);
    for (const l of r.left) console.log('LEFT ' + l);
    console.log(r.ok ? 'OK' : 'ERR ' + r.log);
  } else {
    const r = await updateKit(host, arg, what === 'update-trello');
    if (r.changes) console.log(r.changes);
    console.log('OK ' + r.version);
  }
} catch (err) {
  console.log('ERR ' + (err as Error).message);
}
EOF
run() { TMUX_WEB_CONFIG="$T/config.yaml" "$TSX" "$T/driver.mts" "$@" 2>&1 | tee -a "$T/driver.log" | tail -n 1; }
update() { run update "$1"; }

# Las releases de GitHub, con el .zip de la extensión de Trello de la versión nueva (install.sh las
# busca en TWB_RELEASES_URL; el hub, que corre aquí, le pasa su entorno).
mkdir -p "$T/releases/v$NEW" "$T/ext"
printf '{ "manifest_version": 3, "name": "Trello → twb", "version": "%s" }\n' "$NEW" > "$T/ext/manifest.json"
(cd "$T/ext" && zip -qr "$T/releases/v$NEW/twb-trello-extension-v$NEW.zip" .)
export TWB_RELEASES_URL="file://$T/releases"
EXT="$HOME/.local/share/tmux-web-bridge/trello-extension"

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

# Solo con un kit anterior a la extensión (1.17.0): con uno posterior, esto la activaría.
if [ "$(printf '%s\n' "${OLD#v}" 1.17.0 | sort -V | head -1)" != 1.17.0 ]; then
  expect "Un kit sin --trello-extension lo dice" "$(run trello on)" "^ERR maquina: El kit de esta máquina es anterior a la extensión de Trello"
fi

# ------------------------------------------------------------ actualización
expect "Actualiza a la release" "$(update "$NEW")" "^OK $NEW\$"
expect "El clon queda en el tag" "$(git -C "$KIT" describe --tags)" "^v$NEW\$"
expect "El tmux de la máquina publica la versión nueva" "$(tmux -L twbkit show -gqv @twb_kit_version)" "^$NEW\$"
expect "…y la ruta del clon" "$(tmux -L twbkit show -gqv @twb_kit_dir)" "^$KIT\$"
expect "El tmux por defecto no se ha tocado" "[$(tmux show -gqv @twb_kit_version)]" '^\[\]$'
expect "Hook post-checkout instalado" "$(ls "$KIT/.git/hooks")" "post-checkout"
expect "Hooks de Claude en el settings.json del HOME falso" "$(grep -c tmux-window-title "$HOME/.claude/settings.json")" "^[1-9]"

# ------------------------------------------------------------ del kit con enlaces al de ahora
expect "Ya no hay enlaces del kit en ~/.scripts" "[$(find "$HOME/.scripts" -type l 2>/dev/null)]" '^\[\]$'
expect "…ni el de la status line en ~/.claude/scripts" "[$(find "$HOME/.claude/scripts" -type l 2>/dev/null)]" '^\[\]$'
expect "~/.tmux.conf carga el kit en un bloque marcado, con -q" "$(grep -A1 '^# >>> tmux-web-bridge' "$HOME/.tmux.conf")" "source-file -q ~/tmux-web-bridge/host-kit/tmux.conf"
expect "…y sin la línea suelta de antes" "$(grep -c '^source-file' "$HOME/.tmux.conf")" "^1\$"
expect "Los hooks de Claude llaman al script del clon" "$(jq -r '.hooks.Stop[0].hooks[0].command' "$HOME/.claude/settings.json")" '^"\$HOME/tmux-web-bridge/host-kit/tmux-window-title\.sh" state done'
expect "…sin duplicarse" "$(jq '[.hooks.Stop[].hooks[].command | select(test("tmux-window-title"))] | length' "$HOME/.claude/settings.json")" "^1\$"
expect "La status line, la del clon" "$(jq -r .statusLine.command "$HOME/.claude/settings.json")" '^"\$HOME/tmux-web-bridge/host-kit/statusline\.sh"$'
expect "tmux llama a los scripts en el clon" "$(tmux -L twbkit display -p '#{q:@twb_kit_dir}/host-kit/tmux-window-title.sh')" "^$KIT/host-kit/tmux-window-title.sh\$"
expect "…y funcionan" "$(tmux -L twbkit run-shell '#{q:@twb_kit_dir}/host-kit/tmux-spaces.sh renumber' && echo bien)" "^bien\$"
expect "prefix x pasa por el script del clon" "$(tmux -L twbkit list-keys -T prefix x)" "run-shell \"#\{q:@twb_kit_dir\}/host-kit/tmux-window-title.sh close pane"
expect "…y los atajos que el kit anterior reescribió, también" "$(tmux -L twbkit list-keys | grep -c '\.scripts/' || true)" "^0\$"
before="$(cat "$HOME/.tmux.conf")"
TWB_NO_TMUX_RELOAD=1 "$KIT/host-kit/install.sh" >/dev/null 2>&1
expect "Reinstalar no cambia ~/.tmux.conf" "$([ "$before" = "$(cat "$HOME/.tmux.conf")" ] && echo igual)" "^igual\$"

# ------------------------------------------------------------ extensión de Trello
expect "Sin activarla, no se descarga" "[$(ls "$EXT" 2>/dev/null)]" '^\[\]$'
expect "Activarla devuelve su carpeta" "$(run trello on)" "^OK $EXT\$"
expect "…con la extensión de la release del kit" "$(jq -r .version "$EXT/manifest.json")" "^$NEW\$"
expect "…y se recuerda" "$(cat "$HOME/.config/tmux-web-bridge/trello-extension")" "^$EXT\$"
rm -rf "$EXT"
expect "Una actualización con ella activada la vuelve a poner" "$(run update-trello "$NEW")" "^OK $NEW\$"
expect "…en su carpeta" "$(jq -r .version "$EXT/manifest.json" 2>/dev/null)" "^$NEW\$"
rm -rf "$EXT"
git -C "$KIT" -c core.hooksPath=/dev/null checkout -q "$OLD" && git -C "$KIT" checkout -q "v$NEW"
expect "El hook de git (git checkout a mano) también, porque se recuerda" "$(jq -r .version "$EXT/manifest.json" 2>/dev/null)" "^$NEW\$"
mv "$T/releases/v$NEW" "$T/releases/aparte"
rm -rf "$EXT"
expect "Sin el .zip en la release, el kit se aplica igual" "$(run update-trello "$NEW")" "^OK $NEW\$"
expect "…y avisa de que no pudo descargarla" "$(grep -c 'Aviso: no se pudo descargar la extensión de Trello' "$T/driver.log")" "^[1-9]"
mv "$T/releases/aparte" "$T/releases/v$NEW"
expect "Desactivarla" "$(run trello off)" "^OK -\$"
expect "…deja de recordarse" "[$(cat "$HOME/.config/tmux-web-bridge/trello-extension" 2>/dev/null)]" '^\[\]$'

# ------------------------------------------------------------ quitar la máquina del panel
expect "Desinstalar" "$(run uninstall)" "^OK\$"
expect "…sin dejar nada" "$(grep -c '^LEFT' "$T/driver.log" || true)" "^0\$"
expect "…ni el clon" "[$(ls -d "$KIT" 2>/dev/null)]" '^\[\]$'
expect "…ni el bloque de ~/.tmux.conf" "$(grep -c 'tmux-web-bridge' "$HOME/.tmux.conf" || true)" "^0\$"
expect "…ni los hooks de Claude" "$(grep -c 'tmux-web-bridge' "$HOME/.claude/settings.json" || true)" "^0\$"
expect "…ni la configuración" "[$(ls -d "$HOME/.config/tmux-web-bridge" 2>/dev/null)]" '^\[\]$'
expect "…ni la clave del hub, y las demás se quedan" "$(cat "$HOME/.ssh/authorized_keys")" '^ssh-ed25519 AAAAotra yo$'
expect "El tmux en marcha deja el kit: prefix x vuelve a ser el de tmux" "$(tmux -L twbkit list-keys -T prefix x)" 'confirm-before -p "kill-pane #P\? \(y/n\)" kill-pane'
expect "…y sus hooks y opciones" "[$(tmux -L twbkit show-hooks -g pane-focus-in 2>/dev/null)$(tmux -L twbkit show -gqv @twb_kit_dir)]" '^\[(pane-focus-in)?\]$'

# ------------------------------------------------------------ añadir la máquina desde el panel
expect "Instalar el kit desde cero (clon nuevo)" "$(run install "$NEW")" "^OK\$"
expect "…en la release" "$(git -C "$KIT" describe --tags)" "^v$NEW\$"
expect "…con la URL, el id y el token" "$(grep -E '^(HUB_URL|HOST_ID|NOTIFY_TOKEN)=' "$HOME/.config/tmux-web-bridge/notify.env" | tr '\n' ' ')" "^HUB_URL=https://twb.example.invalid HOST_ID=maquina NOTIFY_TOKEN=TOKEN-PRUEBA \$"
expect "…y cargado en su tmux" "$(tmux -L twbkit show -gqv @twb_kit_version)" "^$NEW\$"

echo
if [ "$FAILS" = 0 ]; then echo "Todo bien."; else echo "$FAILS comprobaciones fallidas (KEEP=1 para conservar $T)."; exit 1; fi
