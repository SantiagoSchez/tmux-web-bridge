import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HubSettings } from '../../shared/types.js';

const DEFAULTS: HubSettings = { limitsInStatusLine: true };

/**
 * Settings of the whole hub, chosen in the web app and kept in dataDir so every
 * device sees the same ones.
 *
 * Events: 'change' (HubSettings).
 */
export class SettingsStore extends EventEmitter {
  private readonly path: string;
  private state: HubSettings = DEFAULTS;

  constructor(dataDir: string) {
    super();
    this.path = join(dataDir, 'settings.json');
    try {
      if (existsSync(this.path)) this.state = { ...DEFAULTS, ...JSON.parse(readFileSync(this.path, 'utf8')) };
    } catch {
      /* unreadable: defaults */
    }
  }

  get value(): HubSettings {
    return this.state;
  }

  /** Only known keys with a value of the right type are kept. */
  update(patch: Partial<HubSettings>): void {
    const next = { ...this.state };
    if (typeof patch.limitsInStatusLine === 'boolean') next.limitsInStatusLine = patch.limitsInStatusLine;
    this.state = next;
    try {
      writeFileSync(this.path, JSON.stringify(next, null, 2));
    } catch (err) {
      console.warn(`[settings] no se pudo guardar ${this.path}: ${(err as Error).message}`);
    }
    this.emit('change', next);
  }
}
