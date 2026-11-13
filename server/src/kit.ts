import type { KitReport, MachineCheck } from '../../shared/types.js';
import { EXTRA_PATH, shq, shQuote, TmuxError } from './exec.js';
import type { HostMonitor } from './host.js';
import { REPO } from './updates.js';

const VERSION = /^\d+\.\d+\.\d+$/;

/** The release tag to check out. The version comes from GitHub's API: only plain X.Y.Z gets into a script. */
export function kitTag(version: string | null | undefined): string {
  if (!version) throw new Error('No hay ninguna release a la que actualizar');
  if (!VERSION.test(version)) throw new Error(`Versión de release inválida: ${version}`);
  return `v${version}`;
}

/**
 * The kit's clone for the shell, from @twb_kit_dir (published by the kit's tmux.conf).
 * Kits 1.0.0 do not publish it: they live in ~/tmux-web-bridge, as the README says.
 */
export function kitDir(published: string | null | undefined): string {
  const dir = published?.trim();
  if (!dir || !dir.startsWith('/')) return '"$HOME"/tmux-web-bridge';
  return shQuote(dir);
}

/** The first lines of the scripts run in a kit's clone: into it, or a clear error. */
function inClone(dir: string): string[] {
  return [
    `PATH="$PATH:${EXTRA_PATH}"; export PATH`,
    `dir=${dir}`,
    `cd "$dir" 2>/dev/null && git rev-parse --git-dir >/dev/null 2>&1 || { echo "Sin clon del kit en $dir: instálalo con git clone + host-kit/install.sh" >&2; exit 1; }`,
  ];
}

/** Kits from before --trello-extension refuse unknown options: it is passed only to those that know it. */
const TRELLO_FLAG = `trello=; grep -q -- '--trello-extension)' host-kit/install.sh && trello=--trello-extension`;

/**
 * Script that moves the clone to a release tag and applies the kit, stopping at the
 * first problem. Never forces anything: local changes leave the clone alone, and a
 * clone of anything but twb is not touched. Every error names the clone. The checkout
 * runs without hooks because install.sh is run right after it anyway, without its own
 * tmux reload: it would reach the default tmux socket, not necessarily the host's.
 */
export function kitScript(dir: string, tag: string, trelloExtension = false, installArgs = ''): string {
  const repo = REPO.toLowerCase();
  return [
    ...inClone(dir),
    `origin=$(git remote get-url origin 2>/dev/null)`,
    `case "$(printf '%s' "$origin" | tr 'A-Z' 'a-z')" in */${repo}|*/${repo}.git|*:${repo}|*:${repo}.git) ;; *) echo "El clon del kit en $dir no es de twb (origin: \${origin:-ninguno}): no se toca" >&2; exit 1 ;; esac`,
    `[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "Cambios locales en el clon del kit ($dir): no se toca" >&2; exit 1; }`,
    `git fetch --quiet --tags --force origin || { echo "git fetch falló en $dir (origin: $origin)" >&2; exit 1; }`,
    `git rev-parse --quiet --verify 'refs/tags/${tag}^{commit}' >/dev/null || { echo "No existe el tag ${tag} en el clon del kit ($dir, origin: $origin)" >&2; exit 1; }`,
    `git -c core.hooksPath=/dev/null -c advice.detachedHead=false checkout --quiet '${tag}' || { echo "git checkout ${tag} falló en $dir" >&2; exit 1; }`,
    // The hub reloads tmux.conf itself (through the host's own tmux socket): it needs the path.
    `echo "TWB_KIT_DIR=$(pwd)"`,
    ...(trelloExtension ? [TRELLO_FLAG] : ['trello=']),
    `TWB_NO_TMUX_RELOAD=1 host-kit/install.sh --quiet $trello${installArgs ? ` ${installArgs}` : ''} || { echo "host-kit/install.sh falló en $dir" >&2; exit 1; }`,
  ].join('\n');
}

/**
 * Script that turns the Trello extension on or off in a kit (install.sh --[no-]trello-extension,
 * leaving tmux and Claude Code alone) and prints the folder it is in when on.
 */
export function trelloScript(dir: string, on: boolean): string {
  return [
    ...inClone(dir),
    `grep -q -- '--trello-extension)' host-kit/install.sh || { echo "El kit de esta máquina es anterior a la extensión de Trello: actualízalo antes" >&2; exit 1; }`,
    `TWB_NO_TMUX_RELOAD=1 host-kit/install.sh --quiet --skip-tmux --skip-claude ${on ? '--trello-extension' : '--no-trello-extension'} || { echo "host-kit/install.sh falló en $dir" >&2; exit 1; }`,
    ...(on ? [`echo "TWB_TRELLO_DIR=$(cat "\${XDG_CONFIG_HOME:-$HOME/.config}/tmux-web-bridge/trello-extension")"`] : []),
  ].join('\n');
}

/**
 * Loads the kit's tmux.conf in a host's running tmux (install.sh reloads it on the default
 * socket only). False when no tmux runs there: it loads when tmux starts, from ~/.tmux.conf.
 */
async function reloadKit(host: HostMonitor, dir: string): Promise<boolean> {
  try {
    await host.exec.run(['source-file', `${dir}/host-kit/tmux.conf`]);
    return true;
  } catch (err) {
    return !(err instanceof TmuxError && err.noServer);
  }
}

/** The kit's clone of a host, as its tmux publishes it. */
async function hostKitDir(host: HostMonitor): Promise<string> {
  return kitDir(await host.exec.run(['show-options', '-gqv', '@twb_kit_dir']).catch(() => ''));
}

/** Runs a kit script on a host, with the errors of a machine that does not answer explained. */
async function runKit(host: HostMonitor, script: string, timeoutMs = 60_000, input?: string): Promise<string[]> {
  try {
    return (await host.exec.shell(script, timeoutMs, input === undefined ? undefined : Buffer.from(input))).replace(/\x1b\[[0-9;]*m/g, '').split('\n');
  } catch (err) {
    if (err instanceof TmuxError && (err.transport || err.code === 'timeout')) throw new Error(`${host.name} no responde (¿dormida o sin red?)`);
    throw new Error(`${host.name}: ${(err as Error).message.replace(/\x1b\[[0-9;]*m/g, '')}`);
  }
}

/**
 * Turns the Trello extension on (downloaded with the kit's release, and on every update) or
 * off on a host. Resolves with its folder there when on, and what install.sh said.
 */
export async function setTrelloExtension(host: HostMonitor, on: boolean): Promise<{ dir: string | null; changes: string }> {
  const lines = await runKit(host, trelloScript(await hostKitDir(host), on));
  const dir = lines.find((l) => l.startsWith('TWB_TRELLO_DIR='))?.slice('TWB_TRELLO_DIR='.length).trim() || null;
  if (on && !dir) throw new Error(`${host.name}: el kit no ha dejado la carpeta de la extensión`);
  return { dir, changes: lines.filter((l) => l.trim() && !l.startsWith('TWB_TRELLO_DIR=')).join('\n') };
}

/**
 * Moves a host's kit to the last release and reloads it in its tmux. Resolves with
 * what install.sh changed (empty when it was already up to date).
 */
export async function updateKit(host: HostMonitor, latest: string | null, trelloExtension = false): Promise<{ version: string; changes: string }> {
  const tag = kitTag(latest);
  const lines = await runKit(host, kitScript(await hostKitDir(host), tag, trelloExtension));
  const dir = lines.find((l) => l.startsWith('TWB_KIT_DIR='))?.slice('TWB_KIT_DIR='.length);
  if (dir) await reloadKit(host, dir);
  host.forgetKit();
  const changes = lines.filter((l) => l.trim() && !l.startsWith('TWB_KIT_DIR=')).join('\n');
  return { version: tag.slice(1), changes };
}

// ---------------------------------------------------------------- machines added from the panel

/** Why the hub cannot get into a machine, from what ssh said. */
export function sshProblem(stderr: string): string {
  if (/Permission denied|publickey/i.test(stderr)) return 'La máquina no acepta la clave del hub: añade la línea de la clave a su ~/.ssh/authorized_keys';
  if (/Host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED/i.test(stderr)) return 'La clave de host de la máquina no es la que el hub conocía (¿se reinstaló?): quítala del known_hosts del hub';
  if (/Could not resolve|Name or service not known|nodename nor servname/i.test(stderr)) return 'El hub no encuentra ese nombre: prueba con su IP';
  if (/SOCKS/i.test(stderr)) return 'No responde por la tailnet (¿apagada, dormida o sin Tailscale?)';
  if (/timed out|Connection refused|No route to host|Network is unreachable/i.test(stderr)) return 'No responde por SSH (¿apagada, sin red o con el puerto cerrado?)';
  return stderr.trim().split('\n').slice(-2).join(' ') || 'No se pudo entrar por SSH';
}

/**
 * Shell lines that leave tmux's path in $t (empty without it) and the kit's clone in $d: where
 * its tmux says (@twb_kit_dir), else ~/tmux-web-bridge, where the hub installs it.
 */
function kitDirLines(tmux: string): string[] {
  return [
    `PATH="$PATH:${EXTRA_PATH}"; export PATH`,
    `t=$(command -v ${shq(tmux)} 2>/dev/null || true)`,
    `d="$HOME/tmux-web-bridge"`,
    `[ -n "$t" ] && k=$("$t" show-options -gqv @twb_kit_dir 2>/dev/null) && [ -n "$k" ] && d="$k"`,
  ];
}

/** Script that tells what a machine has for the kit (see parseCheck). */
export function checkScript(tmux: string): string {
  return [
    ...kitDirLines(tmux),
    `echo "SYS=$(uname -s) $(uname -r)"`,
    `echo "USER=$(id -un)"`,
    `echo "HOME=$HOME"`,
    `[ -n "$t" ] && echo "TMUX=$t" && echo "TMUXV=$("$t" -V 2>/dev/null)"`,
    `for c in git jq curl; do command -v "$c" >/dev/null 2>&1 || echo "MISSING=$c"; done`,
    `[ -d "$d/.git" ] && echo "KIT=$d" && echo "KITV=$(cat "$d/VERSION" 2>/dev/null)"`,
    'true',
  ].join('\n');
}

/**
 * Script that prints the version of the kit's clone (nothing without one). For a machine whose
 * tmux has no panes, so no @twb_kit_version to read: the kit loads when tmux starts there.
 */
export function kitVersionScript(tmux: string): string {
  return [...kitDirLines(tmux), `[ -d "$d/.git" ] && cat "$d/VERSION" 2>/dev/null`, 'true'].join('\n');
}

/** What checkScript printed. */
export function parseCheck(out: string): MachineCheck {
  const lines = out.split('\n');
  const v = (k: string) => lines.find((l) => l.startsWith(`${k}=`))?.slice(k.length + 1).trim() || undefined;
  const check: MachineCheck = {
    ok: false,
    system: v('SYS'),
    user: v('USER'),
    home: v('HOME'),
    tmux: v('TMUX'),
    tmuxVersion: v('TMUXV')?.replace(/^tmux\s+/, ''),
    missing: lines.filter((l) => l.startsWith('MISSING=')).map((l) => l.slice(8).trim()),
  };
  const kit = v('KIT');
  if (kit) check.kit = { dir: kit, version: v('KITV') };
  const version = /(\d+)\.(\d+)/.exec(check.tmuxVersion ?? '');
  const recent = !!version && (Number(version[1]) > 3 || (Number(version[1]) === 3 && Number(version[2]) >= 2));
  if (!check.tmux) check.error = 'No tiene tmux (o no está en el PATH: indica su ruta)';
  else if (!recent) check.error = `Hace falta tmux 3.2 o posterior (tiene ${check.tmuxVersion ?? '¿?'})`;
  else if (check.missing.length) check.error = `Para el kit le falta: ${check.missing.join(', ')}`;
  // Without git, jq or curl the panel still works there; only the kit cannot go in.
  check.ok = !!check.tmux && recent;
  return check;
}

/** Whether the hub gets into a machine, and what the kit would find there. */
export async function checkMachine(host: HostMonitor): Promise<MachineCheck> {
  try {
    return parseCheck(await host.exec.shell(checkScript(host.hostConfig.tmux), 20_000));
  } catch (err) {
    const e = err as TmuxError;
    if (e instanceof TmuxError && e.code === 'timeout') return { ok: false, missing: [], error: 'No responde por SSH (¿apagada o sin red?)' };
    if (e instanceof TmuxError && e.transport) return { ok: false, missing: [], error: sshProblem(e.stderr || e.message) };
    return { ok: false, missing: [], error: e.message };
  }
}

/**
 * Script that installs the kit on a machine: its clone (made in ~/tmux-web-bridge if there is
 * none) at the release `tag`, and install.sh with the hub's URL, the machine's id and the
 * token, which comes on stdin (never on a command line the hub logs).
 */
export function installScript(dir: string, tag: string, hubUrl: string, hostId: string): string {
  return [
    `PATH="$PATH:${EXTRA_PATH}"; export PATH`,
    `IFS= read -r token`,
    `dir=${dir}`,
    `if [ ! -d "$dir/.git" ]; then`,
    `  [ ! -e "$dir" ] || { echo "Ya existe $dir y no es un clon de git: no se toca" >&2; exit 1; }`,
    `  git clone --quiet https://github.com/${REPO}.git "$dir" || { echo "git clone falló en $dir" >&2; exit 1; }`,
    `  echo "Clonado el kit en $dir"`,
    'fi',
    kitScript('"$dir"', tag, false, `--hub ${shq(hubUrl)} --host ${shq(hostId)} --token "$token"`),
  ].join('\n');
}

/** Installs (or reinstalls) the kit on a machine at the last release, and loads it in its tmux. */
export async function installKit(host: HostMonitor, latest: string | null, hubUrl: string, token: string): Promise<KitReport> {
  try {
    const tag = kitTag(latest);
    const published = await host.exec.run(['show-options', '-gqv', '@twb_kit_dir']).catch(() => '');
    const lines = await runKit(host, installScript(kitDir(published), tag, hubUrl, host.id), 180_000, `${token}\n`);
    const dir = lines.find((l) => l.startsWith('TWB_KIT_DIR='))?.slice('TWB_KIT_DIR='.length);
    const loaded = dir ? await reloadKit(host, dir) : true;
    host.forgetKit();
    const log = lines.filter((l) => l.trim() && !l.startsWith('TWB_KIT_DIR='));
    if (!loaded) log.push('tmux no está abierto en la máquina: el kit se cargará al abrirlo');
    return { ok: true, log: log.join('\n'), left: [] };
  } catch (err) {
    return { ok: false, log: (err as Error).message, left: [] };
  }
}

const LOWER_REPO = REPO.toLowerCase();

/**
 * Script that takes off a machine what the kit put there: its block in ~/.tmux.conf, its hooks
 * and status line in Claude Code's settings.json, the links of kits before 1.22, its config
 * and the clone (the hub's key goes after: removeKeyScript). A file in shared dotfiles (a link,
 * or in a linked folder) stays as it is, and then so does the clone if that file still needs
 * it: the other machines that share it keep working. Every such thing is a LEFT= line.
 */
export function uninstallScript(dir: string): string {
  return String.raw`PATH="$PATH:${EXTRA_PATH}"; export PATH
stamp=$(date +%Y%m%d-%H%M%S)
conf="${'${XDG_CONFIG_HOME:-$HOME/.config}'}/tmux-web-bridge"
dir=${dir}
keep=
left() { echo "LEFT=$*"; }
shared_dir() { d=$(dirname "$1"); [ -d "$d" ] && [ "$(cd -P "$d" && pwd)" != "$(cd "$d" && pwd -L)" ]; }
shared() { [ -L "$1" ] || shared_dir "$1"; }
# $2 (sin las líneas vacías del final) sobre $1, con copia; cat y no mv: un enlace lo sigue siendo.
put() { while [ -s "$2" ] && [ -z "$(tail -n 1 "$2")" ]; do sed -i.x '$d' "$2" && rm -f "$2.x"; done; cp "$1" "$1.bak.$stamp" && cat "$2" > "$1"; rm -f "$2"; }
cdir=$(cat "$conf/claude-dir" 2>/dev/null || true)
[ -n "$cdir" ] || cdir="$HOME/.claude"

for f in "$HOME/.tmux.conf" "$HOME/.config/tmux/tmux.conf"; do
  [ -f "$f" ] && grep -qE '^# >>> tmux-web-bridge|^source-file (-q )?.*tmux-web-bridge.*tmux\.conf$' "$f" || continue
  if shared "$f"; then
    left "$f es compartido (dotfiles): se deja el bloque del kit"
    grep -qE '^source-file [^-].*tmux-web-bridge.*tmux\.conf$' "$f" && keep="$f"
    continue
  fi
  t=$(mktemp)
  awk '/^# >>> tmux-web-bridge/ { skip = 1; next } skip { if (/^# <<< tmux-web-bridge/) skip = 0; next }
       /^# tmux-web-bridge: estados de Claude/ { next } /^source-file (-q )?.*tmux-web-bridge.*tmux\.conf$/ { next } { print }' "$f" > "$t"
  put "$f" "$t"
  echo "Quitado el kit de $f (copia: $f.bak.$stamp)"
done

old=
for f in "$HOME/.scripts/tmux-window-title.sh" "$HOME/.scripts/tmux-spaces.sh" "$cdir/scripts/statusline.sh"; do
  [ -L "$f" ] || continue
  case "$(readlink "$f")" in *tmux-web-bridge/host-kit/*) ;; *) continue ;; esac
  [ "$f" = "$cdir/scripts/statusline.sh" ] && old=1
  if shared_dir "$f"; then left "$f está en una carpeta compartida: se deja"; keep="$f"; continue; fi
  rm -f "$f"
  b=$(ls -1d "$f".bak.* 2>/dev/null | sort | tail -n 1)
  if [ -n "$b" ]; then mv "$b" "$f"; echo "Quitado el enlace del kit, y vuelve lo que había: $f"; else echo "Quitado el enlace del kit: $f"; fi
done

s="$cdir/settings.json"
uses='([.hooks[]?[]?.hooks[]?.command // ""] | any(test("tmux-window-title\\.sh"))) or ((.statusLine.command // "") | test("tmux-web-bridge"))'
if [ -f "$s" ] && command -v jq >/dev/null 2>&1 && jq -e "$uses" "$s" >/dev/null 2>&1; then
  if shared "$s"; then
    left "$s es compartido (dotfiles): se dejan los hooks y la status line del kit"
    keep="$s"
  else
    t=$(mktemp)
    jq --arg old "$old" '
      (if .hooks then .hooks |= (with_entries(.value |= map(select(((.hooks // []) | map(.command // "") | any(test("tmux-window-title\\.sh"))) | not))) | with_entries(select(.value | length > 0))) else . end)
      | (if ((.statusLine.command // "") | test("tmux-web-bridge")) or ($old != "" and ((.statusLine.command // "") | test("scripts/statusline\\.sh"))) then del(.statusLine) else . end)
      | (if .hooks == {} then del(.hooks) else . end)' "$s" > "$t" && put "$s" "$t" && echo "Quitados los hooks y la status line del kit de $s (copia: $s.bak.$stamp)"
  fi
elif [ -f "$s" ] && grep -q 'tmux-window-title' "$s"; then
  left "$s: sin jq no se pueden quitar los hooks del kit"
  keep="$s"
fi

rm -rf "$conf" "${'${XDG_DATA_HOME:-$HOME/.local/share}'}/tmux-web-bridge" && echo "Quitada la configuración del kit ($conf)"

if [ -d "$dir/.git" ]; then
  origin=$(git -C "$dir" remote get-url origin 2>/dev/null | tr 'A-Z' 'a-z')
  case "$origin" in
    */${LOWER_REPO}|*/${LOWER_REPO}.git|*:${LOWER_REPO}|*:${LOWER_REPO}.git)
      if [ -d "$dir/server/dist" ] || [ -d "$dir/node_modules" ]; then left "$dir: el clon es también la instalación de un servidor central, se deja"
      elif [ -n "$keep" ]; then left "$dir: se deja el clon, porque $keep aún lo usa"
      elif [ -n "$(git -C "$dir" status --porcelain 2>/dev/null)" ]; then left "$dir: el clon tiene cambios locales, se deja"
      else rm -rf "$dir" && echo "Borrado el clon del kit ($dir)"; fi ;;
    *) left "$dir no es un clon de twb: se deja" ;;
  esac
fi
true`;
}

/** Script that takes the hub's key out of the machine's authorized_keys: the last thing the hub does there. */
export function removeKeyScript(keyBlob: string): string {
  return String.raw`ak="$HOME/.ssh/authorized_keys"
if [ -f "$ak" ] && grep -qF '${keyBlob}' "$ak"; then
  if [ -L "$ak" ]; then echo "LEFT=$ak es un enlace: se deja la clave del hub"
  else t=$(mktemp); grep -vF '${keyBlob}' "$ak" > "$t" || true; cat "$t" > "$ak"; rm -f "$t"; echo "Quitada la clave del hub de $ak"; fi
fi
true`;
}

/** The keys of the prefix table the kit takes from tmux, with what they do in tmux. */
const DEFAULT_KEYS: Record<string, string> = {
  '!': 'break-pane',
  '"': 'split-window',
  $: `command-prompt -I "#S" "rename-session -- '%%'"`,
  '%': 'split-window -h',
  '&': 'confirm-before -p "kill-window #W? (y/n)" kill-window',
  '(': 'switch-client -p',
  ')': 'switch-client -n',
  x: 'confirm-before -p "kill-pane #P? (y/n)" kill-pane',
};
const KIT_SCRIPT = /tmux-window-title\.sh|tmux-spaces\.sh/;

/**
 * What undoes the kit in a running tmux, from its list-keys, as lines for source-file: the
 * keys it took go back to tmux's (or away), and the kill bindings it wrapped get their kill back.
 */
export function unbindKitKeys(listKeys: string): string[] {
  const out: string[] = [];
  for (const line of listKeys.split('\n')) {
    if (!KIT_SCRIPT.test(line)) continue;
    const m = /^bind-key\s+(-r\s+)?-T\s+(\S+)\s+(\S+)\s+(.*)$/.exec(line.trim());
    if (!m) continue;
    const [, repeat, table, key, command] = m;
    const unwrapped = command
      .replace(/run-shell\s+"[^"]*tmux-window-title\.sh close pane [^"]*"/g, 'kill-pane')
      .replace(/run-shell\s+"[^"]*tmux-window-title\.sh close window [^"]*"/g, 'kill-window');
    // list-keys writes some keys quoted ('$') or escaped (\", \$, \%).
    const own = table === 'prefix' ? DEFAULT_KEYS[key.replace(/^'(.+)'$/, '$1').replace(/^\\(.)$/, '$1')] : undefined;
    if (own) out.push(`bind-key -T prefix ${key} ${own}`);
    else if (!KIT_SCRIPT.test(unwrapped)) out.push(`bind-key ${repeat ?? ''}-T ${table} ${key} ${unwrapped}`);
    else out.push(`unbind-key -T ${table} ${key}`);
  }
  return out;
}

/** The hooks the kit's tmux.conf sets. */
const KIT_HOOKS = ['pane-focus-in', 'pane-exited', 'after-kill-pane', 'window-unlinked', 'session-created', 'session-closed'];

/**
 * Takes the kit out of a machine's running tmux, which loaded it with its tmux.conf: its keys,
 * hooks and options. The user's own tmux.conf is loaded again after, for what was theirs.
 */
async function unloadKit(host: HostMonitor): Promise<void> {
  const keys = await host.exec.run(['list-keys']).catch(() => '');
  const lines = [...unbindKitKeys(keys), ...KIT_HOOKS.map((h) => `set-hook -gu ${h}`), 'set-option -gu @twb_kit_dir', 'set-option -gu @twb_kit_version'];
  const h = host.hostConfig;
  const tmux = [h.tmux, '-u', ...h.socketArgs].map(shq).join(' ');
  await host.exec
    .shell(
      `PATH="$PATH:${EXTRA_PATH}"; export PATH; ${tmux} info >/dev/null 2>&1 || exit 0; f=$(mktemp); cat > "$f"; ${tmux} source-file "$f"; rm -f "$f"; ` +
        `for c in "$HOME/.tmux.conf" "$HOME/.config/tmux/tmux.conf"; do [ -f "$c" ] && ${tmux} source-file -q "$c" && break; done; true`,
      20_000,
      Buffer.from(`${lines.join('\n')}\n`),
    )
    .catch(() => {});
}

/** Takes the kit and the hub's key (if it has one) off a machine (see uninstallScript). */
export async function uninstallKit(host: HostMonitor, publicKey: string | null): Promise<KitReport> {
  const blob = publicKey?.split(/\s+/)[1] ?? '';
  try {
    const published = await host.exec.run(['show-options', '-gqv', '@twb_kit_dir']).catch(() => '');
    const lines = await runKit(host, uninstallScript(kitDir(published)));
    // After the files (it loads the user's tmux.conf again, which must not load the kit any more)
    // and before the key: without it, a new SSH connection would not get in.
    await unloadKit(host);
    host.forgetKit();
    if (/^[A-Za-z0-9+/=]+$/.test(blob)) lines.push(...(await runKit(host, removeKeyScript(blob))));
    const left = lines.filter((l) => l.startsWith('LEFT=')).map((l) => l.slice(5));
    return { ok: true, log: lines.filter((l) => l.trim() && !l.startsWith('LEFT=')).join('\n'), left };
  } catch (err) {
    return { ok: false, log: (err as Error).message, left: [] };
  }
}
