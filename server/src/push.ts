import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import webpush, { type PushSubscription } from 'web-push';
import type { PushPayload } from '../../shared/types.js';
import type { Config } from './config.js';

interface StoredSubscription extends PushSubscription {
  addedAt: number;
  login?: string;
  userAgent?: string;
}

/** Web Push: VAPID keys and browser subscriptions, persisted in dataDir. */
export class PushService {
  readonly publicKey: string;
  private subs: StoredSubscription[] = [];
  private readonly subsPath: string;

  constructor(config: Config) {
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

  /** Sends to every subscribed browser. Returns how many accepted it. */
  async send(payload: PushPayload, only?: string): Promise<number> {
    const body = JSON.stringify(payload);
    const targets = only ? this.subs.filter((s) => s.endpoint === only) : this.subs;
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
