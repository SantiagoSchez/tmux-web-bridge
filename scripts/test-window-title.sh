#!/usr/bin/env bash
# Prueba de host-kit/tmux-window-title.sh: cuándo le dice al hub que ya estás viendo un
# panel (viewed), cuándo deja ✅ en un panel terminado y cuándo un fin de turno es una
# pausa (trabajo en segundo plano) que no avisa. Ejecuta el script de verdad contra
# un tmux propio (socket y TMUX_TMPDIR de una carpeta temporal) y un hub falso en un puerto
# de loopback que guarda lo que recibe en /api/notify. KEEP=1 conserva la carpeta.
#
# La terminal web del panel es un cliente de tmux en una sesión agrupada _tw-…, como la
# abre server/src/terminal.ts; una terminal de la máquina es un cliente con attach. Los dos
# se conectan con script(1), que les da un pty.
#
# En Linux y en macOS. En macOS el script decide si lo estás viendo preguntando a lsappinfo
# y osascript si Ghostty está a la vista: el test pone delante en el PATH unos falsos que
# responden lo que diga $T/ghostty (front, por defecto, u oculto), para no depender de
# tu escritorio. El script(1) de util-linux y el de BSD se llaman de forma distinta.
#
# Uso: scripts/test-window-title.sh

set -euo pipefail

OS="$(uname -s)"
case "$OS" in
    Linux|Darwin) ;;
    *) echo "scripts/test-window-title.sh: solo funciona en Linux y macOS, no en $OS." >&2; exit 1 ;;
esac
for tool in node script jq curl tmux; do
    command -v "$tool" >/dev/null || { echo "Falta $tool" >&2; exit 1; }
done

REPO="$(cd "$(dirname "$0")/.." && pwd)"
KIT_SCRIPT="$REPO/host-kit/tmux-window-title.sh"
REAL_DATE="$(command -v date)"

# En /tmp y no en $TMPDIR: la ruta del socket de tmux tiene un límite de ~100 caracteres.
T="$(mktemp -d /tmp/twbwt.XXXXXX)"

# ------------------------------------------------------------ aislamiento
export HOME="$T/home" TMUX_TMPDIR="$T/tmux" XDG_CONFIG_HOME="$T/config"
unset TMUX TMUX_PANE
SOCKET=twbwt
tm() { tmux -L "$SOCKET" -f /dev/null "$@"; }
PIDS=()
# Después del aislamiento, y solo con él: un kill-server sin él cerraría el tmux de verdad.
cleanup() {
    if [ "${TMUX_TMPDIR:-}" = "$T/tmux" ]; then
        tm kill-server 2>/dev/null || true
        tmux kill-server 2>/dev/null || true
    fi
    for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done
    # Los sleep que mantenían abierta la entrada de cada cliente (hijos de este script).
    pkill -P $$ -x sleep 2>/dev/null || true
    rm -rf /tmp/tmux-window-state-"$(id -u)"-"${SERVER_PID:-none}"
    if [ "${KEEP:-0}" = 1 ]; then echo "Conservado: $T"; else rm -rf "$T"; fi
}
trap cleanup EXIT
mkdir -p "$HOME" "$TMUX_TMPDIR" "$XDG_CONFIG_HOME/tmux-web-bridge" "$T/bin"
: > "$T/hub.log"

# Un tmux en el socket por defecto (también aislado): el script no debe tocarlo.
tmux -f /dev/null new-session -d -s centinela

# ------------------------------------------------------------ hub falso
node -e '
const http = require("http"), fs = require("fs");
const [log, portFile] = process.argv.slice(1);
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    fs.appendFileSync(log, body.replace(/\n/g, " ") + "\n");
    res.setHeader("Content-Type", "application/json");
    res.end("{\"pushed\":false}");
  });
});
server.listen(0, "127.0.0.1", () => fs.writeFileSync(portFile, String(server.address().port)));
' "$T/hub.log" "$T/hub.port" >/dev/null 2>&1 &
PIDS+=("$!")
for _ in $(seq 50); do [ -s "$T/hub.port" ] && break; sleep 0.1; done
[ -s "$T/hub.port" ] || { echo "El hub falso no arrancó" >&2; exit 1; }
printf 'HUB_URL=http://127.0.0.1:%s\nHOST_ID=prueba\nNOTIFY_TOKEN=TOKEN-PRUEBA\n' "$(cat "$T/hub.port")" \
    > "$XDG_CONFIG_HOME/tmux-web-bridge/notify.env"

# El reloj del script 150 s por delante: un cliente que acaba de conectarse lleva 150 s
# sin actividad. tmux solo cambia client_activity con pulsaciones de verdad.
cat > "$T/bin/date" <<EOF
#!/bin/sh
if [ "\$#" = 1 ] && [ "\$1" = "+%s" ]; then
    echo \$(( \$("$REAL_DATE" +%s) + 150 ))
else
    exec "$REAL_DATE" "\$@"
fi
EOF
chmod +x "$T/bin/date"

# macOS: Ghostty a la vista o no, según $T/ghostty. lsappinfo front da un ASN cualquiera
# y info dice qué app es; osascript nunca ve un quick terminal desplegado.
if [ "$OS" = Darwin ]; then
    mkdir -p "$T/mac"
    echo front > "$T/ghostty"
    cat > "$T/mac/lsappinfo" <<EOF
#!/bin/sh
case "\$1" in
    front) echo 'ASN:0x0-0x1:' ;;
    info)
        if [ "\$(cat "$T/ghostty")" = front ]; then
            echo '"CFBundleIdentifier"="com.mitchellh.ghostty"'
        else
            echo '"CFBundleIdentifier"="com.apple.finder"'
        fi ;;
esac
EOF
    printf '#!/bin/sh\necho false\n' > "$T/mac/osascript"
    chmod +x "$T/mac/lsappinfo" "$T/mac/osascript"
    export PATH="$T/mac:$PATH"
fi

FAILS=0
ok() { printf '\033[32m✓\033[0m %s\n' "$1"; }
ko() { printf '\033[31m✗\033[0m %s\n' "$1"; FAILS=$((FAILS + 1)); }
expect() {  # descripción salida patrón
    if printf '%s' "$2" | grep -qE "$3"; then ok "$1"; else ko "$1 — salió: $2"; fi
}

# ------------------------------------------------------------ escenario
# Un tmux nuevo por caso: la sesión main con dos ventanas; el panel que avisa es el de la 0.
new_server() {
    tm kill-server 2>/dev/null || true
    rm -rf /tmp/tmux-window-state-"$(id -u)"-"${SERVER_PID:-none}"
    tm new-session -d -s main -x 80 -y 24 -c "$HOME"
    tm new-window -d -t main
    tm select-window -t main:0
    PANE="$(tm display-message -p -t main:0 '#{pane_id}')"
    SERVER_PID="$(tm display-message -p '#{pid}')"
    TMUX_VALUE="$(tm display-message -p '#{socket_path}'),$SERVER_PID,0"
}

# Un cliente de tmux con su propio pty que se queda conectado. Uso: client <argumentos de tmux>
# (cada uno una palabra; las órdenes encadenadas, con un ';' suelto).
client() {
    if [ "$OS" = Darwin ]; then
        sleep 3600 2>/dev/null | script -q /dev/null tmux -L "$SOCKET" -f /dev/null "$@" >/dev/null 2>&1 &
    else
        sleep 3600 2>/dev/null | script -qfc "tmux -L $SOCKET -f /dev/null $(printf '%q ' "$@")" /dev/null >/dev/null 2>&1 &
    fi
    PIDS+=("$!")
}

# Espera a que haya $1 clientes conectados.
wait_clients() {
    for _ in $(seq 50); do
        [ "$(tm list-clients 2>/dev/null | wc -l)" -ge "$1" ] && return 0
        sleep 0.1
    done
    echo "No se conectaron $1 clientes de tmux" >&2
    exit 1
}

# Claude termina el turno en el panel: el hook Stop, con el reloj de $1 (real o adelantado)
# y el JSON del hook de $2. Deja en VIEWED lo que recibió el hub y en ICON el icono del
# panel. WAIT (décimas de segundo, 50 por defecto) es lo que espera al aviso: los casos
# que no esperan ninguno lo acortan.
finish() {
    local path="$PATH" before payload="${2:-$STOP_DONE}"
    [ "${1:-real}" = adelantado ] && path="$T/bin:$PATH"
    before="$(wc -l < "$T/hub.log")"
    printf '%s' "$payload" |
        env TMUX="$TMUX_VALUE" TMUX_PANE="$PANE" PATH="$path" "$KIT_SCRIPT" state done prueba
    for _ in $(seq "${WAIT:-50}"); do
        [ "$(wc -l < "$T/hub.log")" -gt "$before" ] && break
        sleep 0.1
    done
    if [ "$(wc -l < "$T/hub.log")" -gt "$before" ]; then
        VIEWED="$(tail -n 1 "$T/hub.log" | jq -r '"\(.host) \(.pane) viewed=\(.viewed)"' 2>/dev/null || echo 'aviso ilegible')"
    else
        VIEWED='sin aviso'
    fi
    ICON="$(tm show-options -p -t "$PANE" -qv @pane_icon)"
}

# El JSON del hook Stop. Claude Code (2.1.x) pasa background_tasks y session_crons:
# lo que sigue en segundo plano y lo que lo volverá a despertar. Los antiguos, ninguno.
STOP_DONE='{"last_assistant_message":"Listo"}'
STOP_EMPTY='{"last_assistant_message":"Listo","background_tasks":[],"session_crons":[]}'
STOP_SUBAGENT='{"last_assistant_message":"Espero al subagente","background_tasks":[{"id":"a1","type":"subagent","status":"running","description":"Revisar","agent_type":"Explore"}],"session_crons":[]}'
STOP_CRON='{"last_assistant_message":"Vuelvo en 20 min","background_tasks":[],"session_crons":[{"id":"c1","schedule":"*/20 * * * *","recurring":true,"prompt":"/loop"}]}'
STOP_SHELL='{"last_assistant_message":"Servidor arrancado","background_tasks":[{"id":"b1","type":"shell","status":"running","description":"pnpm dev","command":"pnpm dev"}],"session_crons":[]}'

# ------------------------------------------------------------ casos
echo "La terminal web del panel tiene delante el panel y acabas de escribir en ella"
new_server
client new-session -t main -s _tw-prueba \; select-window -t :0
wait_clients 1
finish
expect "…el aviso no va como visto" "$VIEWED" "^prueba $PANE viewed=false\$"
expect "…y el panel se queda con ✅" "$ICON" '^✅$'

echo "Una terminal de la máquina tiene delante el panel y acabas de usarla"
new_server
client attach -t main
wait_clients 1
finish
expect "…el aviso va como visto" "$VIEWED" "^prueba $PANE viewed=true\$"
expect "…y el panel pasa a 🤖" "$ICON" '^🤖$'

echo "Una terminal de la máquina tiene delante otra ventana de la misma sesión"
new_server
client attach -t main \; select-window -t :1
wait_clients 1
finish
expect "…el aviso no va como visto" "$VIEWED" "^prueba $PANE viewed=false\$"
expect "…y el panel se queda con ✅" "$ICON" '^✅$'

# No lo estás viendo aunque la terminal tenga el panel delante. En Linux, porque lleva
# 150 s sin usarse; en macOS, porque Ghostty no está a la vista.
if [ "$OS" = Darwin ]; then
    echo "Una terminal de la máquina tiene delante el panel, pero Ghostty no está a la vista"
else
    echo "Una terminal de la máquina tiene delante el panel, pero lleva 150 s sin usarse"
fi
new_server
client attach -t main
wait_clients 1
if [ "$OS" = Darwin ]; then
    echo oculto > "$T/ghostty"
    finish
    echo front > "$T/ghostty"
else
    finish adelantado
fi
expect "…el aviso no va como visto" "$VIEWED" "^prueba $PANE viewed=false\$"

# Fin de turno con trabajo en segundo plano que despertará a Claude: es una pausa. El panel
# está abierto solo en la terminal web, así que un final de verdad sí avisaría.
web_terminal() {
    new_server
    client new-session -t main -s _tw-prueba \; select-window -t :0
    wait_clients 1
}

echo "Claude cierra el turno con un subagente en segundo plano"
web_terminal
WAIT=20 finish real "$STOP_SUBAGENT"
expect "…no avisa al hub" "$VIEWED" '^sin aviso$'
expect "…y el panel sigue con 🔨" "$ICON" '^🔨$'

echo "Claude cierra el turno con un /loop programado y nada en segundo plano"
web_terminal
WAIT=20 finish real "$STOP_CRON"
expect "…no avisa al hub" "$VIEWED" '^sin aviso$'
expect "…y el panel sigue con 🔨" "$ICON" '^🔨$'

echo "Claude cierra el turno con solo un comando shell en segundo plano (un servidor)"
web_terminal
finish real "$STOP_SHELL"
expect "…avisa al hub, no como visto" "$VIEWED" "^prueba $PANE viewed=false\$"
expect "…y el panel pasa a ✅" "$ICON" '^✅$'

echo "Claude cierra el turno sin nada en segundo plano ni programado"
web_terminal
finish real "$STOP_EMPTY"
expect "…avisa al hub, no como visto" "$VIEWED" "^prueba $PANE viewed=false\$"
expect "…y el panel pasa a ✅" "$ICON" '^✅$'

# Lo que Claude Code mete en background_tasks y nunca lo despierta: su propio trabajo
# (dream, la consolidación de memoria; auto-mode scan) y un tipo que el kit no conoce.
STOP_INTERNAL='{"last_assistant_message":"Listo","background_tasks":[{"id":"d1","type":"dream","status":"running","description":"dreaming"},{"id":"m1","type":"auto-mode scan","status":"running","description":"scanning for auto-mode setup"},{"id":"b1","type":"shell","status":"running","description":"pnpm dev","command":"pnpm dev"}],"session_crons":[]}'
STOP_UNKNOWN='{"last_assistant_message":"Listo","background_tasks":[{"id":"x1","type":"future-thing","status":"running","description":"algo nuevo"}],"session_crons":[]}'

echo "Claude cierra el turno con solo trabajo interno de Claude Code (dream, auto-mode scan) y un shell"
web_terminal
finish real "$STOP_INTERNAL"
expect "…avisa al hub, no como visto" "$VIEWED" "^prueba $PANE viewed=false\$"
expect "…y el panel pasa a ✅" "$ICON" '^✅$'

echo "Claude cierra el turno con solo una tarea de un tipo que el kit no conoce"
web_terminal
finish real "$STOP_UNKNOWN"
expect "…avisa al hub, no como visto" "$VIEWED" "^prueba $PANE viewed=false\$"
expect "…y el panel pasa a ✅" "$ICON" '^✅$'

# Los demás tipos que sí despiertan a Claude (subagent ya tiene su caso arriba).
for kind in workflow monitor teammate "cloud session" "MCP task"; do
    echo "Claude cierra el turno con una tarea «${kind}» en segundo plano"
    web_terminal
    WAIT=20 finish real "{\"last_assistant_message\":\"Espero\",\"background_tasks\":[{\"id\":\"w1\",\"type\":\"$kind\",\"status\":\"running\",\"description\":\"tarea\"}],\"session_crons\":[]}"
    expect "…no avisa al hub" "$VIEWED" '^sin aviso$'
    expect "…y el panel sigue con 🔨" "$ICON" '^🔨$'
done

echo "Claude espera a un subagente y, cuando acaba, termina de verdad"
web_terminal
avisos_antes="$(wc -l < "$T/hub.log")"
WAIT=20 finish real "$STOP_SUBAGENT"
finish real "$STOP_EMPTY"
expect "…el hub recibe un solo aviso" "$(( $(wc -l < "$T/hub.log") - avisos_antes ))" '^1$'
expect "…no como visto" "$VIEWED" "^prueba $PANE viewed=false\$"
expect "…y el panel pasa a ✅" "$ICON" '^✅$'

# Lo que retuvo cada pausa queda en <pane>.pause, junto al estado del panel: solo lo que
# despierta a Claude, sin el texto de su respuesta.
STOP_MIXED='{"last_assistant_message":"Texto de la respuesta","background_tasks":[{"id":"a1","type":"subagent","status":"running","description":"Revisar","agent_type":"Explore"},{"id":"b1","type":"shell","status":"running","description":"pnpm dev","command":"pnpm dev"}],"session_crons":[{"id":"c1","schedule":"*/20 * * * *","recurring":true,"prompt":"/loop"}]}'
pause_file() { printf '%s' "/tmp/tmux-window-state-$(id -u)-$SERVER_PID/$PANE.pause"; }

echo "Claude cierra el turno con un subagente, un shell y un /loop"
web_terminal
WAIT=20 finish real "$STOP_MIXED"
expect "…el registro de la pausa lista el subagente y el /loop, no el shell" \
    "$(jq -r '[.background_tasks[].id, .session_crons[].id] | join(",")' "$(pause_file)" 2>/dev/null || echo 'sin registro')" '^a1,c1$'
expect "…y no guarda el texto de la respuesta" \
    "$(grep -c 'Texto de la respuesta' "$(pause_file)" 2>/dev/null || true)" '^0$'
finish real "$STOP_EMPTY"
expect "…cuando termina de verdad, el registro desaparece" \
    "$([ -e "$(pause_file)" ] && echo 'sigue' || echo 'no está')" '^no está$'

echo "Claude cierra el turno con un subagente y luego se cierra su sesión"
web_terminal
WAIT=20 finish real "$STOP_SUBAGENT"
expect "…la pausa deja registro" "$([ -e "$(pause_file)" ] && echo 'está' || echo 'no está')" '^está$'
env TMUX="$TMUX_VALUE" TMUX_PANE="$PANE" "$KIT_SCRIPT" clear </dev/null
expect "…al cerrarse la sesión, el registro desaparece" \
    "$([ -e "$(pause_file)" ] && echo 'sigue' || echo 'no está')" '^no está$'

echo "El tmux del socket por defecto"
expect "…sigue con su sesión y sin iconos del kit" \
    "$(tmux list-sessions -F '#{session_name}' 2>/dev/null)|$(tmux show-options -p -t centinela -qv @pane_icon 2>/dev/null)" '^centinela[|]$'

echo
if [ "$FAILS" = 0 ]; then echo "Todo bien."; else echo "$FAILS comprobaciones fallidas (KEEP=1 para conservar $T)."; exit 1; fi
