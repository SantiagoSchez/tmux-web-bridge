import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import QRCode from 'qrcode';

// Two-step verification for the password login: a TOTP code (RFC 6238, the
// 6 digits of any authenticator app) or a one-time recovery code. Turned on
// from the app's settings; deleting dataDir/2fa.json turns it off.

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function unbase32(s: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of s.toUpperCase().replace(/=+$/, '')) {
    const i = B32.indexOf(c);
    if (i < 0) continue;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

const STEP_SECONDS = 30;

function hotp(key: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', key).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/** Time step the code matches (one step of clock drift either way), or null. Never one already used. */
function matchStep(secret: string, code: string, after: number): number | null {
  const key = unbase32(secret);
  const now = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  for (const step of [now - 1, now, now + 1]) {
    if (step > after && timingSafeEqual(Buffer.from(hotp(key, step)), Buffer.from(code))) return step;
  }
  return null;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
/** Spaces, dashes and case do not matter when typing a code. */
const normalize = (code: string) => code.replace(/[\s-]/g, '').toLowerCase();

/** 10 codes like "k3x9d-w2mfa", shown once; only their hashes are kept. */
function recoveryCodes(): { codes: string[]; hashes: string[] } {
  const codes = Array.from({ length: 10 }, () => {
    const s = base32(randomBytes(7)).slice(0, 10).toLowerCase();
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
  return { codes, hashes: codes.map((c) => sha(normalize(c))) };
}

interface Stored {
  secret: string;
  recovery: string[];
  /** Last TOTP step accepted: a code works once. */
  lastStep: number;
  enabledAt: number;
}

export class TwoFactor {
  private readonly file: string;
  /** Secrets shown as a QR and not confirmed yet, by password session. */
  private readonly pending = new Map<string, { secret: string; at: number }>();

  constructor(dataDir: string) {
    this.file = join(dataDir, '2fa.json');
  }

  /** Read on every use, so deleting the file turns it off without restarting the hub. */
  private load(): Stored | null {
    if (!existsSync(this.file)) return null;
    try {
      return JSON.parse(readFileSync(this.file, 'utf8')) as Stored;
    } catch {
      return null;
    }
  }

  private save(data: Stored): void {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 1), { mode: 0o600 });
    renameSync(tmp, this.file);
  }

  get enabled(): boolean {
    return this.load() !== null;
  }

  get recoveryLeft(): number {
    return this.load()?.recovery.length ?? 0;
  }

  /** A new secret for this session, as an otpauth:// QR for the authenticator app. */
  async setup(sessionId: string, host: string): Promise<{ secret: string; uri: string; svg: string }> {
    const secret = base32(randomBytes(20));
    this.pending.set(sessionId, { secret, at: Date.now() });
    const uri = `otpauth://totp/${encodeURIComponent(`twb:${host}`)}?secret=${secret}&issuer=twb&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
    const svg = await QRCode.toString(uri, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });
    return { secret, uri, svg };
  }

  /** Confirms the QR with a first code. Returns the recovery codes, or null if the code is wrong. */
  enable(sessionId: string, code: string): string[] | null {
    const p = this.pending.get(sessionId);
    if (!p || Date.now() - p.at > 15 * 60_000) return null;
    const step = matchStep(p.secret, normalize(code), 0);
    if (step === null) return null;
    this.pending.delete(sessionId);
    const { codes, hashes } = recoveryCodes();
    this.save({ secret: p.secret, recovery: hashes, lastStep: step, enabledAt: Date.now() });
    return codes;
  }

  /** A TOTP code, or a recovery code (used up). True with 2FA off. */
  verify(code: string): boolean {
    const data = this.load();
    if (!data) return true;
    const c = normalize(code);
    if (/^\d{6}$/.test(c)) {
      const step = matchStep(data.secret, c, data.lastStep);
      if (step === null) return false;
      this.save({ ...data, lastStep: step });
      return true;
    }
    const i = data.recovery.indexOf(sha(c));
    if (i < 0) return false;
    this.save({ ...data, recovery: data.recovery.filter((_, j) => j !== i) });
    return true;
  }

  disable(code: string): boolean {
    if (!this.enabled || !this.verify(code)) return false;
    rmSync(this.file, { force: true });
    return true;
  }

  /** New recovery codes (the old ones stop working), or null if the code is wrong. */
  regenerate(code: string): string[] | null {
    if (!this.enabled || !this.verify(code)) return null;
    const { codes, hashes } = recoveryCodes();
    this.save({ ...this.load()!, recovery: hashes });
    return codes;
  }
}
