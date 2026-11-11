import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AccountsInfo, AccountUsage, ClaudeAccount } from '../../shared/types.js';
import type { OAuthCred } from './claude-oauth.js';

/**
 * One Claude Code login of an account. Its refresh token works once, so a login lives
 * in exactly one place: on a machine (`host`), whose Claude Code refreshes it and is
 * the only one that may, or with the hub (`host` null, "spare"), which may refresh it
 * and hand it to any machine. The same account on two machines takes two logins.
 */
export interface StoredLogin {
  id: string;
  cred: OAuthCred;
  host: string | null;
  /** Its refresh token was refused: kept only so it is not handed out again. */
  dead?: boolean;
  /** When `cred` was last known to be current (epoch ms). */
  at: number;
}

export interface StoredAccount {
  id: string;
  alias: string;
  email: string;
  orgName?: string;
  plan?: string;
  /** What Claude Code keeps under `oauthAccount` in `.claude.json` for it: written there on a switch. */
  oauthAccount: Record<string, unknown>;
  logins: StoredLogin[];
  usage?: AccountUsage;
  usageError?: string;
  /** When its profile (plan, organization) was last read (epoch ms). */
  profileAt?: number;
}

interface StoreFile {
  accounts: StoredAccount[];
  hosts: Record<string, string | null>;
}

/** What a machine's Claude Code is logged in with, read from its files. */
export interface HostLogin {
  oauthAccount: Record<string, unknown> | null;
  cred: OAuthCred | null;
}

/** The account a switch needs has no login the hub could hand over. */
export class NeedsLoginError extends Error {
  readonly code = 'needsLogin';
}

export function accountId(oauthAccount: Record<string, unknown> | null | undefined): string | null {
  const a = oauthAccount?.accountUuid;
  const o = oauthAccount?.organizationUuid;
  return typeof a === 'string' && a && typeof o === 'string' && o ? `${a}:${o}` : null;
}

/** A host login that the hub can keep: an account it can tell and a refresh token. */
function usable(l: HostLogin): l is { oauthAccount: Record<string, unknown>; cred: OAuthCred } {
  return !!accountId(l.oauthAccount) && typeof l.cred?.refreshToken === 'string' && !!l.cred.refreshToken && typeof l.cred.accessToken === 'string';
}

/**
 * The Claude accounts and their logins, kept in dataDir (accounts.json, readable only
 * by the hub's user: it holds every login's tokens).
 */
export class AccountStore {
  private readonly file: string;
  private data: StoreFile = { accounts: [], hosts: {} };

  constructor(dataDir: string) {
    this.file = join(dataDir, 'accounts.json');
    try {
      if (existsSync(this.file)) this.data = { accounts: [], hosts: {}, ...JSON.parse(readFileSync(this.file, 'utf8')) };
    } catch (err) {
      // Never start over silently: that would drop every login. Better to stop the hub.
      throw new Error(`No se puede leer ${this.file}: ${(err as Error).message}`);
    }
  }

  get accounts(): readonly StoredAccount[] {
    return this.data.accounts;
  }

  get(id: string): StoredAccount | undefined {
    return this.data.accounts.find((a) => a.id === id);
  }

  /** The account a machine is logged in with, as last seen. */
  hostAccount(host: string): string | null {
    return this.data.hosts[host] ?? null;
  }

  save(): void {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 1), { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, this.file);
  }

  private uniqueAlias(email: string): string {
    const base = email.split('@')[0] || 'cuenta';
    const taken = new Set(this.data.accounts.map((a) => a.alias));
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  }

  private ensure(id: string, oauthAccount: Record<string, unknown>, alias?: string): StoredAccount {
    let acc = this.get(id);
    const email = String(oauthAccount.emailAddress ?? '');
    if (!acc) {
      acc = { id, alias: alias?.trim() || this.uniqueAlias(email), email, oauthAccount: { ...oauthAccount }, logins: [] };
      this.data.accounts.push(acc);
    } else {
      // What Claude Code wrote there is fresher than ours (it reads the profile itself).
      acc.oauthAccount = { ...acc.oauthAccount, ...oauthAccount };
      if (email) acc.email = email;
    }
    if (typeof oauthAccount.organizationName === 'string' && oauthAccount.organizationName) acc.orgName = oauthAccount.organizationName;
    return acc;
  }

  private findLogin(id: string): { acc: StoredAccount; login: StoredLogin } | undefined {
    for (const acc of this.data.accounts) {
      const login = acc.logins.find((l) => l.id === id);
      if (login) return { acc, login };
    }
    return undefined;
  }

  /**
   * What a machine turned out to be logged in with (read from its files). Its login is
   * the machine's from now on: the hub keeps the copy current, never refreshes it. A
   * login the hub did not know of (a /login by hand, or one from before the hub kept
   * accounts) is adopted, with its account. Logins the hub thought were on that machine
   * and are not there any more come back as spare. Returns whether anything changed.
   */
  observe(host: string, seen: HostLogin): boolean {
    const before = JSON.stringify(this.data);
    const id = usable(seen) ? accountId(seen.oauthAccount) : null;
    for (const acc of this.data.accounts) {
      for (const l of acc.logins) if (l.host === host && acc.id !== id) l.host = null;
    }
    if (id && usable(seen)) {
      const acc = this.ensure(id, seen.oauthAccount);
      let login =
        acc.logins.find((l) => l.host === host) ??
        // The same login, back from the hub (a switch whose answer got lost).
        acc.logins.find((l) => l.cred.refreshToken === seen.cred.refreshToken);
      if (!login) {
        login = { id: randomBytes(6).toString('hex'), cred: seen.cred, host, at: Date.now() };
        acc.logins.push(login);
      }
      if (JSON.stringify(login.cred) !== JSON.stringify(seen.cred)) {
        login.cred = seen.cred;
        login.at = Date.now();
      }
      login.host = host;
      login.dead = false;
      // Any other copy of the same login is stale (or, spare, would be handed out twice).
      const live = login;
      for (const a of this.data.accounts) a.logins = a.logins.filter((l) => l === live || l.cred.refreshToken !== seen.cred.refreshToken);
    }
    this.data.hosts[host] = id;
    if (JSON.stringify(this.data) === before) return false;
    this.save();
    return true;
  }

  /**
   * The login to hand to a machine for an account: a spare one, the freshest first.
   * Throws NeedsLoginError when there is none (every login is on some machine, or dead).
   */
  spareLogin(accountId: string): StoredLogin {
    const acc = this.get(accountId);
    if (!acc) throw new Error('Cuenta desconocida');
    const spare = acc.logins.filter((l) => l.host === null && !l.dead).sort((a, b) => b.at - a.at)[0];
    if (!spare) throw new NeedsLoginError(`Hace falta iniciar sesión otra vez con ${acc.alias}`);
    return spare;
  }

  /**
   * A switch went through: what the machine had (read under Claude Code's locks, so
   * current) comes back to the hub as spare, and `loginId` is the machine's now.
   */
  commitSwitch(host: string, outgoing: HostLogin, loginId: string, cred: OAuthCred): void {
    if (usable(outgoing)) {
      const id = accountId(outgoing.oauthAccount)!;
      const acc = this.ensure(id, outgoing.oauthAccount);
      const login = acc.logins.find((l) => l.host === host) ?? acc.logins.find((l) => l.cred.refreshToken === outgoing.cred.refreshToken);
      if (login) {
        login.cred = outgoing.cred;
        login.host = null;
        login.dead = false;
        login.at = Date.now();
      } else acc.logins.push({ id: randomBytes(6).toString('hex'), cred: outgoing.cred, host: null, at: Date.now() });
    }
    for (const acc of this.data.accounts) for (const l of acc.logins) if (l.host === host) l.host = null;
    const found = this.findLogin(loginId);
    if (!found) throw new Error('El login ya no existe');
    found.login.host = host;
    found.login.cred = cred;
    found.login.at = Date.now();
    this.data.hosts[host] = found.acc.id;
    this.save();
  }

  /** A login made from the panel: a spare one of its account (created if new). */
  addLogin(oauthAccount: Record<string, unknown>, cred: OAuthCred, info: { alias?: string; plan?: string; orgName?: string }): StoredAccount {
    const id = accountId(oauthAccount);
    if (!id) throw new Error('El login no dice de qué cuenta es');
    const acc = this.ensure(id, oauthAccount, info.alias);
    if (info.plan) acc.plan = info.plan;
    if (info.orgName) acc.orgName = info.orgName;
    acc.profileAt = Date.now();
    acc.logins.push({ id: randomBytes(6).toString('hex'), cred, host: null, at: Date.now() });
    this.save();
    return acc;
  }

  /** A spare login the hub refreshed: the old refresh token no longer works, so this one must be kept. */
  updateCred(loginId: string, cred: OAuthCred): void {
    const found = this.findLogin(loginId);
    if (!found) return;
    found.login.cred = cred;
    found.login.at = Date.now();
    this.save();
  }

  markDead(loginId: string): void {
    const found = this.findLogin(loginId);
    if (!found || found.login.dead) return;
    found.login.dead = true;
    this.save();
  }

  setProfile(id: string, p: { plan?: string; orgName?: string; oauthAccount?: Record<string, unknown> }): void {
    const acc = this.get(id);
    if (!acc) return;
    if (p.plan) acc.plan = p.plan;
    if (p.orgName) acc.orgName = p.orgName;
    if (p.oauthAccount) acc.oauthAccount = { ...acc.oauthAccount, ...p.oauthAccount };
    acc.profileAt = Date.now();
    this.save();
  }

  setUsage(id: string, usage: AccountUsage | null, error?: string): void {
    const acc = this.get(id);
    if (!acc) return;
    if (usage) acc.usage = usage;
    acc.usageError = error;
    this.save();
  }

  rename(id: string, alias: string): void {
    const acc = this.get(id);
    const name = alias.trim().slice(0, 40);
    if (!acc) throw new Error('Cuenta desconocida');
    if (!name) throw new Error('Escribe un nombre');
    if (this.data.accounts.some((a) => a !== acc && a.alias === name)) throw new Error(`Ya hay una cuenta llamada ${name}`);
    acc.alias = name;
    this.save();
  }

  /** Forgets an account and its spare logins. One a machine is using would only come back on the next look. */
  remove(id: string): void {
    const acc = this.get(id);
    if (!acc) return;
    const on = acc.logins.filter((l) => l.host).map((l) => l.host!);
    if (on.length) throw new Error(`La usa ${on.join(', ')}: cambia antes esa máquina a otra cuenta`);
    this.data.accounts = this.data.accounts.filter((a) => a !== acc);
    this.save();
  }

  /** What the panel shows (no tokens). */
  info(switching: string[]): AccountsInfo {
    const list: ClaudeAccount[] = this.data.accounts.map((a) => {
      const live = a.logins.filter((l) => !l.dead);
      return {
        id: a.id,
        alias: a.alias,
        email: a.email,
        org: a.orgName,
        plan: a.plan,
        usage: a.usage,
        usageError: a.usageError,
        activeOn: Object.entries(this.data.hosts)
          .filter(([, acc]) => acc === a.id)
          .map(([h]) => h),
        spare: live.filter((l) => l.host === null).length,
        needsLogin: live.length === 0,
      };
    });
    return { list, hosts: { ...this.data.hosts }, switching };
  }
}
