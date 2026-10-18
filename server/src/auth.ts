import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import type { FastifyReply, FastifyRequest } from 'fastify';

// Password login for when the panel is published by a reverse proxy instead of
// `tailscale serve`, so there is no Tailscale identity to trust.

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 32;
const MAXMEM = 64 * 1024 * 1024;

function scryptAsync(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, KEYLEN, { N: n, r, p, maxmem: MAXMEM }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** "scrypt$N$r$p$salt$hash" (base64url), what goes in config.yaml as auth.passwordHash. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, N, R, P);
  return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, n, r, p, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64url');
  const got = await scryptAsync(password, Buffer.from(salt, 'base64url'), Number(n), Number(r), Number(p));
  return got.length === want.length && timingSafeEqual(got, want);
}

export function isPasswordHash(v: string): boolean {
  return /^scrypt\$\d+\$\d+\$\d+\$[\w-]+\$[\w-]+$/.test(v);
}

// ---------------------------------------------------------------- sessions

export const COOKIE = 'twb_session';

interface Session {
  createdAt: number;
  lastSeen: number;
  ip?: string;
  userAgent?: string;
}

const sha = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Logged-in browsers. The cookie holds a random token; only its hash is kept on
 * disk, so the file is useless to log in with. A session ends after `days`
 * without use, on logout, or when every session is closed from the app.
 */
export class SessionStore {
  private readonly file: string;
  private readonly sessions = new Map<string, Session>();
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(
    dataDir: string,
    private readonly days: number,
  ) {
    this.file = join(dataDir, 'sessions.json');
    if (existsSync(this.file)) {
      try {
        for (const [k, v] of Object.entries(JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, Session>)) this.sessions.set(k, v);
      } catch {
        /* corrupt file: everyone logs in again */
      }
    }
  }

  get maxAgeSeconds(): number {
    return this.days * 86400;
  }

  create(meta: { ip?: string; userAgent?: string }): string {
    const token = randomBytes(32).toString('base64url');
    this.sessions.set(sha(token), { createdAt: Date.now(), lastSeen: Date.now(), ...meta });
    this.save();
    return token;
  }

  /** Session id (the token's hash) if the token is valid; refreshes its idle timer. */
  check(token: string | undefined): string | null {
    if (!token) return null;
    const id = sha(token);
    const s = this.sessions.get(id);
    if (!s) return null;
    if (Date.now() - s.lastSeen > this.maxAgeSeconds * 1000) {
      this.sessions.delete(id);
      this.save();
      return null;
    }
    if (Date.now() - s.lastSeen > 60_000) {
      s.lastSeen = Date.now();
      this.save();
    }
    return id;
  }

  revoke(id: string): void {
    if (this.sessions.delete(id)) this.save();
  }

  /** Every session but `keep`; returns the ids closed. */
  revokeOthers(keep: string): string[] {
    const ids = [...this.sessions.keys()].filter((id) => id !== keep);
    for (const id of ids) this.sessions.delete(id);
    if (ids.length) this.save();
    return ids;
  }

  revokeAll(): string[] {
    const ids = [...this.sessions.keys()];
    this.sessions.clear();
    this.save();
    return ids;
  }

  private save(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      const now = Date.now();
      for (const [k, s] of this.sessions) if (now - s.lastSeen > this.maxAgeSeconds * 1000) this.sessions.delete(k);
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.sessions), null, 1), { mode: 0o600 });
      renameSync(tmp, this.file);
    }, 1000);
  }
}

export function readCookie(req: FastifyRequest, name = COOKIE): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export function setSessionCookie(req: FastifyRequest, reply: FastifyReply, token: string, maxAge: number): void {
  const secure = req.protocol === 'https' ? '; Secure' : '';
  reply.header('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.header('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

// ---------------------------------------------------------------- brute force

/**
 * Failed logins: 5 per IP and 20 overall every 15 minutes. The overall cap
 * covers attempts spread over many addresses.
 */
export class LoginLimiter {
  private readonly perIp = new Map<string, number[]>();
  private all: number[] = [];
  private static readonly WINDOW = 15 * 60_000;

  private recent(list: number[]): number[] {
    const since = Date.now() - LoginLimiter.WINDOW;
    return list.filter((t) => t > since);
  }

  /** Seconds to wait before trying again, or 0. */
  blocked(ip: string): number {
    this.all = this.recent(this.all);
    const mine = this.recent(this.perIp.get(ip) ?? []);
    this.perIp.set(ip, mine);
    const wait = (list: number[]) => Math.ceil((list[0] + LoginLimiter.WINDOW - Date.now()) / 1000);
    if (mine.length >= 5) return wait(mine);
    if (this.all.length >= 20) return wait(this.all);
    return 0;
  }

  fail(ip: string): void {
    const now = Date.now();
    this.all.push(now);
    this.perIp.set(ip, [...(this.perIp.get(ip) ?? []), now]);
  }

  succeed(ip: string): void {
    this.perIp.delete(ip);
  }
}

// ---------------------------------------------------------------- CLI

/** `node server/dist/index.js hash-password`: asks for a password and prints its hash. */
export async function hashPasswordCli(): Promise<void> {
  let muted = false;
  const out = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stderr.write(chunk);
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output: out, terminal: process.stdin.isTTY });
  const ask = (q: string) =>
    new Promise<string>((resolve) => {
      process.stderr.write(q);
      muted = true;
      rl.question('', (a) => {
        muted = false;
        process.stderr.write('\n');
        resolve(a);
      });
    });
  const pw = await ask('Contraseña: ');
  const again = process.stdin.isTTY ? await ask('Repítela: ') : pw;
  rl.close();
  if (pw !== again) throw new Error('No coinciden');
  if (pw.length < 12) throw new Error('Usa al menos 12 caracteres');
  process.stdout.write(`${await hashPassword(pw)}\n`);
}
