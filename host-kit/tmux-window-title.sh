#!/bin/bash
# Título de las ventanas de tmux: nombre + icono de estado (y el icono de cada espacio).
#
# Separa dos conceptos que antes se pisaban entre sí:
#   - NOMBRE de la ventana: lo pone el usuario (prefix + r, queda "fijado") o,
#     si no está fijado, lo pone el panel activo (proyecto de Claude, host SSH)
#     o el automatic-rename de tmux.
#   - ICONO de estado (@win_icon): estado más urgente de CUALQUIER panel de la
#     ventana (🙋 pregunta > 💬 atención > ✅ terminado sin ver > 🔨 trabajando >
#     🤖 sesión > 📡 ssh). Se pinta en la statusline, nunca forma parte del
#     nombre, así que jamás pisa el nombre fijado.
# Además, cada sesión (espacio) recibe @space_icon: el más urgente de sus ventanas.
#
# Uso:
#   tmux-window-title.sh refresh [window-id]   recalcula nombre e icono
#   tmux-window-title.sh refresh-all           recalcula todas las ventanas
#   tmux-window-title.sh state <estado> [nombre]   marca el estado del panel actual
#   tmux-window-title.sh start [nombre]        inicio de Claude: estado claude + session_id (JSON por stdin);
#                                              tras compactar conserva el estado que tenía
#   tmux-window-title.sh tool <pre|post> [nombre]  Claude usa una herramienta (JSON por stdin): 🔨
#   tmux-window-title.sh focus <pane-id>       el panel recibe foco: ✅ pasa a 🤖
#   tmux-window-title.sh clear                 borra el estado del panel actual
#   tmux-window-title.sh rename <window-id> [nombre]   fija el nombre (vacío = automático)
#   tmux-window-title.sh jump <socket> <pane-id>  clic en una notificación: salta al panel
#   tmux-window-title.sh reload <pane-id>      relanza el panel: shell nueva (recarga .zshrc) y,
#                                              si tenía un Claude, lo reanuda con su conversación
#   tmux-window-title.sh close <pane|window|session> <id> [cliente]
#                                              cierra; si hay un Claude dentro, antes pregunta en un
#                                              popup con su session_id y copia cómo reanudarlo
#   tmux-window-title.sh wrap-kill-keys        los atajos que cierran a pelo pasan por close
#
# Avisos al móvil: si existe ~/.config/tmux-web-bridge/notify.env (HUB_URL,
# HOST_ID, NOTIFY_TOKEN), cada pregunta/atención/terminado se envía también al
# servidor central de tmux-web-bridge, que decide si manda una notificación push.
#
# Funciona en macOS (notificación local con terminal-notifier y Ghostty) y en
# Linux/WSL (sin notificación local: solo el aviso al servidor central).
#
# Estados: question | attention | done | busy | claude | ssh
#
# Lo invocan: los hooks de ~/.tmux.conf, los hooks de Claude Code
# (~/.claude/settings.json) y el wrapper ssh de ~/.zshrc.

set -u

# Clic en una notificación (lo ejecuta terminal-notifier, fuera de tmux): tmux
# salta al panel y Ghostty se muestra. Si hay quick terminal (el terminal que
# no pertenece a ninguna ventana) se enfoca ese, lo que lo despliega si estaba
# oculto; si no, se activa Ghostty sin más.
if [ "${1:-}" = "jump" ]; then
    socket="${2:-}" pane="${3:-}"
    PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
    tmux -S "$socket" switch-client -t "$pane" \; select-window -t "$pane" \; select-pane -t "$pane" 2>/dev/null
    [ "$(uname -s)" = "Darwin" ] || exit 0
    osascript >/dev/null 2>&1 <<'EOF'
tell application "Ghostty"
    set inWindows to {}
    repeat with w in windows
        set inWindows to inWindows & (id of terminals of w)
    end repeat
    repeat with t in terminals
        if inWindows does not contain (id of t) then
            focus t
            return
        end if
    end repeat
    activate
end tell
EOF
    exit 0
fi

# Fuera de tmux no hay nada que hacer (hooks de Claude en una terminal suelta).
[ -n "${TMUX:-}" ] || exit 0

# Un directorio por servidor tmux, para que los ids de panel (%1, %2...) de un
# servidor anterior no se confundan con los actuales. Cada fichero contiene
# "<estado>\t<nombre>\t<session_id de Claude>".
STATE_DIR="/tmp/tmux-window-state-$(id -u)-$(printf '%s' "$TMUX" | cut -d, -f2)"

# Notificador: la copia con el icono de Claude Code (claude-notifier-build.sh)
# o, si no existe, el terminal-notifier de brew. Vacío = osascript.
# Fuera de macOS no hay notificación local (solo el aviso al servidor central).
IS_MAC=0
[ "$(uname -s)" = "Darwin" ] && IS_MAC=1
NOTIFIER=""
if [ "$IS_MAC" = 1 ]; then
    NOTIFIER="$HOME/Applications/Claude Code Notify.app/Contents/MacOS/terminal-notifier"
    [ -x "$NOTIFIER" ] || NOTIFIER="$(command -v terminal-notifier 2>/dev/null || true)"
fi

# Servidor central de tmux-web-bridge (avisos push al móvil). Sin este fichero, nada.
HUB_ENV="${XDG_CONFIG_HOME:-$HOME/.config}/tmux-web-bridge/notify.env"

icon_for() {
    case "$1" in
        question)  printf '🙋' ;;
        attention) printf '💬' ;;
        done)      printf '✅' ;;
        busy)      printf '🔨' ;;
        claude)    printf '🤖' ;;
        ssh)       printf '📡' ;;
    esac
}

prio_for() {
    case "$1" in
        question)  echo 60 ;;
        attention) echo 50 ;;
        done)      echo 40 ;;
        busy)      echo 30 ;;
        claude)    echo 20 ;;
        ssh)       echo 10 ;;
        *)         echo 0  ;;
    esac
}

# Destino de una línea de comandos ssh: primer argumento que no es una opción
# (ni el valor de una). ps(1) pierde los límites entre argumentos, así que un
# valor con espacios (-o ProxyCommand="sleep 8") descuadra el conteo: se
# descartan además los tokens que no pueden ser un destino (clave=valor,
# números sueltos).
ssh_dest_from_cmdline() {
    echo "$1" | awk '{
        for (i = 2; i <= NF; i++) {
            if ($i ~ /^-/) { if ($i ~ /^-[bcDEeFIiJLlmOopQRSWw]$/) i++; continue }
            if ($i ~ /=/ || $i ~ /^[0-9]+$/) continue
            print $i; exit
        }
    }'
}

# Host de la sesión ssh que cuelga de un pid de panel, vacío si no hay ninguna.
ssh_host_for_pid() {
    local pane_pid="$1" cmd child
    cmd="$(ps -o args= -p "$pane_pid" 2>/dev/null)"
    if [[ "$cmd" != ssh\ * && "$cmd" != ssh ]]; then
        child="$(pgrep -P "$pane_pid" -x ssh 2>/dev/null | head -1)"
        if [ -n "$child" ]; then cmd="$(ps -o args= -p "$child" 2>/dev/null)"; else cmd=""; fi
    fi
    [ -n "$cmd" ] || return 0
    ssh_dest_from_cmdline "$cmd"
}

# Estado de un panel: "<estado>\t<nombre>" desde su fichero, o detección de ssh.
state_of_pane() {
    local pane="$1" pane_pid="$2" state name host
    if [ -f "$STATE_DIR/$pane" ]; then
        IFS=$'\t' read -r state name _ < "$STATE_DIR/$pane"
        [ -n "${state:-}" ] && printf '%s\t%s' "$state" "${name:-}"
        return 0
    fi
    host="$(ssh_host_for_pid "$pane_pid")"
    [ -n "$host" ] && printf 'ssh\t%s' "$host"
}

# Icono del espacio (sesión): el estado más urgente de todas sus ventanas.
refresh_space() {
    local sess="$1" top_prio=0 top_state="" state prio
    [ -n "$sess" ] || return 0
    while read -r state; do
        [ -n "$state" ] || continue
        prio="$(prio_for "$state")"
        if [ "$prio" -gt "$top_prio" ]; then top_prio="$prio"; top_state="$state"; fi
    done < <(tmux list-windows -t "$sess" -F '#{@win_state}' 2>/dev/null)

    if [ -n "$top_state" ]; then
        tmux set-option -t "$sess" @space_icon "$(icon_for "$top_state")" 2>/dev/null
    else
        tmux set-option -t "$sess" -u @space_icon 2>/dev/null
    fi
}

# Recalcula nombre e icono de una ventana. Con "nospace" no toca el icono del espacio
# (refresh-all lo recalcula una sola vez por sesión al final).
cmd_refresh() {
    local win="${1:-}" nospace="${2:-}"
    [ -n "$win" ] || win="$(tmux display-message -p '#{window_id}' 2>/dev/null)"
    [ -n "$win" ] || return 0

    local top_prio=0 top_state="" active_name="" pane pane_pid active entry state name prio sid

    while read -r pane pane_pid active; do
        entry="$(state_of_pane "$pane" "$pane_pid")"
        if [ -z "$entry" ]; then
            tmux set-option -p -t "$pane" -u @pane_icon 2>/dev/null
            tmux set-option -p -t "$pane" -u @claude_session 2>/dev/null
            continue
        fi
        IFS=$'\t' read -r state name <<< "$entry"
        tmux set-option -p -t "$pane" @pane_icon "$(icon_for "$state")" 2>/dev/null
        # El id de la conversación, para el panel web (cerrar y reanudar luego).
        sid=""
        [ "$state" != "ssh" ] && [ -f "$STATE_DIR/$pane" ] && IFS=$'\t' read -r _ _ sid < "$STATE_DIR/$pane"
        if [ -n "$sid" ]; then
            tmux set-option -p -t "$pane" @claude_session "$sid" 2>/dev/null
        else
            tmux set-option -p -t "$pane" -u @claude_session 2>/dev/null
        fi
        prio="$(prio_for "$state")"
        if [ "$prio" -gt "$top_prio" ]; then
            top_prio="$prio"
            top_state="$state"
        fi
        # El nombre lo manda el panel activo: el título sigue tu foco.
        [ "$active" = "1" ] && active_name="$name"
    done < <(tmux list-panes -t "$win" -F '#{pane_id} #{pane_pid} #{pane_active}' 2>/dev/null)

    if [ -n "$top_state" ]; then
        tmux set-option -w -t "$win" @win_icon "$(icon_for "$top_state")" 2>/dev/null
        tmux set-option -w -t "$win" @win_state "$top_state" 2>/dev/null
    else
        tmux set-option -w -t "$win" -u @win_icon 2>/dev/null
        tmux set-option -w -t "$win" -u @win_state 2>/dev/null
    fi

    [ -n "$nospace" ] || refresh_space "$(tmux display-message -p -t "$win" '#{session_id}' 2>/dev/null)"

    # Nombre fijado por el usuario: intocable.
    [ "$(tmux show-options -w -t "$win" -qv @name_pinned 2>/dev/null)" = "1" ] && return 0

    if [ -n "$active_name" ]; then
        tmux rename-window -t "$win" "$active_name" 2>/dev/null
    else
        tmux set-window-option -t "$win" automatic-rename on 2>/dev/null
    fi
}

cmd_refresh_all() {
    local win sess
    while read -r win; do
        cmd_refresh "$win" nospace
    done < <(tmux list-windows -a -F '#{window_id}' 2>/dev/null | sort -u)
    while read -r sess; do
        refresh_space "$sess"
    done < <(tmux list-sessions -F '#{session_id}' 2>/dev/null)
}

# ¿Tienes delante este panel? (activo, en la ventana activa, de una sesión con cliente)
pane_is_viewed() {
    [ "$(tmux display-message -p -t "$1" '#{&&:#{pane_active},#{&&:#{window_active},#{session_attached}}}' 2>/dev/null)" = "1" ]
}

# ¿Está Ghostty en primer plano?
# ¿Ves Ghostty? Al frente, o con el quick terminal desplegado: este no activa
# Ghostty (la app al frente sigue siendo la de debajo), así que se busca su
# ventana flotante (capa > 0) entre las que hay en pantalla.
ghostty_is_visible() {
    lsappinfo info -only bundleid "$(lsappinfo front)" 2>/dev/null | grep -q 'com.mitchellh.ghostty' && return 0
    [ "$(osascript -l JavaScript -e '
        ObjC.import("CoreGraphics");
        ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1, 0)))
            .some(w => w.kCGWindowOwnerName === "Ghostty" && w.kCGWindowLayer > 0)' 2>/dev/null)" = "true" ]
}

# ¿Estás delante de la terminal? En macOS, Ghostty a la vista. En Linux/WSL no
# hay forma de saberlo: cuenta como "sí" si algún cliente de tmux conectado a
# esa sesión (incluido el panel web) ha tenido actividad en los últimos 2 minutos.
user_is_looking() {
    local pane="$1" now act
    if [ "$IS_MAC" = 1 ]; then
        ghostty_is_visible
        return
    fi
    now="$(date +%s)"
    while read -r act; do
        [ -n "$act" ] && [ $((now - act)) -lt 120 ] && return 0
    done < <(tmux list-clients -t "$(tmux display-message -p -t "$pane" '#{session_id}' 2>/dev/null)" -F '#{client_activity}' 2>/dev/null)
    return 1
}

# Aviso al servidor central (en segundo plano, nunca bloquea el hook de Claude).
# Uso: hub_notify <pane> <estado> <visto 0|1> <título> <mensaje>
hub_notify() {
    [ -r "$HUB_ENV" ] || return 0
    command -v curl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1 || return 0
    (
        # shellcheck disable=SC1090
        . "$HUB_ENV"
        [ -n "${HUB_URL:-}" ] && [ -n "${HOST_ID:-}" ] || exit 0
        viewed="$3"
        # En macOS, si estás usando el Mac (actividad de teclado/ratón reciente)
        # basta con la notificación local: no se avisa también al móvil.
        if [ "$viewed" = 0 ] && [ "$IS_MAC" = 1 ] && [ "${PUSH_MIN_IDLE:-0}" -gt 0 ]; then
            idle="$(ioreg -c IOHIDSystem 2>/dev/null | awk '/HIDIdleTime/ {print int($NF / 1000000000); exit}')"
            [ -n "$idle" ] && [ "$idle" -lt "$PUSH_MIN_IDLE" ] && viewed=1
        fi
        jq -n --arg host "$HOST_ID" --arg pane "$1" --arg state "$2" --arg viewed "$viewed" --arg title "$4" --arg message "$5" \
            '{host: $host, pane: $pane, state: $state, viewed: ($viewed == "1"), title: $title, message: $message}' |
            curl -fsS -m 5 -X POST -H "Authorization: Bearer ${NOTIFY_TOKEN:-}" -H 'Content-Type: application/json' \
                --data @- "${HUB_URL%/}/api/notify" >/dev/null 2>&1
    ) &
}

# Texto de la notificación según el evento de Claude (JSON del hook en $1):
# la pregunta, el mensaje de permiso o el inicio de la última respuesta.
notify_preview() {
    local state="$1" payload="$2" text="" transcript
    [ -n "$payload" ] || return 0
    case "$state" in
        question)
            text="$(jq -r 'if .tool_name == "ExitPlanMode" then "Plan listo para revisar"
                           else .tool_input.questions[0].question // empty end' <<< "$payload" 2>/dev/null)" ;;
        attention)
            text="$(jq -r '.message // empty' <<< "$payload" 2>/dev/null)" ;;
        done)
            text="$(jq -r '.last_assistant_message // empty' <<< "$payload" 2>/dev/null)"
            if [ -z "$text" ]; then
                transcript="$(jq -r '.transcript_path // empty' <<< "$payload" 2>/dev/null)"
                [ -f "$transcript" ] && text="$(tail -n 200 "$transcript" | jq -rs '
                    [.[] | select(.type == "assistant") | .message.content[]? | select(.type == "text") | .text]
                    | last // empty' 2>/dev/null)"
            fi ;;
    esac
    # Una sola línea, sin marcas de Markdown, recortada.
    printf '%s' "$text" | tr '\n\t' '  ' | sed -E 's/[*`#>]+//g; s/  +/ /g; s/^ //' | cut -c1-200
}

# Notificación de macOS para el panel, salvo que lo tengas delante. Al pulsarla
# trae Ghostty al frente y salta a ese panel. Agrupada por panel: la nueva
# sustituye a la anterior del mismo Claude.
notify() {
    local pane="$1" state="$2" payload="$3" label sound title message
    if pane_is_viewed "$pane" && user_is_looking "$pane"; then
        # Lo estás viendo: el servidor central tampoco debe avisar al móvil.
        hub_notify "$pane" "$state" 1 "" ""
        return 0
    fi
    case "$state" in
        question)  label="Pregunta";        sound="Submarine" ;;
        attention) label="Necesita atención"; sound="Submarine" ;;
        done)      label="Terminado";       sound="Glass" ;;
        *)         return 0 ;;
    esac
    title="$(icon_for "$state") $(tmux display-message -p -t "$pane" '#W [#S]' 2>/dev/null)"
    message="$(notify_preview "$state" "$payload")"
    [ -n "$message" ] || message="$label"

    hub_notify "$pane" "$state" 0 "$title" "$message"
    [ "$IS_MAC" = 1 ] || { : > "$STATE_DIR/$pane.notified"; return 0; }

    if [ -n "$NOTIFIER" ]; then
        "$NOTIFIER" -title "$title" -message "$message" -sound "$sound" \
            -group "claude-tmux-$pane" -execute "'$HOME/.scripts/tmux-window-title.sh' jump '${TMUX%%,*}' '$pane'" >/dev/null 2>&1 &
    else
        osascript - "$title" "$message" "$sound" >/dev/null 2>&1 <<'EOF' &
on run argv
    display notification (item 2 of argv) with title (item 1 of argv) sound name (item 3 of argv)
end run
EOF
    fi
    : > "$STATE_DIR/$pane.notified"
}

# Retira la notificación pendiente del panel (ya lo has visto o ya has respondido).
notify_clear() {
    local pane="$1"
    [ -f "$STATE_DIR/$pane.notified" ] || return 0
    rm -f "$STATE_DIR/$pane.notified"
    [ -n "$NOTIFIER" ] && "$NOTIFIER" -remove "claude-tmux-$pane" >/dev/null 2>&1 &
}

# Un solo cambio de estado a la vez por servidor tmux: dos hooks a la vez (dos Claude en
# un espacio, herramientas en paralelo) leerían iconos a medio escribir y el último en
# escribir dejaría uno viejo en la ventana o en el espacio. mkdir es atómico en macOS y en
# Linux (flock no viene en macOS). Un candado de más de 2 s es de un proceso que murió.
lock() {
    local dir="$STATE_DIR/.lock" tries=0
    mkdir -p "$STATE_DIR"
    until mkdir "$dir" 2>/dev/null; do
        tries=$((tries + 1))
        if [ "$tries" -ge 100 ]; then
            rm -rf "$dir"
            tries=0
        fi
        sleep 0.02
    done
    trap 'rmdir "$STATE_DIR/.lock" 2>/dev/null' EXIT
}

write_state() {
    local pane="$1" state="$2" name="$3" sid="$4"
    mkdir -p "$STATE_DIR"
    printf '%s\t%s\t%s\n' "$state" "$name" "$sid" > "$STATE_DIR/$pane"
}

cmd_state() {
    local state="$1" name="${2:-}" old_state="" old_sid="" payload="" event
    [ -n "${TMUX_PANE:-}" ] || return 0
    [ -f "$STATE_DIR/$TMUX_PANE" ] && IFS=$'\t' read -r old_state _ old_sid < "$STATE_DIR/$TMUX_PANE"
    # JSON del hook de Claude (para el texto de la notificación).
    payload="$PAYLOAD"
    event="$state"

    # Claude lanza también una Notification al hacer una pregunta: no debe
    # rebajar 🙋 a 💬 (ni volver a notificar). La pregunta la limpia PostToolUse al responder.
    if [ "$state" = "attention" ] && [ "${old_state:-}" = "question" ]; then
        state="question"; event=""
    fi
    # Terminado: si lo estás viendo no hay nada pendiente de ver.
    [ "$state" = "done" ] && pane_is_viewed "$TMUX_PANE" && state="claude"

    write_state "$TMUX_PANE" "$state" "$name" "${old_sid:-}"
    # Cuándo empezó a esperar el permiso (lo mira cmd_tool).
    [ "$state" = "attention" ] && [ "${old_state:-}" != "attention" ] && date +%s > "$STATE_DIR/$TMUX_PANE.since"
    cmd_refresh "$(tmux display-message -p -t "$TMUX_PANE" '#{window_id}' 2>/dev/null)"

    case "$event" in
        question|attention|done) notify "$TMUX_PANE" "$event" "$payload" ;;
        busy)                    notify_clear "$TMUX_PANE" ;;
    esac
}

# SessionStart de Claude: el JSON del hook llega por stdin; se guarda su
# session_id para poder reanudar la conversación exacta al restaurar tmux.
cmd_start() {
    local name="${1:-}" sid="" source="" state=""
    [ -n "${TMUX_PANE:-}" ] || return 0
    if [ -n "$PAYLOAD" ]; then
        sid="$(jq -r '.session_id // empty' <<< "$PAYLOAD" 2>/dev/null)"
        source="$(jq -r '.source // empty' <<< "$PAYLOAD" 2>/dev/null)"
    fi
    # Tras compactar (a mano, o sola a mitad de una tarea) Claude sigue con lo que estaba:
    # no vuelve a 🤖 si estaba trabajando o esperándote.
    [ "$source" = "compact" ] && [ -f "$STATE_DIR/$TMUX_PANE" ] && IFS=$'\t' read -r state _ < "$STATE_DIR/$TMUX_PANE"
    write_state "$TMUX_PANE" "${state:-claude}" "$name" "$sid"
    cmd_refresh "$(tmux display-message -p -t "$TMUX_PANE" '#{window_id}' 2>/dev/null)"
}

# Claude usa una herramienta (hooks PreToolUse y PostToolUse de todas): está trabajando.
# Cubre lo que no empieza con un mensaje tuyo (sigue solo tras una tarea en segundo plano,
# un subagente o un /loop, o tras compactar) y la vuelta al trabajo tras aprobar un permiso,
# que no tiene hook propio. AskUserQuestion y ExitPlanMode abren y cierran la pregunta 🙋.
cmd_tool() {
    local phase="${1:-}" name="${2:-}" tool="" state="" since started
    [ -n "${TMUX_PANE:-}" ] || return 0
    [[ "$PAYLOAD" =~ \"tool_name\"[[:space:]]*:[[:space:]]*\"([^\"]*)\" ]] && tool="${BASH_REMATCH[1]}"
    case "$tool" in
        AskUserQuestion|ExitPlanMode)
            if [ "$phase" = "pre" ]; then cmd_state question "$name"; else cmd_state busy "$name"; fi
            return 0 ;;
    esac
    [ -f "$STATE_DIR/$TMUX_PANE" ] && IFS=$'\t' read -r state _ < "$STATE_DIR/$TMUX_PANE"
    case "$state" in
        # Ya trabajando (lo más frecuente: no se toca nada). Una pregunta solo la cierra su respuesta.
        busy|question) return 0 ;;
        attention)
            # Con herramientas en paralelo, la que termina puede haber empezado antes de pedir
            # el permiso, que sigue pendiente. Solo cuenta si empezó después del aviso, que
            # Claude da unos segundos después de mostrar el permiso.
            if [ "$phase" = "post" ] && [[ "$PAYLOAD" =~ \"duration_ms\"[[:space:]]*:[[:space:]]*([0-9]+) ]]; then
                since="$(cat "$STATE_DIR/$TMUX_PANE.since" 2>/dev/null)"
                started=$(( $(date +%s) - BASH_REMATCH[1] / 1000 ))
                [ -n "$since" ] && [ "$started" -lt "$((since - 1))" ] && return 0
            fi ;;
    esac
    cmd_state busy "$name"
}

cmd_focus() {
    local pane="${1:-}" state name sid
    [ -n "$pane" ] || return 0
    if [ -f "$STATE_DIR/$pane" ]; then
        IFS=$'\t' read -r state name sid < "$STATE_DIR/$pane"
        [ "${state:-}" = "done" ] && write_state "$pane" claude "${name:-}" "${sid:-}"
    fi
    notify_clear "$pane"
    cmd_refresh "$(tmux display-message -p -t "$pane" '#{window_id}' 2>/dev/null)"
}

cmd_clear() {
    [ -n "${TMUX_PANE:-}" ] || return 0
    notify_clear "$TMUX_PANE"
    rm -f "$STATE_DIR/$TMUX_PANE" "$STATE_DIR/$TMUX_PANE.since"
    cmd_refresh "$(tmux display-message -p -t "$TMUX_PANE" '#{window_id}' 2>/dev/null)"
}

cmd_rename() {
    local win="$1" name="${2:-}"
    if [ -z "$name" ]; then
        tmux set-option -w -t "$win" -u @name_pinned 2>/dev/null
        tmux set-window-option -t "$win" automatic-rename on 2>/dev/null
        tmux display-message "Nombre de ventana: automático"
        cmd_refresh "$win"
    else
        tmux rename-window -t "$win" "$name" 2>/dev/null
        tmux set-option -w -t "$win" @name_pinned 1 2>/dev/null
        cmd_refresh "$win"
    fi
}

# Directorio desde el que se reanuda una conversación de Claude. Claude la guarda bajo
# el directorio en que arrancó (~/.claude/projects/<ruta>/<id>.jsonl) y `--resume` solo
# la busca en el de la carpeta actual: si luego entró en un worktree, el panel está en el
# worktree y desde ahí no la encuentra. Reanudada desde el original, Claude vuelve él
# solo al worktree. Si no se encuentra la conversación, la ruta que se le pasa.
session_dir() {
    local sid="$1" fallback="$2" file dir=""
    if [ -n "$sid" ] && [ "$sid" != "-" ]; then
        for file in "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/projects/*/"$sid".jsonl; do
            [ -f "$file" ] || continue
            dir="$(grep -m 1 '"cwd":"' "$file" | jq -r '.cwd // empty' 2>/dev/null)"
            break
        done
    fi
    if [ -n "$dir" ] && [ -d "$dir" ]; then printf '%s' "$dir"; else printf '%s' "$fallback"; fi
}

# Relanza un panel (botón «Recargar ventana» del panel web): mata lo que corre en él y
# arranca la shell por defecto en el mismo directorio, que vuelve a leer .zshrc. Si el
# panel tenía un Claude, la shell nueva lo reanuda con su conversación (claude --resume,
# como la restauración de tmux-resurrect) y, al salir de él, deja otra shell limpia.
# El modo, elegido en el diálogo: «auto» (--permission-mode auto) o «skip»
# (--dangerously-skip-permissions); sin él, Claude arranca con su modo por defecto.
cmd_reload() {
    local pane="${1:-}" mode="${2:-}" state="" name="" sid="" cmd dir shell claude resume=""
    [ -n "$pane" ] || return 0
    cmd="$(tmux display-message -p -t "$pane" '#{pane_current_command}' 2>/dev/null)" || return 0
    dir="$(tmux display-message -p -t "$pane" '#{pane_current_path}' 2>/dev/null)"
    shell="$(tmux show-options -gqv default-shell 2>/dev/null)"
    [ -n "$shell" ] || shell="${SHELL:-/bin/sh}"
    claude="${TMUX_WEB_CLAUDE_CMD:-claude}"
    case "$mode" in
        auto) claude="$claude --permission-mode auto" ;;
        skip) claude="$claude --dangerously-skip-permissions" ;;
    esac
    [ -f "$STATE_DIR/$pane" ] && IFS=$'\t' read -r state name sid < "$STATE_DIR/$pane"

    if [ -n "${sid:-}" ] && [ "${state:-}" != "ssh" ]; then
        resume="$claude --resume $sid"
        dir="$(session_dir "$sid" "$dir")"
    elif [[ "$cmd" =~ ^[0-9]+\.[0-9]+\.[0-9]+ || "$cmd" == claude ]]; then
        # Un Claude sin session_id guardado: la conversación más reciente de ese directorio.
        resume="$claude --continue"
    fi

    # El Claude nuevo vuelve a escribir su estado al arrancar (hook SessionStart).
    rm -f "$STATE_DIR/$pane" "$STATE_DIR/$pane.notified" "$STATE_DIR/$pane.since"
    if [ -n "$resume" ]; then
        tmux respawn-pane -k -t "$pane" -c "$dir" "$shell" -ic "$resume; exec $(printf '%q' "$shell")"
    else
        tmux respawn-pane -k -t "$pane" -c "$dir"
    fi
    cmd_refresh "$(tmux display-message -p -t "$pane" '#{window_id}' 2>/dev/null)"
}

# ------------------------------------------------------------ cerrar con Claude abierto
# tmux no tiene un hook que pueda cancelar un cierre: los atajos que cierran paneles,
# ventanas y espacios pasan por `close`, que cierra sin más si no hay ningún Claude y,
# si lo hay, lo cuenta en un popup con el comando para reanudar cada conversación.

SELF="$HOME/.scripts/tmux-window-title.sh"

# ~ en vez de $HOME y el resto escapado, para pegarlo en una shell.
shell_path() {
    local p="$1"
    if [ "$p" = "$HOME" ]; then printf '~'
    elif [[ "$p" == "$HOME"/* ]]; then printf '~/%q' "${p#"$HOME"/}"
    else printf '%q' "$p"
    fi
}

# Los Claude de lo que se va a cerrar, uno por línea:
# "<pane_id>\t<estado>\t<nombre>\t<session_id>\t<ventana>\t<panel>\t<ruta>".
# Un Claude que no guardó su session_id va con el id "-" (se reanuda con --continue).
claude_panes() {
    local kind="$1" target="$2" pane cmd win_idx pane_idx path state name sid scope=()
    case "$kind" in
        pane)    scope=(-t "$target" -f "#{==:#{pane_id},$target}") ;;
        window)  scope=(-t "$target") ;;
        session) scope=(-s -t "$target") ;;
        *)       return 0 ;;
    esac
    while IFS=$'\t' read -r pane cmd win_idx pane_idx path; do
        state="" name="" sid=""
        [ -f "$STATE_DIR/$pane" ] && IFS=$'\t' read -r state name sid < "$STATE_DIR/$pane"
        if [ -n "$state" ] && [ "$state" != "ssh" ]; then
            :
        elif [[ "$cmd" =~ ^[0-9]+\.[0-9]+\.[0-9]+ || "$cmd" == claude ]]; then
            state="claude" name="" sid=""
        else
            continue
        fi
        # "-" por id vacío: dos tabuladores seguidos se leen como uno.
        printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$pane" "$state" "${name:-$(basename "$path")}" "${sid:--}" "$win_idx" "$pane_idx" "$path"
    done < <(tmux list-panes "${scope[@]}" -F '#{pane_id}	#{pane_current_command}	#{window_index}	#{pane_index}	#{pane_current_path}' 2>/dev/null)
}

resume_cmd() {
    local sid="$1" path="$2"
    if [ -n "$sid" ] && [ "$sid" != "-" ]; then
        printf 'cd %s && claude --resume %s' "$(shell_path "$(session_dir "$sid" "$path")")" "$sid"
    else
        printf 'cd %s && claude --continue' "$(shell_path "$path")"
    fi
}

state_label() {
    case "$1" in
        question)  printf 'te está preguntando' ;;
        attention) printf 'espera tu permiso' ;;
        done)      printf 'ha terminado (sin ver)' ;;
        busy)      printf 'está trabajando' ;;
        *)         printf 'abierto' ;;
    esac
}

kill_target() {
    case "$1" in
        pane)    tmux kill-pane -t "$2" ;;
        window)  tmux kill-window -t "$2" ;;
        session) tmux kill-session -t "$2" ;;
    esac
}

# Atajo de cerrar: popup si hay un Claude; si no, cierra (el espacio pregunta igualmente).
cmd_close() {
    local kind="$1" target="$2" client="${3:-}" list lines l width height cw ch title what
    [ -n "$target" ] || return 0
    list="$(claude_panes "$kind" "$target")"
    if [ -z "$list" ]; then
        if [ "$kind" = "session" ]; then
            what="$(tmux display-message -p -t "$target" '#S' 2>/dev/null)"
            tmux confirm-before ${client:+-t "$client"} -p "¿Cerrar el espacio ${what//#/##}? (y/n)" "kill-session -t '$target'"
        else
            kill_target "$kind" "$target"
        fi
        return 0
    fi

    case "$kind" in
        pane)    title="Cerrar el panel" ;;
        window)  title="Cerrar la ventana «$(tmux display-message -p -t "$target" '#W' 2>/dev/null)»" ;;
        session) title="Cerrar el espacio «$(tmux display-message -p -t "$target" '#S' 2>/dev/null)»" ;;
    esac
    # Tamaño a la medida del texto, sin pasarse del cliente.
    # ${#l} cuenta caracteres (no bytes); el margen cubre los emojis, que ocupan dos.
    lines="$(cmd_close_text "$kind" "$target" "$list")"
    width=0 height=2
    while IFS= read -r l; do
        [ "${#l}" -gt "$width" ] && width="${#l}"
        height=$((height + 1))
    done <<< "$lines"
    [ "${#title}" -gt "$width" ] && width="${#title}"
    width=$((width + 6))
    IFS=' ' read -r cw ch < <(tmux display-message -p ${client:+-c "$client"} '#{client_width} #{client_height}' 2>/dev/null)
    [ -n "${cw:-}" ] && [ "$width" -gt "$cw" ] && width="$cw"
    [ -n "${ch:-}" ] && [ "$height" -gt "$ch" ] && height="$ch"
    tmux display-popup ${client:+-c "$client"} -E -w "$width" -h "$height" -T " ${title//#/##} " \
        "$(printf '%q close-popup %q %q' "$SELF" "$kind" "$target")"
}

# Texto del popup (también da su tamaño).
cmd_close_text() {
    local kind="$1" target="$2" list="$3" n pane state name sid win_idx pane_idx path multi=0
    n="$(printf '%s\n' "$list" | wc -l)"
    [ "$kind" = "window" ] && [ "$(tmux list-panes -t "$target" 2>/dev/null | wc -l)" -gt 1 ] && multi=1
    echo
    if [ "$n" -gt 1 ]; then echo " Hay $n Claude abiertos:"; else echo " Hay un Claude abierto:"; fi
    while IFS=$'\t' read -r pane state name sid win_idx pane_idx path; do
        echo
        case "$kind" in
            session) printf '  %s %s · ventana %s, panel %s · %s\n' "$(icon_for "$state")" "$name" "$win_idx" "$pane_idx" "$(state_label "$state")" ;;
            window)  printf '  %s %s%s · %s\n' "$(icon_for "$state")" "$name" "$([ "$multi" = 1 ] && printf ' · panel %s' "$pane_idx")" "$(state_label "$state")" ;;
            *)       printf '  %s %s · %s\n' "$(icon_for "$state")" "$name" "$(state_label "$state")" ;;
        esac
        if [ "$sid" != "-" ]; then printf '    sesión %s\n' "$sid"; else printf '    sin id de sesión guardado\n'; fi
        printf '    %s\n' "$(resume_cmd "$sid" "$path")"
    done <<< "$list"
    echo
    if [ "$n" -gt 1 ]; then echo " Al cerrar, los comandos se copian al portapapeles."; else echo " Al cerrar, el comando se copia al portapapeles."; fi
    echo
    printf ' ¿Cerrar? (y/n) '
}

# Dentro del popup: muestra el aviso, espera y/n y cierra (copiando los comandos).
cmd_close_popup() {
    local kind="$1" target="$2" list key cmds n
    list="$(claude_panes "$kind" "$target")"
    if [ -z "$list" ]; then kill_target "$kind" "$target"; return 0; fi
    cmd_close_text "$kind" "$target" "$list"
    IFS= read -rsn1 key || return 0
    case "$key" in y|Y|s|S) ;; *) return 0 ;; esac

    cmds="$(while IFS=$'\t' read -r _ _ _ sid _ _ path; do resume_cmd "$sid" "$path"; echo; done <<< "$list")"
    cmds="${cmds%$'\n'}"
    n="$(printf '%s\n' "$cmds" | wc -l)"
    # -w: también al portapapeles del terminal (OSC 52, set-clipboard on).
    tmux set-buffer -w -- "$cmds" 2>/dev/null
    kill_target "$kind" "$target"
    if [ "$n" -gt 1 ]; then
        tmux display-message -d 6000 "Copiados $n comandos para reanudar (prefix + ] para pegarlos)"
    else
        tmux display-message -d 6000 "Copiado: ${cmds//#/##}"
    fi
}

# Los atajos que cierran un panel o una ventana a pelo (el Ctrl+W de tu ~/.tmux.conf, los
# «Kill» de los menús del clic derecho) pasan a cerrar con `close`. Los que ya confirman
# (confirm-before) y los que llevan otros argumentos se quedan como están.
cmd_wrap_kill_keys() {
    local tmp
    tmp="$(mktemp)" || return 0
    { tmux list-keys -T root; tmux list-keys -T prefix; } 2>/dev/null |
        grep -E 'kill-(pane|window)' | grep -v 'confirm-before' |
        sed -E \
            -e "s#kill-pane( -t =)?( [}]|$)#run-shell \"$SELF close pane '\#{pane_id}' '\#{client_name}'\"\\2#g" \
            -e "s#kill-window( -t =)?( [}]|$)#run-shell \"$SELF close window '\#{window_id}' '\#{client_name}'\"\\2#g" |
        grep -vE 'kill-(pane|window)' > "$tmp"
    [ -s "$tmp" ] && tmux source-file "$tmp"
    rm -f "$tmp"
}

action="${1:-refresh}"
[ $# -gt 0 ] && shift

# El JSON de los hooks de Claude llega por stdin.
PAYLOAD=""
case "$action" in
    state|start|tool) [ -t 0 ] || PAYLOAD="$(cat)" ;;
esac

# Lo que cambia estados e iconos va de uno en uno (ver lock). Antes, la vía rápida de
# tool: si ya estaba trabajando, ni candado ni tmux.
if [ "$action" = "tool" ] && [ -n "${TMUX_PANE:-}" ] && [ -f "$STATE_DIR/$TMUX_PANE" ] &&
    [[ ! "$PAYLOAD" =~ \"tool_name\"[[:space:]]*:[[:space:]]*\"(AskUserQuestion|ExitPlanMode)\" ]]; then
    IFS=$'\t' read -r fast_state _ < "$STATE_DIR/$TMUX_PANE"
    [ "${fast_state:-}" = "busy" ] && exit 0
fi
case "$action" in
    refresh|refresh-all|state|start|tool|focus|clear) lock ;;
esac

case "$action" in
    refresh)     cmd_refresh "${1:-}" ;;
    refresh-all) cmd_refresh_all ;;
    state)       cmd_state "${1:-}" "${2:-}" ;;
    start)       cmd_start "${1:-}" ;;
    tool)        cmd_tool "${1:-}" "${2:-}" ;;
    focus)       cmd_focus "${1:-}" ;;
    clear)       cmd_clear ;;
    rename)      cmd_rename "${1:-}" "${2:-}" ;;
    reload)      cmd_reload "${1:-}" "${2:-}" ;;
    close)       cmd_close "${1:-}" "${2:-}" "${3:-}" ;;
    close-popup) cmd_close_popup "${1:-}" "${2:-}" ;;
    wrap-kill-keys) cmd_wrap_kill_keys ;;
    *)           echo "uso: $(basename "$0") {refresh [window-id]|refresh-all|state <estado> [nombre]|start [nombre]|tool <pre|post> [nombre]|focus <pane-id>|clear|rename <window-id> [nombre]|reload <pane-id>|close <pane|window|session> <id> [cliente]|wrap-kill-keys}" >&2; exit 2 ;;
esac
