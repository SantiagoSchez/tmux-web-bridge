#!/bin/bash
# Título de las ventanas de tmux: nombre + icono de estado (y el icono de cada space).
#
# Separa dos conceptos que antes se pisaban entre sí:
#   - NOMBRE de la ventana: lo pone el usuario (prefix + r, queda "fijado") o,
#     si no está fijado, lo pone el panel activo (proyecto de Claude, host SSH)
#     o el automatic-rename de tmux.
#   - ICONO de estado (@win_icon): estado más urgente de CUALQUIER panel de la
#     ventana (🙋 pregunta > 💬 atención > ✅ terminado sin ver > 🔨 trabajando >
#     🤖 sesión > 📡 ssh). Se pinta en la statusline, nunca forma parte del
#     nombre, así que jamás pisa el nombre fijado.
# Además, cada sesión (space) recibe @space_icon: el más urgente de sus ventanas.
#
# Uso:
#   tmux-window-title.sh refresh [window-id]   recalcula nombre e icono
#   tmux-window-title.sh refresh-all           recalcula todas las ventanas
#   tmux-window-title.sh state <estado> [nombre]   marca el estado del panel actual
#   tmux-window-title.sh start [nombre]        inicio de Claude: estado claude + session_id (JSON por stdin)
#   tmux-window-title.sh focus <pane-id>       el panel recibe foco: ✅ pasa a 🤖
#   tmux-window-title.sh clear                 borra el estado del panel actual
#   tmux-window-title.sh rename <window-id> [nombre]   fija el nombre (vacío = automático)
#   tmux-window-title.sh jump <socket> <pane-id>  clic en una notificación: salta al panel
#   tmux-window-title.sh reload <pane-id>      relanza el panel: shell nueva (recarga .zshrc) y,
#                                              si tenía un Claude, lo reanuda con su conversación
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

# Icono del space (sesión): el estado más urgente de todas sus ventanas.
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

# Recalcula nombre e icono de una ventana. Con "nospace" no toca el icono del space
# (refresh-all lo recalcula una sola vez por sesión al final).
cmd_refresh() {
    local win="${1:-}" nospace="${2:-}"
    [ -n "$win" ] || win="$(tmux display-message -p '#{window_id}' 2>/dev/null)"
    [ -n "$win" ] || return 0

    local top_prio=0 top_state="" active_name="" pane pane_pid active entry state name prio

    while read -r pane pane_pid active; do
        entry="$(state_of_pane "$pane" "$pane_pid")"
        if [ -z "$entry" ]; then
            tmux set-option -p -t "$pane" -u @pane_icon 2>/dev/null
            continue
        fi
        IFS=$'\t' read -r state name <<< "$entry"
        tmux set-option -p -t "$pane" @pane_icon "$(icon_for "$state")" 2>/dev/null
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
    [ -t 0 ] || payload="$(cat)"
    event="$state"

    # Claude lanza también una Notification al hacer una pregunta: no debe
    # rebajar 🙋 a 💬 (ni volver a notificar). La pregunta la limpia PostToolUse al responder.
    if [ "$state" = "attention" ] && [ "${old_state:-}" = "question" ]; then
        state="question"; event=""
    fi
    # Terminado: si lo estás viendo no hay nada pendiente de ver.
    [ "$state" = "done" ] && pane_is_viewed "$TMUX_PANE" && state="claude"

    write_state "$TMUX_PANE" "$state" "$name" "${old_sid:-}"
    cmd_refresh "$(tmux display-message -p -t "$TMUX_PANE" '#{window_id}' 2>/dev/null)"

    case "$event" in
        question|attention|done) notify "$TMUX_PANE" "$event" "$payload" ;;
        busy)                    notify_clear "$TMUX_PANE" ;;
    esac
}

# SessionStart de Claude: el JSON del hook llega por stdin; se guarda su
# session_id para poder reanudar la conversación exacta al restaurar tmux.
cmd_start() {
    local name="${1:-}" sid=""
    [ -n "${TMUX_PANE:-}" ] || return 0
    [ -t 0 ] || sid="$(jq -r '.session_id // empty' 2>/dev/null)"
    write_state "$TMUX_PANE" claude "$name" "$sid"
    cmd_refresh "$(tmux display-message -p -t "$TMUX_PANE" '#{window_id}' 2>/dev/null)"
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
    rm -f "$STATE_DIR/$TMUX_PANE"
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

# Relanza un panel (botón «Recargar ventana» del panel web): mata lo que corre en él y
# arranca la shell por defecto en el mismo directorio, que vuelve a leer .zshrc. Si el
# panel tenía un Claude, la shell nueva lo reanuda con su conversación (claude --resume,
# como la restauración de tmux-resurrect) y, al salir de él, deja otra shell limpia.
cmd_reload() {
    local pane="${1:-}" state="" name="" sid="" cmd dir shell claude resume=""
    [ -n "$pane" ] || return 0
    cmd="$(tmux display-message -p -t "$pane" '#{pane_current_command}' 2>/dev/null)" || return 0
    dir="$(tmux display-message -p -t "$pane" '#{pane_current_path}' 2>/dev/null)"
    shell="$(tmux show-options -gqv default-shell 2>/dev/null)"
    [ -n "$shell" ] || shell="${SHELL:-/bin/sh}"
    claude="${TMUX_WEB_CLAUDE_CMD:-claude}"
    [ -f "$STATE_DIR/$pane" ] && IFS=$'\t' read -r state name sid < "$STATE_DIR/$pane"

    if [ -n "${sid:-}" ] && [ "${state:-}" != "ssh" ]; then
        resume="$claude --resume $sid"
    elif [[ "$cmd" =~ ^[0-9]+\.[0-9]+\.[0-9]+ || "$cmd" == claude ]]; then
        # Un Claude sin session_id guardado: la conversación más reciente de ese directorio.
        resume="$claude --continue"
    fi

    # El Claude nuevo vuelve a escribir su estado al arrancar (hook SessionStart).
    rm -f "$STATE_DIR/$pane" "$STATE_DIR/$pane.notified"
    if [ -n "$resume" ]; then
        tmux respawn-pane -k -t "$pane" -c "$dir" "$shell" -ic "$resume; exec $(printf '%q' "$shell")"
    else
        tmux respawn-pane -k -t "$pane" -c "$dir"
    fi
    cmd_refresh "$(tmux display-message -p -t "$pane" '#{window_id}' 2>/dev/null)"
}

action="${1:-refresh}"
[ $# -gt 0 ] && shift

case "$action" in
    refresh)     cmd_refresh "${1:-}" ;;
    refresh-all) cmd_refresh_all ;;
    state)       cmd_state "${1:-}" "${2:-}" ;;
    start)       cmd_start "${1:-}" ;;
    focus)       cmd_focus "${1:-}" ;;
    clear)       cmd_clear ;;
    rename)      cmd_rename "${1:-}" "${2:-}" ;;
    reload)      cmd_reload "${1:-}" ;;
    *)           echo "uso: $(basename "$0") {refresh [window-id]|refresh-all|state <estado> [nombre]|start [nombre]|focus <pane-id>|clear|rename <window-id> [nombre]}" >&2; exit 2 ;;
esac
