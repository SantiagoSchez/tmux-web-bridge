#!/bin/bash
# Claude Code statusline script (tmux-web-bridge host kit: host-kit/install.sh links
# ~/.claude/scripts/statusline.sh here, and git pull keeps it up to date).
# Adaptive layout: packs all segments on one line if they fit,
# otherwise wraps to multiple lines based on terminal width.

input=$(cat)

# ── Colors ──────────────────────────────────────────
R='\033[0m'
CYAN='\033[36m'
BLUE='\033[34m'
GREEN='\033[32m'
RED='\033[31m'
YELLOW='\033[33m'
MAGENTA='\033[35m'
DIM='\033[2m'
BOLD='\033[1m'
GREY='\033[90m'

# Backgrounds + readable foregrounds for the progress bars
BG_GREEN='\033[42m'
BG_YELLOW='\033[43m'
BG_RED='\033[41m'
BG_BLUE='\033[44m'
BG_EMPTY='\033[100m'
FG_DARK='\033[30m'
FG_LIGHT='\033[97m'

# ── Extract fields (minimise jq calls) ─────────────
MODEL=$(echo "$input" | jq -r '.model.display_name // "Claude"')
DIR=$(echo "$input" | jq -r '.workspace.current_dir // "~"')
read -r PCT CTX_SIZE PCT_5H RESET_5H PCT_7D RESET_7D < <(
  echo "$input" | jq -r '[
    (.context_window.used_percentage // 0 | floor),
    (.context_window.context_window_size // 0),
    (.rate_limits.five_hour.used_percentage // 0 | floor),
    (.rate_limits.five_hour.resets_at // 0),
    (.rate_limits.seven_day.used_percentage // 0 | floor),
    (.rate_limits.seven_day.resets_at // 0)
  ] | @tsv'
)
USED_K=$(( CTX_SIZE * PCT / 100 / 1000 ))

# ── Límites de uso para el panel web (tmux-web-bridge) ──
# Son de la cuenta, iguales en todos sus agentes: se publican en una opción global
# de tmux que lee el servidor central, con una entrada por cuenta separada por ';'
# ("pct5h reset5h pct7d reset7d actualizado email"), porque cada carpeta de
# configuración de Claude Code puede tener la suya. Solo se escribe cuando cambian,
# así que cuesta un par de lecturas por repintado.
if [ -n "$TMUX" ] && [ "${RESET_5H:-0}" -gt 0 ] 2>/dev/null; then
  RL_ACCT=$(jq -r '.oauthAccount.emailAddress // empty' "${CLAUDE_CONFIG_DIR:-$HOME}/.claude.json" 2>/dev/null)
  RL_ACCT=${RL_ACCT:--}
  RL_NOW="$PCT_5H $RESET_5H $PCT_7D $RESET_7D"
  RL_T=$(date +%s)
  RL_KEEP="" RL_MINE=""
  IFS=';' read -ra RL_ENTRIES <<< "$(tmux show-options -gqv @claude_rate_limits 2>/dev/null)"
  for e in "${RL_ENTRIES[@]}"; do
    read -r p5 r5 p7 r7 at acct <<< "$e"
    [ -n "$acct" ] || continue # sin cuenta: de una statusline anterior
    if [ "$acct" = "$RL_ACCT" ]; then RL_MINE="$p5 $r5 $p7 $r7"; continue; fi
    # Las demás cuentas se quedan, salvo si llevan una semana sin leerse.
    [ $((RL_T - at)) -lt 604800 ] 2>/dev/null && RL_KEEP+="$p5 $r5 $p7 $r7 $at $acct;"
  done
  [ "$RL_MINE" = "$RL_NOW" ] || tmux set-option -gq @claude_rate_limits "${RL_KEEP}$RL_NOW $RL_T $RL_ACCT" 2>/dev/null
fi

# ── Format values ───────────────────────────────────
FOLDER="${DIR##*/}"
[ ${#FOLDER} -gt 25 ] && FOLDER="${FOLDER:0:25}…"

# ── Progress bar with its value rendered inside ────
# $1=pct  $2=label  $3=width  $4=filled background  $5=filled foreground
overlay_bar() {
  local pct=$1 label=$2 width=$3 bg=$4 fg=$5
  local len=${#label} lpad rpad text filled

  if [ "$len" -gt "$width" ]; then
    label="${label:0:width}"
    len=$width
  fi
  lpad=$(( (width - len) / 2 ))
  rpad=$(( width - len - lpad ))
  printf -v text '%*s%s%*s' "$lpad" '' "$label" "$rpad" ''

  filled=$(( pct * width / 100 ))
  [ "$filled" -lt 0 ] && filled=0
  [ "$filled" -gt "$width" ] && filled=$width

  echo "${bg}${fg}${BOLD}${text:0:filled}${R}${BG_EMPTY}${FG_LIGHT}${text:filled}${R}"
}

# ── Context bar (color shifts by usage) ────────────
if [ "$PCT" -ge 80 ]; then
  CTX_BG="$BG_RED"; CTX_FG="$FG_LIGHT"
elif [ "$PCT" -ge 60 ]; then
  CTX_BG="$BG_YELLOW"; CTX_FG="$FG_DARK"
else
  CTX_BG="$BG_GREEN"; CTX_FG="$FG_DARK"
fi

CTX_BAR=$(overlay_bar "$PCT" "${PCT}% (${USED_K}k)" 14 "$CTX_BG" "$CTX_FG")

# ── Rate limit bars ────────────────────────────────
NOW=$(date +%s)

build_rate_bar() {
  local pct=$1 reset=$2 label=$3
  local bg fg delta t when

  if [ "$pct" -ge 80 ]; then bg="$BG_RED"; fg="$FG_LIGHT"
  elif [ "$pct" -ge 60 ]; then bg="$BG_YELLOW"; fg="$FG_DARK"
  else bg="$BG_BLUE"; fg="$FG_LIGHT"
  fi

  delta=$((reset - NOW))
  if [ "$delta" -le 0 ]; then t="—"
  elif [ "$delta" -ge 86400 ]; then t="$((delta / 86400))d$((delta % 86400 / 3600))h"
  elif [ "$delta" -ge 3600 ]; then t="$((delta / 3600))h$((delta % 3600 / 60))m"
  else t="$((delta / 60))m"
  fi

  # Absolute reset date/time (BSD date first, GNU date as fallback)
  if [ "$reset" -gt 0 ] 2>/dev/null; then
    when=$(date -r "$reset" "+%d/%m @ %H:%M" 2>/dev/null)
    [ -z "$when" ] && when=$(date -d "@$reset" "+%d/%m @ %H:%M" 2>/dev/null)
    [ -n "$when" ] && t="${t} (${when})"
  fi

  echo "${DIM}${label}${R} $(overlay_bar "$pct" "${pct}%" 10 "$bg" "$fg") ${DIM}${t}${R}"
}

RATE_5H=$(build_rate_bar "$PCT_5H" "$RESET_5H" "5h")
RATE_7D=$(build_rate_bar "$PCT_7D" "$RESET_7D" "7d")

# ── Git branch + worktree + diff stats ─────────────
GIT_PART=""
if git -C "$DIR" rev-parse --git-dir > /dev/null 2>&1; then
  BRANCH=$(git -C "$DIR" branch --show-current 2>/dev/null)
  [ -z "$BRANCH" ] && BRANCH=$(git -C "$DIR" rev-parse --short HEAD 2>/dev/null)
  DIFF=$(git -C "$DIR" diff --shortstat 2>/dev/null)
  ADDED=$(echo "$DIFF" | grep -oE '[0-9]+ insertion' | grep -oE '[0-9]+')
  DELETED=$(echo "$DIFF" | grep -oE '[0-9]+ deletion' | grep -oE '[0-9]+')

  WORKTREE_DIR=$(git -C "$DIR" rev-parse --show-toplevel 2>/dev/null)
  WORKTREE_NAME=$(basename "$WORKTREE_DIR")
  MAIN_REPO=$(git -C "$DIR" worktree list 2>/dev/null | head -1 | awk '{print $1}')
  MAIN_REPO_NAME=$(basename "$MAIN_REPO")

  [ ${#BRANCH} -gt 30 ] && BRANCH="${BRANCH:0:30}…"

  if [ -n "$WORKTREE_NAME" ] && [ "$WORKTREE_NAME" != "$MAIN_REPO_NAME" ]; then
    [ ${#WORKTREE_NAME} -gt 25 ] && WORKTREE_NAME="${WORKTREE_NAME:0:25}…"
    GIT_PART="${MAGENTA}🌲 ${WORKTREE_NAME}${R} ${GREEN}🌿 ${BRANCH}${R}"
  else
    GIT_PART="${GREEN}🌿 ${BRANCH}${R}"
  fi
  if [ -n "$ADDED" ] || [ -n "$DELETED" ]; then
    GIT_PART+=" "
    [ -n "$ADDED" ] && GIT_PART+="${GREEN}+${ADDED}${R}"
    [ -n "$ADDED" ] && [ -n "$DELETED" ] && GIT_PART+=" "
    [ -n "$DELETED" ] && GIT_PART+="${RED}-${DELETED}${R}"
  fi
fi

# ── Visible width helper (strips ANSI, adjusts for 2-col emojis) ──
vis_width() {
  local clean
  clean=$(printf '%b' "$1" | sed $'s/\033\[[0-9;]*m//g')
  local len=${#clean}
  local tmp="$clean" extra=0
  for e in 🧠 📁 🌲 🌿; do
    while [[ "$tmp" == *"$e"* ]]; do
      extra=$((extra + 1))
      tmp="${tmp/"$e"/X}"
    done
  done
  echo $((len + extra))
}

# ── Build output (adaptive line wrapping) ─────────
SEP=" ${DIM}|${R} "
SEP_W=3

# Inside tmux, the pane's real width (it changes when another client, like the
# phone, resizes the window); stty on /dev/tty as a fallback.
TERM_W=""
[ -n "$TMUX_PANE" ] && TERM_W=$(tmux display -p -t "$TMUX_PANE" '#{pane_width}' 2>/dev/null)
[ -z "$TERM_W" ] && TERM_W=$({ stty size </dev/tty | awk '{print $2}'; } 2>/dev/null)
[ -z "$TERM_W" ] && TERM_W=120

# Inside tmux, a status bar that already shows the 5h/7d limits says so with
# @claude_limits_in_status=1, and they're left out here.
LIMITS_IN_BAR=""
[ -n "$TMUX" ] && LIMITS_IN_BAR=$(tmux show-options -gqv @claude_limits_in_status 2>/dev/null)

# Ordered segments (empty ones skipped automatically). On a narrow pane (the phone,
# through tmux-web-bridge) only model, context and git: the folder is the window's
# and the 5h/7d limits have their own strip in the web app.
COMPACT_BELOW=80
SEGS=()
SEGS+=("${BOLD}${CYAN}🧠 ${MODEL}${R}")
[ "$TERM_W" -ge "$COMPACT_BELOW" ] && SEGS+=("${BLUE}📁 ${FOLDER}${R}")
SEGS+=("$CTX_BAR")
[ -n "$GIT_PART" ] && SEGS+=("$GIT_PART")
if [ "$TERM_W" -ge "$COMPACT_BELOW" ] && [ "$LIMITS_IN_BAR" != 1 ]; then
  SEGS+=("$RATE_5H")
  SEGS+=("$RATE_7D")
fi

# Greedy line packing: add segments until the next one won't fit
LINES=()
cur="" cur_w=0
for seg in "${SEGS[@]}"; do
  w=$(vis_width "$seg")
  if [ "$cur_w" -eq 0 ]; then
    cur="$seg"; cur_w=$w
  elif [ $((cur_w + SEP_W + w)) -le "$TERM_W" ]; then
    cur+="${SEP}${seg}"; cur_w=$((cur_w + SEP_W + w))
  else
    LINES+=("$cur")
    cur="$seg"; cur_w=$w
  fi
done
[ "$cur_w" -gt 0 ] && LINES+=("$cur")

for line in "${LINES[@]}"; do
  printf '%b\n' "$line"
done
