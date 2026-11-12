import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExtTokenInfo } from '../../shared/types.js';

// The Trello extension: a browser extension that launches a Claude on a card from
// trello.com. It talks to the hub with its own token (Authorization: Bearer), made
// and revoked in Settings › Trello; the hub keeps only its hash, in dataDir/ext-token.json.

const sha256 = (s: string) => createHash('sha256').update(s).digest();

export class ExtTokenStore {
  private readonly file: string;
  private hash: Buffer | null = null;
  private createdAt = 0;

  constructor(dataDir: string) {
    this.file = join(dataDir, 'ext-token.json');
    if (!existsSync(this.file)) return;
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8')) as { hash?: string; createdAt?: number };
      if (typeof data.hash === 'string' && /^[0-9a-f]{64}$/.test(data.hash)) {
        this.hash = Buffer.from(data.hash, 'hex');
        this.createdAt = Number(data.createdAt) || 0;
      }
    } catch {
      console.warn('[ext] ext-token.json ilegible: la extensión de Trello no tiene token');
    }
  }

  get info(): ExtTokenInfo {
    return this.hash ? { active: true, createdAt: this.createdAt } : { active: false };
  }

  /** A new token, replacing the one there was. Shown once: only its hash is kept. */
  generate(): string {
    const token = `twbx_${randomBytes(32).toString('base64url')}`;
    this.hash = sha256(token);
    this.createdAt = Date.now();
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ hash: this.hash.toString('hex'), createdAt: this.createdAt }), { mode: 0o600 });
    renameSync(tmp, this.file);
    return token;
  }

  revoke(): void {
    this.hash = null;
    this.createdAt = 0;
    rmSync(this.file, { force: true });
  }

  /** Whether an Authorization header carries the token. */
  check(authorization: string | undefined): boolean {
    if (!this.hash) return false;
    const m = /^Bearer\s+(\S+)$/i.exec(authorization ?? '');
    return !!m && timingSafeEqual(sha256(m[1]), this.hash);
  }
}
