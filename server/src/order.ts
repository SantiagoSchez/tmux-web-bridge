import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Order of the machines in the list, chosen in the web app and kept in dataDir
 * so every device sees the same one. Machines it does not name (added later)
 * go last, in the order they were added.
 */
export class HostOrder {
  private readonly path: string;
  private ids: string[] = [];

  constructor(
    dataDir: string,
    /** The machines there are now. */
    private readonly current: () => string[],
  ) {
    this.path = join(dataDir, 'host-order.json');
    try {
      const saved: unknown = existsSync(this.path) ? JSON.parse(readFileSync(this.path, 'utf8')) : [];
      if (Array.isArray(saved)) this.ids = saved.map(String);
    } catch {
      /* unreadable: config order */
    }
  }

  /** Every machine's id, in the chosen order. */
  get list(): string[] {
    const known = this.current();
    const saved = this.ids.filter((id) => known.includes(id));
    return [...saved, ...known.filter((id) => !saved.includes(id))];
  }

  set(ids: string[]): void {
    const known = this.current();
    this.ids = ids.filter((id, i) => known.includes(id) && ids.indexOf(id) === i);
    writeFileSync(this.path, JSON.stringify(this.ids, null, 2));
  }
}
