import { gunzipSync, gzipSync } from 'node:zlib';
import type { HostLogin } from './account-store.js';
import type { OAuthCred } from './claude-oauth.js';
import type { TmuxExec } from './exec.js';

// Reading and writing a machine's Claude Code login over the same SSH the hub uses
// for tmux. Only POSIX sh and tools every Mac and Linux has: no host-kit needed.
//
// Where Claude Code keeps it (default config folder only, as the statusline):
// - the login: ~/.claude/.credentials.json on Linux, the Keychain item
//   "Claude Code-credentials" (account $USER) on macOS. Claude Code re-reads the
//   file when its mtime changes, and the Keychain within ~30 s, so a running Claude
//   picks a switch up on its own.
// - who it is: `oauthAccount` in ~/.claude.json.
//
// A switch takes the locks Claude Code takes for the same files (proper-lockfile:
// a directory per lock, stale after a minute at most): the two of a token refresh,
// ~/.claude/.oauth_refresh.lock and ~/.claude.lock, and the config's,
// ~/.claude.json.lock. With them held, a refresh cannot land halfway through a switch,
// and Claude Code finds the new login when it gets them back.

const SCRIPT = String.raw`
umask 077
H="$HOME"; C="$H/.claude"; CONF="$H/.claude.json"; CREDS="$C/.credentials.json"
SVC="Claude Code-credentials"; U="$USER"; [ -n "$U" ] || U=$(id -un); OS=$(uname -s)
HELD=""
release() { for d in $HELD; do rmdir "$d" 2>/dev/null; done; HELD=""; }
trap release EXIT
trap 'release; exit 1' INT TERM HUP
take() {
  n=0
  until mkdir "$1" 2>/dev/null; do
    if [ -n "$(find "$1" -maxdepth 0 -mmin +1 2>/dev/null)" ]; then rmdir "$1" 2>/dev/null; continue; fi
    n=$((n+1)); if [ $n -ge 100 ]; then echo "ERR lock $1"; exit 3; fi
    sleep 0.1
  done
  HELD="$1 $HELD"
}
# Replaces a file with what comes on stdin; through a symlink (dotfiles) it writes the target.
put() {
  cat > "$1.twb" && chmod 600 "$1.twb" || return 1
  if [ -L "$1" ]; then cat "$1.twb" > "$1" && rm -f "$1.twb"; else mv -f "$1.twb" "$1"; fi
}
if printf '' | base64 -d >/dev/null 2>&1; then D=-d; else D=-D; fi
b64() { base64 | tr -d '\n'; }
echo "OS $OS"
if [ "$MODE" = switch ]; then
  mkdir -p "$C"
  take "$C/.oauth_refresh.lock"; take "$H/.claude.lock"; take "$CONF.lock"
fi
printf 'CRED '
if [ "$OS" = Darwin ]; then security find-generic-password -s "$SVC" -a "$U" -w 2>/dev/null | b64; else cat "$CREDS" 2>/dev/null | b64; fi
echo
printf 'CONF '; gzip -c "$CONF" 2>/dev/null | b64; echo
[ "$MODE" = switch ] || exit 0
echo READY
read -r cmd || exit 4
[ "$cmd" = WRITE ] || { echo SKIPPED; exit 0; }
read -r conf || exit 4
read -r cred || exit 4
# The login first: on a Mac the Keychain is what may refuse, and then nothing has changed.
if [ "$OS" = Darwin ]; then
  line="add-generic-password -U -a \"$U\" -s \"$SVC\" -X \"$cred\""
  if [ "$(printf %s "$line" | wc -c)" -le 4032 ]; then printf '%s\n' "$line" | security -i >/dev/null 2>&1; else security add-generic-password -U -a "$U" -s "$SVC" -X "$cred" >/dev/null 2>&1; fi || { echo "ERR keychain"; exit 6; }
else
  printf %s "$cred" | base64 $D | put "$CREDS" || { echo "ERR creds"; exit 6; }
fi
printf %s "$conf" | base64 $D | gunzip | put "$CONF" || { echo "ERR conf"; exit 5; }
echo DONE
`;

/** What the script prints before it waits for the hub (switch) or ends (inspect). */
export interface HostSnapshot extends HostLogin {
  os: string;
  /** The whole credentials document: it may hold more than the login (MCP servers' tokens). */
  credsDoc: Record<string, unknown> | null;
  /** The whole ~/.claude.json, null if missing. */
  config: Record<string, unknown> | null;
}

const SCRIPT_ERRORS: Record<string, string> = {
  lock: 'Claude Code tiene ocupados sus ficheros (se está renovando la sesión); prueba otra vez en unos segundos',
  conf: 'no se pudo escribir ~/.claude.json',
  keychain: 'no se pudo escribir en el Llavero (¿está bloqueado? Inicia sesión en el Mac)',
  creds: 'no se pudo escribir ~/.claude/.credentials.json',
};

function fromB64(s: string): Buffer {
  return Buffer.from(s.trim(), 'base64');
}

/** The Keychain hands back a password with odd bytes as hex. */
function credsText(raw: Buffer): string {
  const s = raw.toString('utf8').trim();
  return /^[0-9a-f]+$/i.test(s) && s.length % 2 === 0 && !s.startsWith('{') ? Buffer.from(s, 'hex').toString('utf8') : s;
}

/** Parses the script's lines up to READY (or the end). Exported for the tests. */
export function parseSnapshot(out: string): HostSnapshot {
  const err = /^ERR (\w+)/m.exec(out);
  if (err) throw new Error(SCRIPT_ERRORS[err[1]] ?? err[0]);
  const line = (key: string) => new RegExp(`^${key} ?(.*)$`, 'm').exec(out)?.[1] ?? null;
  const os = line('OS');
  if (!os) throw new Error('la máquina no ha contestado como se esperaba');
  let credsDoc: Record<string, unknown> | null = null;
  const credRaw = line('CRED');
  if (credRaw) {
    try {
      credsDoc = JSON.parse(credsText(fromB64(credRaw)));
    } catch {
      throw new Error('las credenciales de Claude Code de la máquina no se pueden leer');
    }
  }
  let config: Record<string, unknown> | null = null;
  const confRaw = line('CONF');
  if (confRaw) {
    try {
      config = JSON.parse(gunzipSync(fromB64(confRaw)).toString('utf8'));
    } catch {
      throw new Error('~/.claude.json de la máquina no se puede leer');
    }
  }
  const cred = (credsDoc?.claudeAiOauth as OAuthCred | undefined) ?? null;
  const oauthAccount = (config?.oauthAccount as Record<string, unknown> | undefined) ?? null;
  return { os, credsDoc, config, cred: cred?.refreshToken ? cred : null, oauthAccount };
}

/** What Claude Code is logged in with on a machine. Read only: no locks taken. */
export async function inspectHost(exec: TmuxExec): Promise<HostSnapshot> {
  return parseSnapshot(await exec.shell(`MODE=inspect\n${SCRIPT}`, 30_000));
}

/** The documents to write for a switch: the machine's own, with only the login and the account replaced. */
export function switchedDocs(snap: HostSnapshot, cred: OAuthCred, oauthAccount: Record<string, unknown>): { config: string; creds: string } {
  // The account's own snapshot replaces the outgoing one whole: no field of the old
  // account may survive. Claude Code fills in what is missing from the profile itself.
  const config = { ...(snap.config ?? {}), oauthAccount };
  const creds = { ...(snap.credsDoc ?? {}), claudeAiOauth: cred };
  return { config: `${JSON.stringify(config, null, 2)}\n`, creds: JSON.stringify(creds) };
}

/**
 * Switches a machine's Claude Code to a login, under Claude Code's own locks.
 * `decide` gets what the machine had (current: read under the locks) and says what
 * to write, or null to leave it as it is; it must not touch the network, since the
 * locks are held meanwhile. Resolves with what the machine had, once the new login
 * is written (or skipped).
 */
export function switchHost(
  exec: TmuxExec,
  decide: (snap: HostSnapshot) => { cred: OAuthCred; oauthAccount: Record<string, unknown> } | null,
): Promise<{ snap: HostSnapshot; written: boolean }> {
  return new Promise((resolve, reject) => {
    const child = exec.spawnShell(`MODE=switch\n${SCRIPT}`);
    let out = '';
    let err = '';
    let snap: HostSnapshot | null = null;
    let answered = false;
    let failure: Error | null = null;
    // Locks held on the machine: never for long. ssh dies with the timer, and the
    // script's trap lets the locks go.
    const timer = setTimeout(() => {
      failure = new Error('la máquina no ha terminado a tiempo');
      child.kill('SIGTERM');
    }, 20_000);
    child.stdout!.setEncoding('utf8');
    child.stderr!.setEncoding('utf8');
    child.stderr!.on('data', (d: string) => (err += d));
    child.stdout!.on('data', (d: string) => {
      out += d;
      if (answered || !/^(READY|ERR .*)$/m.test(out)) return;
      answered = true;
      try {
        snap = parseSnapshot(out);
        const write = decide(snap);
        if (!write) return void child.stdin!.end('SKIP\n');
        const docs = switchedDocs(snap, write.cred, write.oauthAccount);
        const creds = Buffer.from(docs.creds, 'utf8').toString(snap.os === 'Darwin' ? 'hex' : 'base64');
        child.stdin!.end(`WRITE\n${gzipSync(docs.config).toString('base64')}\n${creds}\n`);
      } catch (e) {
        failure = e as Error;
        child.stdin!.end('SKIP\n');
      }
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (failure) return reject(failure);
      const scriptErr = /^ERR (\w+)/m.exec(out);
      if (scriptErr) return reject(new Error(SCRIPT_ERRORS[scriptErr[1]] ?? scriptErr[0]));
      if (snap && /^DONE$/m.test(out)) return resolve({ snap, written: true });
      if (snap && /^SKIPPED$/m.test(out)) return resolve({ snap, written: false });
      reject(new Error(err.trim().split('\n').pop() || `ssh terminó con ${code}`));
    });
  });
}
