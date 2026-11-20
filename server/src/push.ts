import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import webpush, { type PushSubscription } from 'web-push';
import type { QuietReason } from '../../shared/mute.js';
import type { PushPayload } from '../../shared/types.js';
import type { Config } from './config.js';

export type { QuietReason };

interface StoredSubscription extends PushSubscription {
  addedAt: number;
  login?: string;
  userAgent?: string;
}

/** What the `[push]` line says after «no se envía, » for each reason. */
export const QUIET_LOG: Record<QuietReason, string> = {
  muted: 'las notificaciones están silenciadas',
  'quiet hours': 'es horario de descanso',
};

/**
 * Web Push: VAPID keys and browser subscriptions, persisted in dataDir. Every push goes
 * through send(), which drops it while muted or inside the quiet schedule.
 */
export class PushService {
  readonly publicKey: string;
  private subs: StoredSubscription[] = [];
  private readonly subsPath: string;

  /** `quiet`: why pushes are held back right now, or null when they go out. */
  constructor(
    config: Config,
    readonly quiet: () => QuietReason | null,
  ) {
    const keysPath = join(config.dataDir, 'vapid.json');
    let keys: { publicKey: string; privateKey: string };
    if (existsSync(keysPath)) {
      keys = JSON.parse(readFileSync(keysPath, 'utf8'));
    } else {
      keys = webpush.generateVAPIDKeys();
      writeFileSync(keysPath, JSON.stringify(keys, null, 2), { mode: 0o600 });
    }
    webpush.setVapidDetails(config.vapidSubject, keys.publicKey, keys.privateKey);
    this.publicKey = keys.publicKey;

    this.subsPath = join(config.dataDir, 'push-subscriptions.json');
    if (existsSync(this.subsPath)) this.subs = JSON.parse(readFileSync(this.subsPath, 'utf8'));
  }

  private save(): void {
    writeFileSync(this.subsPath, JSON.stringify(this.subs, null, 2), { mode: 0o600 });
  }

  get count(): number {
    return this.subs.length;
  }

  has(endpoint: string): boolean {
    return this.subs.some((s) => s.endpoint === endpoint);
  }

  subscribe(sub: PushSubscription, meta: { login?: string; userAgent?: string }): void {
    this.subs = this.subs.filter((s) => s.endpoint !== sub.endpoint);
    this.subs.push({ endpoint: sub.endpoint, keys: sub.keys, addedAt: Date.now(), ...meta });
    this.save();
  }

  unsubscribe(endpoint: string): void {
    this.subs = this.subs.filter((s) => s.endpoint !== endpoint);
    this.save();
  }

  /**
   * Sends to every subscribed browser, or `only` to those endpoints. Returns how many accepted it:
   * none while muted or inside the quiet schedule, unless `evenWhenQuiet` (the test notification).
   */
  async send(payload: PushPayload, only?: readonly string[], { evenWhenQuiet = false } = {}): Promise<number> {
    const quiet = evenWhenQuiet ? null : this.quiet();
    if (quiet) {
      console.log(`[push] ${payload.title}: no se envía, ${QUIET_LOG[quiet]}`);
      return 0;
    }
    const body = JSON.stringify(payload);
    const targets = only ? this.subs.filter((s) => only.includes(s.endpoint)) : this.subs;
    let ok = 0;
    const gone: string[] = [];
    await Promise.all(
      targets.map(async (sub) => {
        try {
          // The topic collapses pending pushes of the same pane in the push service.
          const topic = payload.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined;
          await webpush.sendNotification(sub, body, { TTL: 600, urgency: 'high', topic });
          ok++;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) gone.push(sub.endpoint);
          else console.warn(`[push] fallo al enviar a ${new URL(sub.endpoint).host}: ${(err as Error).message}`);
        }
      }),
    );
    if (gone.length) {
      this.subs = this.subs.filter((s) => !gone.includes(s.endpoint));
      this.save();
    }
    return ok;
  }
}
