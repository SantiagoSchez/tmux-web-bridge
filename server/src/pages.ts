import { randomBytes } from 'node:crypto';
import { shQuote as quote } from './exec.js';
import { FileError } from './files.js';
import type { HostMonitor } from './host.js';

// HTML files of a machine rendered as pages (the viewer's iframe and «Abrir aparte»). A
// page runs in a sandbox with an opaque origin, whose requests never carry the session
// cookie, so its address carries a token of its own instead: it serves the files of the
// page's folder and the folders below it, never a hidden one, nothing above and no link.

/** What a token gives access to: a folder of a machine (its physical path), for whoever asked and from where. */
export interface PageGrant {
  host: string;
  dir: string;
  /** The only file of `dir` it serves, when `dir` is too broad to hand to a page (pageTarget). */
  only: string | null;
  /** The password session that issued it; null without password login. */
  session: string | null;
  /** The network address that asked for it: no other one may use it. */
  ip: string;
}

/** A token works for this long after its issue, used or not. */
const LIFETIME_MS = 24 * 3600_000;

/**
 * The tokens of the pages opened from the panel, in memory. A page's script can read its
 * own token and send it out, so a token is never renewed: it works only from the address
 * that asked for it, for 24 hours after its issue, while its session exists (closed or
 * expired), and until the hub stops. At most `max`, the least recently used dropped first.
 */
export class PageTokens {
  /** In order of last use, oldest first. */
  private readonly grants = new Map<string, PageGrant & { issued: number }>();
  private readonly now: () => number;
  private readonly max: number;
  private readonly sessionAlive: (id: string) => boolean;

  constructor(opts: { now?: () => number; max?: number; sessionAlive?: (id: string) => boolean } = {}) {
    this.now = opts.now ?? Date.now;
    this.max = opts.max ?? 500;
    this.sessionAlive = opts.sessionAlive ?? (() => true);
  }

  issue(grant: PageGrant): string {
    const token = randomBytes(32).toString('base64url');
    this.grants.set(token, { ...grant, issued: this.now() });
    for (const old of this.grants.keys()) {
      if (this.grants.size <= this.max) break;
      this.grants.delete(old);
    }
    return token;
  }

  /** What `token` gives to a request from `ip`, its use noted; null when it is unknown, expired or not theirs. */
  get(token: string, ip: string): PageGrant | null {
    const g = this.grants.get(token);
    if (!g) return null;
    if (this.now() - g.issued > LIFETIME_MS || (g.session !== null && !this.sessionAlive(g.session))) {
      this.grants.delete(token);
      return null;
    }
    if (ip !== g.ip) return null;
    this.grants.delete(token);
    this.grants.set(token, g);
    return { host: g.host, dir: g.dir, only: g.only, session: g.session, ip: g.ip };
  }

  /** The sessions closed (logout, closing the others or all of them): their pages stop working. */
  dropSessions(ids: string[]): void {
    const closed = new Set(ids);
    for (const [token, g] of this.grants) if (g.session !== null && closed.has(g.session)) this.grants.delete(token);
  }
}

/**
 * A path a page asks for below its folder, as it is; null when it is not one: empty, with
 * an empty part, a part starting with a dot (hidden files, `.` and `..`), a backslash, or
 * a NUL or line break.
 */
export function pagePath(raw: string): string | null {
  if (!raw || /[\0\n\r\\]/.test(raw)) return null;
  const parts = raw.split('/');
  return parts.every((p) => p !== '' && !p.startsWith('.')) ? raw : null;
}

/**
 * A file below a page's folder (`rel` already checked by pagePath): its whole path and size.
 * Refused (404) when it is missing, not a regular file, or any part of `rel` is a symbolic
 * link, which could lead out of the folder or to a hidden file.
 */
export async function statPageFile(host: HostMonitor, dir: string, rel: string): Promise<{ path: string; size: number }> {
  const parts = rel.split('/').map(quote).join(' ');
  const out = await host.exec.shell(
    `cd -P ${quote(dir)} 2>/dev/null || { echo MISSING; exit 0; }; ` +
      `p=''; for s in ${parts}; do p=\${p:+$p/}$s; if [ -L "$p" ]; then echo LINK; exit 0; fi; done; ` +
      `if [ -f "$p" ]; then printf '%s\\t%s/%s\\n' "$(wc -c < "$p" | tr -d ' ')" "$(pwd -P)" "$p"; else echo MISSING; fi`,
    15_000,
  );
  const m = /^(\d+)\t(.+)\n?$/.exec(out);
  if (!m) throw new FileError('No existe', 404);
  return { size: Number(m[1]), path: m[2] };
}

/** How many symbolic links pageTarget follows before giving up (a loop). */
const MAX_LINKS = 40;

/**
 * The real file a page at `path` (an absolute path) is: links to it followed one at a time
 * (`readlink` without -f, which older macOS lacks), and the physical path of its folder,
 * which the page's token is issued for. `broad` when that folder is too broad to hand to a
 * page's scripts: `/`, the home folder or one above it, or a temporary root (`/tmp`,
 * `/var/tmp`, `$TMPDIR`). 404 when it is gone, not a regular file, or a loop.
 */
export async function pageTarget(host: HostMonitor, path: string): Promise<{ dir: string; name: string; broad: boolean }> {
  const out = await host.exec.shell(
    `f=${quote(path)}; n=0; ` +
      `while [ -L "$f" ]; do n=$((n + 1)); [ "$n" -le ${MAX_LINKS} ] || { echo MISSING; exit 0; }; ` +
      `l=$(readlink "$f"); case $l in /*) f=$l ;; *) f=\${f%/*}/$l ;; esac; done; ` +
      `[ -f "$f" ] || { echo MISSING; exit 0; }; d=\${f%/*}; ` +
      `cd -P "\${d:-/}" 2>/dev/null || { echo MISSING; exit 0; }; d=$(pwd -P); w=0; ` +
      `[ "$d" = / ] && w=1; h=$(cd -P ~ 2>/dev/null && pwd -P); ` +
      `if [ -n "$h" ]; then case $h in "$d"|"$d"/*) w=1 ;; esac; fi; ` +
      `for t in /tmp /var/tmp "\${TMPDIR:-}"; do [ -n "$t" ] || continue; ` +
      `t=$(cd -P "$t" 2>/dev/null && pwd -P) || continue; [ "$d" = "$t" ] && w=1; done; ` +
      `printf '%s\\t%s\\t%s\\n' "$d" "\${f##*/}" "$w"`,
    15_000,
  );
  const m = /^(\/[^\t\n]*)\t([^\t\n]+)\t([01])\n?$/.exec(out);
  if (!m) throw new FileError('No existe', 404);
  return { dir: m[1], name: m[2], broad: m[3] === '1' };
}
