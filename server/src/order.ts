import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Order of the machines in the list, chosen in the web app and kept in dataDir
 * so every device sees the same one. Machines it does not name (added to the
 * config later) go last, in config order.
 */
export class HostOrder {
  private readonly path: string;
  private ids: string[] = [];

  constructor(
    dataDir: string,
    private readonly known: string[],
  ) {
    this.path = join(dataDir, 'host-order.json');
    try {
      const saved: unknown = existsSync(this.path) ? JSON.parse(readFileSync(this.path, 'utf8')) : [];
      if (Array.isArray(saved)) this.ids = saved.map(String);
    } catch {
      /* unreadable: config order */
    }
  }

  /** Every configured host id, in the chosen order. */
  get list(): string[] {
    const saved = this.ids.filter((id) => this.known.includes(id));
    return [...saved, ...this.known.filter((id) => !saved.includes(id))];
  }

  set(ids: string[]): void {
    this.ids = ids.filter((id, i) => this.known.includes(id) && ids.indexOf(id) === i);
    writeFileSync(this.path, JSON.stringify(this.ids, null, 2));
  }
}
