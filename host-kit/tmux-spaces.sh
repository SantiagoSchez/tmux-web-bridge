#!/bin/bash
# Spaces sobre tmux: cada sesión es un space, numerado por orden de creación.
#
# Uso:
#   tmux-spaces.sh renumber                    recalcula @space_num (1..n) de cada sesión
#   tmux-spaces.sh goto <client> <n>           va al space n
#   tmux-spaces.sh next|prev <client>          space siguiente / anterior (cíclico)
#   tmux-spaces.sh new <client> <cwd> [nombre] crea un space y cambia a él
#   tmux-spaces.sh pending <client> <pane-id>  salta al agente más urgente (🙋 > 💬 > ✅);
#                                              repetido, recorre el resto
#   tmux-spaces.sh cheatsheet [toggle]         aplica (o alterna) la línea de atajos
#   tmux-spaces.sh resurrect-save              hook post-save de tmux-resurrect
#   tmux-spaces.sh resurrect-restore           hook post-restore de tmux-resurrect
#
# Lo invocan los atajos y hooks del tmux.conf del kit de tmux-web-bridge
# (~/.config/tmux-web-bridge/tmux.conf); cheatsheet y resurrect-*, los de tu
# propio ~/.tmux.conf si usas esa barra de estado o tmux-resurrect.
# host-kit/install.sh enlaza ~/.scripts/tmux-spaces.sh aquí; git pull lo pone al día.

set -u

[ -n "${TMUX:-}" ] || exit 0

STATE_DIR="/tmp/tmux-window-state-$(id -u)-$(printf '%s' "$TMUX" | cut -d, -f2)"
CHEATSHEET_FLAG="$HOME/.cache/tmux/cheatsheet-hidden"
# Las sesiones _tw-* son las terminales del panel web (tmux-web-bridge), agrupadas
# con un space real: no cuentan como spaces ni duplican sus paneles.
NOT_WEB='#{?#{m:_tw-*,#{session_name}},0,1}'

# Sesiones en orden de creación: "<session_id>\t<nombre>" (el id $N crece al crear).
sessions_in_order() {
    tmux list-sessions -f "$NOT_WEB" -F '#{session_id}	#{session_name}' 2>/dev/null | sed 's/^\$//' | sort -n | sed 's/^/$/'
}

cmd_renumber() {
    local n=0 sid _name
    while IFS=$'\t' read -r sid _name; do
        n=$((n + 1))
        tmux set-option -t "$sid" @space_num "$n" 2>/dev/null
    done < <(sessions_in_order)
}

switch_to() {
    local client="$1" target="$2"
    if [ -n "$client" ]; then
        tmux switch-client -c "$client" -t "$target"
    else
        tmux switch-client -t "$target"
    fi
}

cmd_goto() {
    local client="$1" n="$2" sid
    sid="$(sessions_in_order | sed -n "${n}p" | cut -f1)"
    if [ -n "$sid" ]; then
        switch_to "$client" "$sid"
    else
        tmux display-message -c "$client" "No existe el space $n"
    fi
}

cmd_step() {
    local client="$1" dir="$2" current ids count i idx=0
    current="$(tmux list-clients -f "#{==:#{client_name},$client}" -F '#{session_id}' 2>/dev/null | head -1)"
    ids=()
    while IFS=$'\t' read -r sid _; do ids+=("$sid"); done < <(sessions_in_order)
    count=${#ids[@]}
    [ "$count" -gt 1 ] || return 0
    for ((i = 0; i < count; i++)); do [ "${ids[$i]}" = "$current" ] && idx=$i; done
    if [ "$dir" = "next" ]; then idx=$(( (idx + 1) % count )); else idx=$(( (idx - 1 + count) % count )); fi
    switch_to "$client" "${ids[$idx]}"
}

cmd_new() {
    local client="$1" cwd="${2:-$HOME}" name="${3:-}" sid
    if [ -n "$name" ]; then
        # tmux no admite '.' ni ':' en nombres de sesión.
        name="${name//[.:]/-}"
        if tmux has-session -t "=$name" 2>/dev/null; then
            tmux display-message -c "$client" "Ya existe un space llamado '$name'"
            return 0
        fi
        sid="$(tmux new-session -d -P -F '#{session_id}' -s "$name" -c "$cwd")"
    else
        sid="$(tmux new-session -d -P -F '#{session_id}' -c "$cwd")"
    fi
    [ -n "$sid" ] && switch_to "$client" "$sid"
}

prio_for() {
    case "$1" in
        question)  echo 3 ;;
        attention) echo 2 ;;
        done)      echo 1 ;;
        *)         echo 0 ;;
    esac
}

cmd_pending() {
    local client="$1" current="$2" pane sess num win_idx pane_idx state prio
    local list=() i count target=""

    # "<prio>\t<space>\t<ventana>\t<panel>\t<pane_id>", más urgente primero.
    while read -r pane sess num win_idx pane_idx; do
        [ -f "$STATE_DIR/$pane" ] || continue
        IFS=$'\t' read -r state _ < "$STATE_DIR/$pane"
        prio="$(prio_for "${state:-}")"
        [ "$prio" -gt 0 ] && list+=("$(printf '%s\t%s\t%s\t%s\t%s' "$prio" "${num:-99}" "$win_idx" "$pane_idx" "$pane")")
    done < <(tmux list-panes -a -f "$NOT_WEB" -F '#{pane_id} #{session_id} #{@space_num} #{window_index} #{pane_index}' 2>/dev/null)

    count=${#list[@]}
    if [ "$count" -eq 0 ]; then
        tmux display-message -c "$client" "No hay agentes pendientes"
        return 0
    fi

    local sorted=()
    while IFS= read -r line; do sorted+=("${line##*$'\t'}"); done < <(printf '%s\n' "${list[@]}" | sort -t $'\t' -k1,1nr -k2,2n -k3,3n -k4,4n)

    # Si ya estás en uno de la lista, el siguiente; si no, el más urgente.
    target="${sorted[0]}"
    for ((i = 0; i < count; i++)); do
        if [ "${sorted[$i]}" = "$current" ]; then target="${sorted[$(( (i + 1) % count ))]}"; break; fi
    done

    switch_to "$client" "$target"
    tmux select-window -t "$target" \; select-pane -t "$target"
}

# Línea de atajos: 4 líneas de barra si está visible, 3 si está oculta (la raya
# separadora sube a la línea 3).
# El estado se guarda en un fichero para sobrevivir a reinicios de tmux.
cmd_cheatsheet() {
    if [ "${1:-}" = "toggle" ]; then
        mkdir -p "$(dirname "$CHEATSHEET_FLAG")"
        if [ -f "$CHEATSHEET_FLAG" ]; then rm -f "$CHEATSHEET_FLAG"; else : > "$CHEATSHEET_FLAG"; fi
    fi
    if [ -f "$CHEATSHEET_FLAG" ]; then
        tmux set-option -g @cheatsheet_hidden 1 \; set-option -g status 3
    else
        tmux set-option -g @cheatsheet_hidden 0 \; set-option -g status 4
    fi
}

resurrect_dir() {
    local dir
    dir="$(tmux show-option -gqv @resurrect-dir)"
    if [ -n "$dir" ]; then
        dir="${dir/#\~/$HOME}"
        dir="${dir//\$HOME/$HOME}"
    elif [ -d "$HOME/.tmux/resurrect" ]; then
        dir="$HOME/.tmux/resurrect"
    else
        dir="${XDG_DATA_HOME:-$HOME/.local/share}/tmux/resurrect"
    fi
    printf '%s' "$dir"
}

# Tras guardar: 1) reordena el fichero de resurrect para que los spaces se
# restauren en su orden (resurrect crea las sesiones en el orden del fichero);
# 2) guarda los session_id de Claude por panel y los nombres de ventana fijados.
cmd_resurrect_save() {
    local dir last file order tmp pane state sid sess win_idx pane_idx pinned
    dir="$(resurrect_dir)"
    last="$dir/last"
    [ -e "$last" ] || return 0
    file="$(readlink -f "$last")"

    # Solo se sustituye el guardado si el reordenado conserva todas las líneas.
    order="$(mktemp)"; tmp="$(mktemp)"
    sessions_in_order | awk -F'\t' '{print $2 "\t" NR}' > "$order"
    if awk -F'\t' '
        NR == FNR { pos[$1] = $2; next }
        { key = ($1 == "pane" || $1 == "window") && ($2 in pos) ? pos[$2] : 0; printf "%d\t%d\t%s\n", key, FNR, $0 }
    ' "$order" "$file" | sort -t $'\t' -k1,1n -k2,2n | cut -f3- > "$tmp" \
        && [ -s "$tmp" ] && [ "$(wc -l < "$tmp")" -eq "$(wc -l < "$file")" ]; then
        cat "$tmp" > "$file"
    fi
    rm -f "$order" "$tmp"

    : > "$dir/claude-panes.tsv"
    while read -r pane sess win_idx pane_idx; do
        [ -f "$STATE_DIR/$pane" ] || continue
        IFS=$'\t' read -r state _ sid < "$STATE_DIR/$pane"
        [ -n "${sid:-}" ] && [ "${state:-}" != "ssh" ] && printf '%s\t%s\t%s\t%s\n' "$sess" "$win_idx" "$pane_idx" "$sid" >> "$dir/claude-panes.tsv"
    done < <(tmux list-panes -a -f "$NOT_WEB" -F '#{pane_id} #{session_name} #{window_index} #{pane_index}' 2>/dev/null)

    : > "$dir/pinned-windows.tsv"
    while IFS=$'\t' read -r sess win_idx pinned; do
        [ "$pinned" = "1" ] && printf '%s\t%s\n' "$sess" "$win_idx" >> "$dir/pinned-windows.tsv"
    done < <(tmux list-windows -a -f "$NOT_WEB" -F '#{session_name}	#{window_index}	#{@name_pinned}' 2>/dev/null)
}

# Tras restaurar: relanza cada Claude con su conversación y vuelve a fijar nombres.
cmd_resurrect_restore() {
    local dir sess win_idx pane_idx sid target cmd
    dir="$(resurrect_dir)"

    if [ -f "$dir/claude-panes.tsv" ]; then
        while IFS=$'\t' read -r sess win_idx pane_idx sid; do
            target="=$sess:$win_idx.$pane_idx"
            cmd="$(tmux display-message -p -t "$target" '#{pane_current_command}' 2>/dev/null)" || continue
            case "$cmd" in
                zsh|bash|sh|-zsh|-bash) tmux send-keys -t "$target" "claude --resume $sid" Enter ;;
            esac
        done < "$dir/claude-panes.tsv"
    fi

    if [ -f "$dir/pinned-windows.tsv" ]; then
        while IFS=$'\t' read -r sess win_idx; do
            tmux set-option -w -t "=$sess:$win_idx" @name_pinned 1 2>/dev/null
            tmux set-window-option -t "=$sess:$win_idx" automatic-rename off 2>/dev/null
        done < "$dir/pinned-windows.tsv"
    fi

    cmd_renumber
}

action="${1:-}"
[ $# -gt 0 ] && shift

case "$action" in
    renumber)          cmd_renumber ;;
    goto)              cmd_goto "${1:-}" "${2:-1}" ;;
    next|prev)         cmd_step "${1:-}" "$action" ;;
    new)               cmd_new "${1:-}" "${2:-}" "${3:-}" ;;
    pending)           cmd_pending "${1:-}" "${2:-}" ;;
    cheatsheet)        cmd_cheatsheet "${1:-}" ;;
    resurrect-save)    cmd_resurrect_save ;;
    resurrect-restore) cmd_resurrect_restore ;;
    *) echo "uso: $(basename "$0") {renumber|goto <client> <n>|next|prev <client>|new <client> <cwd> [nombre]|pending <client> <pane-id>|cheatsheet [toggle]|resurrect-save|resurrect-restore}" >&2; exit 2 ;;
esac
