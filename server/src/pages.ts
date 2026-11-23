import { randomBytes } from 'node:crypto';
import { posix } from 'node:path';
import { shQuote as quote } from './exec.js';
import { FileError } from './files.js';
import type { HostMonitor } from './host.js';

// HTML files of a machine rendered as pages (the viewer's iframe and «Abrir aparte»). A
// page runs in a sandbox with an opaque origin, whose requests never carry the session
// cookie, so its address carries a token of its own instead: it serves the files of the
// page's folder and the folders below it, never a hidden one, nothing above and no link.

/** What a token gives access to: a folder of a machine (its physical path), for the session that asked. */
export interface PageGrant {
  host: string;
  dir: string;
  /** The password session that issued it; null without password login. */
  session: string | null;
}

/** A token unused for this long stops working. */
const IDLE_MS = 24 * 3600_000;

/**
 * The tokens of the pages opened from the panel, in memory: they die with the hub, after
 * 24 hours unused, and with the session that issued them. At most `max`, the least recently
 * used dropped first.
 */
export class PageTokens {
  /** In order of last use, oldest first. */
  private readonly grants = new Map<string, PageGrant & { used: number }>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly max = 500,
  ) {}

  issue(grant: PageGrant): string {
    const token = randomBytes(32).toString('base64url');
    this.grants.set(token, { ...grant, used: this.now() });
    for (const old of this.grants.keys()) {
      if (this.grants.size <= this.max) break;
      this.grants.delete(old);
    }
    return token;
  }

  /** What `token` gives access to, its use noted; null when it is unknown or expired. */
  get(token: string): PageGrant | null {
    const g = this.grants.get(token);
    if (!g) return null;
    this.grants.delete(token);
    if (this.now() - g.used > IDLE_MS) return null;
    g.used = this.now();
    this.grants.set(token, g);
    return { host: g.host, dir: g.dir, session: g.session };
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

/** The physical folder (links resolved) of the file at `path`, an absolute path; 404 when it is gone. */
export async function pageFolder(host: HostMonitor, path: string): Promise<string> {
  const out = await host.exec.shell(`cd -P ${quote(posix.dirname(path))} 2>/dev/null && pwd -P || echo MISSING`, 15_000);
  const dir = out.replace(/\n$/, '');
  if (!dir.startsWith('/')) throw new FileError('Esa carpeta ya no está', 404);
  return dir;
}
