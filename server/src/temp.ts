import { randomInt } from 'node:crypto';
import type { HostInfo } from '../../shared/types.js';
import type { HostMonitor } from './host.js';

// Throwaway windows: a new folder in the machine's temp dir, a space or a window there
// marked with @twb_temp (its folder), and the folder removed once nothing uses it.

/** The window option that marks a temporary window: its folder. */
export const TEMP_OPTION = '@twb_temp';

/** Only folders made here are ever removed: …/twb-tmp-xxxx. */
const TEMP_DIR = /^\/.+\/twb-tmp-[a-z0-9]{4,}$/;

const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** A short random name: tmp-k3f9 for the space or window, twb-tmp-k3f9 for its folder. */
export function tempSuffix(): string {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  return Array.from({ length: 4 }, () => abc[randomInt(abc.length)]).join('');
}

/** Makes …/twb-tmp-<suffix> in the host's temp dir (only its user can enter it): its real path. */
export async function makeTempDir(host: HostMonitor, suffix: string): Promise<string> {
  const dir = `"\${TMPDIR:-/tmp}"/twb-tmp-${suffix}`;
  const out = (await host.exec.shell(`mkdir -m 700 ${dir} && cd ${dir} && pwd -P`)).trim();
  if (!TEMP_DIR.test(out)) throw new Error(`No se pudo crear la carpeta temporal en ${host.name}`);
  return out;
}

/** Whether a pane's folder is that one or inside it. */
const inside = (path: string, dir: string) => path === dir || path.startsWith(`${dir}/`);

/**
 * Removes the temp folders of a host's windows when nothing uses them any more: no
 * window marked with it, no pane in it. After the hub (re)connects to the host, the ones
 * it no longer knows about (a window closed meanwhile) are swept too.
 */
export class TempFolders {
  /** Folders of the marked windows seen so far. */
  private readonly known = new Set<string>();
  private wasOk = false;

  constructor(private readonly host: HostMonitor) {
    host.on('change', (info: HostInfo) => this.check(info));
  }

  check(info: HostInfo): void {
    const ok = info.status === 'ok';
    const fresh = ok && !this.wasOk;
    this.wasOk = ok;
    if (!ok) return;
    const windows = info.sessions.flatMap((s) => s.windows);
    const marked = new Set(windows.flatMap((w) => (w.temp ? [w.temp] : [])));
    const paths = windows.flatMap((w) => w.panes.map((p) => p.path));
    const used = (dir: string) => marked.has(dir) || paths.some((p) => inside(p, dir));
    const gone = [...this.known].filter((d) => !used(d));
    for (const d of gone) this.known.delete(d);
    for (const d of marked) this.known.add(d);
    if (gone.length) void this.remove(gone);
    if (fresh) void this.sweep(used);
  }

  private async remove(dirs: string[]): Promise<void> {
    const safe = dirs.filter((d) => TEMP_DIR.test(d));
    if (!safe.length) return;
    await this.host.exec.shell(`rm -rf -- ${safe.map(quote).join(' ')}`, 60_000).catch(() => {});
  }

  /** The temp folders of the host that no window uses: older than 2 minutes, so none just being made. */
  private async sweep(used: (dir: string) => boolean): Promise<void> {
    const script =
      `for d in "\${TMPDIR:-/tmp}"/twb-tmp-*; do [ -d "$d" ] || continue; ` +
      `[ -n "$(find "$d" -maxdepth 0 -mmin +2 2>/dev/null)" ] && (cd "$d" && pwd -P); done; true`;
    const out = await this.host.exec.shell(script, 20_000).catch(() => '');
    const orphans = [...new Set(out.split('\n').filter(Boolean))].filter((d) => !used(d));
    if (orphans.length) await this.remove(orphans);
  }
}
