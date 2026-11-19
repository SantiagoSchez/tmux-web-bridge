import { EventEmitter } from 'node:events';
import type { AccountOp, AccountsInfo } from '../../shared/types.js';
import { AccountStore, NeedsLoginError, type StoredAccount, type StoredLogin, accountId } from './account-store.js';
import { exchangeCode, type Fetch, fetchProfile, fetchUsage, OAuthError, type OAuthCred, type PendingLogin, type Profile, refresh, splitCode, startLogin } from './claude-oauth.js';
import type { HostMonitor } from './host.js';
import { inspectHost, switchHost } from './host-creds.js';

/** How often each account's usage is read: the endpoint allows ~30 reads an hour per account. */
const USAGE_EVERY = 5 * 60_000;
/** After a 429 without Retry-After, and the most any backoff waits. */
const BACKOFF_MIN = 10 * 60_000;
const BACKOFF_MAX = 60 * 60_000;
/** The plan and the organization change seldom. */
const PROFILE_EVERY = 6 * 3600_000;
/** How often each machine's login is looked at (a /login by hand, a refresh by its Claude Code). */
const INSPECT_EVERY = 10 * 60_000;
/** The least time between two looks at one machine, unless a switch asks for one. */
const INSPECT_MIN = 60_000;
/** A token this close to expiring is renewed before it is used or handed over. */
const EXPIRY_MARGIN = 5 * 60_000;
/** A login started and not finished in this time is forgotten. */
const LOGIN_TTL = 15 * 60_000;

interface PollState {
  next: number;
  backoff: number;
}

/**
 * The Claude accounts of every machine: their usage, read by the hub from Anthropic,
 * and switching a machine's Claude Code from one to another. See AccountStore for how
 * logins move between the hub and the machines.
 */
export class AccountManager extends EventEmitter {
  private readonly polls = new Map<string, PollState>();
  private readonly inspected = new Map<string, number>();
  private readonly inspecting = new Map<string, Promise<void>>();
  private readonly switching = new Set<string>();
  private readonly pending = new Map<string, PendingLogin & { at: number }>();
  /** Refreshes and switches, one at a time: a login must never be refreshed while it is being handed to a machine. */
  private queue: Promise<unknown> = Promise.resolve();
  private timer: NodeJS.Timeout | null = null;
  private polling = false;

  constructor(
    readonly store: AccountStore,
    private readonly hosts: Map<string, HostMonitor>,
    /** How Anthropic is reached: the global `fetch`, or the tests' fake. */
    private readonly doFetch: Fetch = fetch,
  ) {
    super();
  }

  get info(): AccountsInfo {
    return this.store.info([...this.switching]);
  }

  private changed(): void {
    this.emit('change', this.info);
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  start(): void {
    for (const host of this.hosts.values()) {
      // A machine is looked at once it answers, and again every so often.
      host.on('change', () => {
        if (host.snapshot.status === 'ok' && Date.now() - (this.inspected.get(host.id) ?? 0) > INSPECT_EVERY) void this.inspect(host.id);
      });
    }
    this.timer = setInterval(() => void this.pollDue(), 30_000);
    this.timer.unref();
    setTimeout(() => void this.pollDue(), 5_000).unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Reads what a machine's Claude Code is logged in with and takes it in. */
  inspect(hostId: string, force = false): Promise<void> {
    const running = this.inspecting.get(hostId);
    if (running) return running;
    const host = this.hosts.get(hostId);
    if (!host || (!force && Date.now() - (this.inspected.get(hostId) ?? 0) < INSPECT_MIN)) return Promise.resolve();
    this.inspected.set(hostId, Date.now());
    const job = (async () => {
      try {
        const snap = await inspectHost(host.exec);
        if (this.switching.has(hostId)) return; // the switch takes it in itself
        if (this.store.observe(hostId, snap)) this.changed();
        // A new token is filed under the account ~/.claude.json names: ask whose it is
        // while it is valid (only the machine renews it).
        const mine = this.store.hostLogin(hostId);
        if (mine && !mine.login.confirmed && mine.login.cred.expiresAt - Date.now() > 60_000) {
          await this.owns(mine.acc, mine.login, mine.login.cred.accessToken).catch((err: Error) => {
            console.warn(`[cuentas] ${hostId}: no se pudo preguntar a Anthropic de qué cuenta es su login: ${err.message}`);
          });
        }
      } catch (err) {
        console.warn(`[cuentas] ${hostId}: no se pudo leer su login de Claude: ${(err as Error).message}`);
      } finally {
        this.inspecting.delete(hostId);
      }
    })();
    this.inspecting.set(hostId, job);
    return job;
  }

  /** A spare login ready to use: renewed if it is about to expire. Inside serial(). */
  private async freshen(login: StoredLogin): Promise<OAuthCred> {
    if (login.cred.expiresAt - Date.now() > EXPIRY_MARGIN) return login.cred;
    try {
      const cred = await refresh(login.cred, this.doFetch);
      this.store.updateCred(login.id, cred);
      return cred;
    } catch (err) {
      if (err instanceof OAuthError && err.deadGrant) {
        this.store.markDead(login.id);
        this.changed();
      }
      throw err;
    }
  }

  /**
   * An access token to read an account's usage with: a spare login's (the hub may renew
   * it), or else the last one seen of a machine's login, which only that machine renews.
   */
  private async accessToken(acc: StoredAccount): Promise<{ login: StoredLogin; token: string } | null> {
    const spare = acc.logins.filter((l) => l.host === null && !l.dead).sort((a, b) => b.at - a.at)[0];
    if (spare) return this.serial(async () => ({ login: spare, token: (await this.freshen(spare)).accessToken }));
    const live = acc.logins.filter((l) => l.host && !l.dead).sort((a, b) => b.cred.expiresAt - a.cred.expiresAt)[0];
    if (!live) return null;
    if (live.cred.expiresAt - Date.now() > 60_000) return { login: live, token: live.cred.accessToken };
    // Its machine has surely renewed it by now: look again, and use it next round.
    void this.inspect(live.host!);
    return null;
  }

  /**
   * Whether `login` is `acc`'s, as Anthropic's profile says: asked while the login is
   * unconfirmed, or when the account's plan is due a new look. A login of another
   * account moves there (created if new) and the answer is false; one another round
   * moved meanwhile is only confirmed where it is. A failed question throws for an
   * unconfirmed login, which must not be used meanwhile.
   */
  private async owns(acc: StoredAccount, login: StoredLogin, accessToken: string): Promise<boolean> {
    if (login.confirmed && Date.now() - (acc.profileAt ?? 0) <= PROFILE_EVERY) return true;
    let prof: Profile;
    try {
      prof = await fetchProfile(accessToken, this.doFetch);
    } catch (err) {
      if (login.confirmed) return true; // only the plan's look failed
      throw err;
    }
    if (!prof.accountUuid || !prof.orgUuid) throw new Error('Anthropic no dice de qué cuenta es el login');
    const info = { plan: prof.plan, orgName: prof.orgName };
    const owner = `${prof.accountUuid}:${prof.orgUuid}`;
    // Where the login sits now: a round that asked at the same time may have moved it.
    const now = this.store.loginAccount(login.id);
    if (!now) return false;
    if (owner === now.id) {
      this.store.confirm(login.id);
      this.store.setProfile(now.id, info);
      return now.id === acc.id;
    }
    const { from, to } = this.store.moveLogin(login.id, prof.oauthAccount);
    this.store.setProfile(to.id, info);
    this.polls.delete(from.id);
    this.polls.delete(to.id);
    console.log(`[cuentas] el login que estaba en ${from.alias} es de ${to.alias}: movido`);
    this.changed();
    return false;
  }

  /** One round of usage reads, of the accounts that are due one; start() runs it every 30 s. */
  async pollDue(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      for (const acc of [...this.store.accounts]) {
        const p = this.polls.get(acc.id) ?? { next: 0, backoff: 0 };
        if (Date.now() < p.next) continue;
        await this.poll(acc, p);
        this.polls.set(acc.id, p);
      }
    } finally {
      this.polling = false;
    }
  }

  private async poll(acc: StoredAccount, p: PollState): Promise<void> {
    try {
      const got = await this.accessToken(acc);
      if (!got) {
        p.next = Date.now() + 60_000;
        if (!acc.logins.some((l) => !l.dead)) this.store.setUsage(acc.id, null, 'Hace falta iniciar sesión otra vez');
        return;
      }
      // A login of another account would show that account's usage as this one's.
      if (!(await this.owns(acc, got.login, got.token))) {
        p.next = 0; // read again next round, with another login
        return;
      }
      const usage = await fetchUsage(got.token, this.doFetch);
      this.store.setUsage(acc.id, usage);
      p.backoff = 0;
      p.next = Date.now() + USAGE_EVERY;
    } catch (err) {
      const e = err as OAuthError;
      if (e.status === 429) {
        p.backoff = Math.min(BACKOFF_MAX, Math.max(BACKOFF_MIN, (e.retryAfter ?? 0) * 1000, p.backoff * 2));
        p.next = Date.now() + p.backoff;
      } else {
        p.next = Date.now() + (e.status === 401 ? 60_000 : USAGE_EVERY);
        this.store.setUsage(acc.id, null, e.deadGrant ? 'Hace falta iniciar sesión otra vez' : e.message);
        if (e.status === 401) for (const l of acc.logins) if (l.host) void this.inspect(l.host);
      }
    }
    this.changed();
  }

  /**
   * Makes `accId` the account of the machine's Claude Code, without restarting it: what
   * it had comes back to the hub as a spare login. Throws NeedsLoginError when the hub
   * has no spare login of that account.
   */
  switchHost(hostId: string, accId: string): Promise<void> {
    const host = this.hosts.get(hostId);
    if (!host) return Promise.reject(new Error('Máquina desconocida'));
    if (this.switching.has(hostId)) return Promise.reject(new Error(`Ya se está cambiando la cuenta de ${host.name}`));
    const acc = this.store.get(accId);
    if (!acc) return Promise.reject(new Error('Cuenta desconocida'));
    this.switching.add(hostId);
    this.changed();
    return this.serial(async () => {
      let ok = false;
      try {
        // Already on it (as far as the hub knows): the machine says, without writing anything.
        if (this.store.hostAccount(hostId) === accId) {
          const { snap } = await switchHost(host.exec, () => null);
          this.store.observe(hostId, snap);
          if (this.store.hostAccount(hostId) === accId) {
            ok = true;
            return;
          }
        }
        // Only a login Anthropic says is this account's: one of another moves there, and
        // the next spare is tried (spareLogin throws NeedsLoginError when none is left).
        let login: StoredLogin;
        let cred: OAuthCred;
        for (;;) {
          login = this.store.spareLogin(accId);
          try {
            cred = await this.freshen(login);
          } catch (err) {
            if (err instanceof OAuthError && err.deadGrant) throw new NeedsLoginError(`El login guardado de ${acc.alias} ya no vale: inicia sesión otra vez`);
            throw err;
          }
          if (await this.owns(acc, login, cred.accessToken)) break;
        }
        const { snap, written } = await switchHost(host.exec, (s) => (accountId(s.oauthAccount) === accId && s.cred ? null : { cred, oauthAccount: acc.oauthAccount }));
        if (written) this.store.commitSwitch(hostId, snap, login.id, cred);
        else this.store.observe(hostId, snap);
        this.inspected.set(hostId, Date.now());
        ok = true;
        console.log(`[cuentas] ${hostId}: ahora con ${acc.alias}`);
      } finally {
        this.switching.delete(hostId);
        this.changed();
        // Whatever happened halfway, the machine says what it has now.
        if (!ok) setTimeout(() => void this.inspect(hostId, true), 1000);
      }
    });
  }

  private loginStart(): { url: string; state: string } {
    const now = Date.now();
    for (const [k, v] of this.pending) if (now - v.at > LOGIN_TTL) this.pending.delete(k);
    const p = startLogin();
    this.pending.set(p.state, { ...p, at: now });
    return { url: p.url, state: p.state };
  }

  private async loginFinish(
    state: string,
    pasted: string,
    alias?: string,
    hostId?: string,
    expected?: string,
  ): Promise<{ account: string; alias: string; switched: boolean; other?: boolean }> {
    const pending = this.pending.get(state);
    if (!pending) throw new Error('Ese inicio de sesión ha caducado: empieza otra vez');
    const { code, state: pastedState } = splitCode(pasted);
    if (!code) throw new Error('Pega el código que muestra la página de Claude');
    if (pastedState && pastedState !== state) throw new Error('Ese código es de otro inicio de sesión');
    let got;
    try {
      got = await exchangeCode(pending, code, this.doFetch);
    } catch (err) {
      throw new Error(`Claude no ha aceptado el código: ${(err as Error).message}`);
    }
    this.pending.delete(state);
    const prof = await fetchProfile(got.cred.accessToken, this.doFetch);
    const cred: OAuthCred = { ...got.cred, subscriptionType: prof.subscriptionType ?? null, rateLimitTier: prof.rateLimitTier ?? null };
    const acc = this.store.addLogin(prof.oauthAccount, cred, { alias, plan: prof.plan, orgName: prof.orgName });
    this.polls.delete(acc.id); // its usage, on the next round
    this.changed();
    console.log(`[cuentas] login nuevo de ${acc.alias}`);
    // Logged in with another account than the one meant: kept, but nothing switched to it.
    if (expected && expected !== acc.id) return { account: acc.id, alias: acc.alias, switched: false, other: true };
    let switched = false;
    if (hostId) {
      await this.switchHost(hostId, acc.id);
      switched = true;
    }
    return { account: acc.id, alias: acc.alias, switched };
  }

  /** An action from the panel. */
  async run(op: AccountOp): Promise<unknown> {
    switch (op.op) {
      case 'loginStart':
        return this.loginStart();
      case 'loginFinish':
        return this.loginFinish(
          String(op.state ?? ''),
          String(op.code ?? ''),
          typeof op.alias === 'string' ? op.alias : undefined,
          typeof op.host === 'string' ? op.host : undefined,
          typeof op.account === 'string' ? op.account : undefined,
        );
      case 'switch':
        await this.switchHost(String(op.host), String(op.account));
        return { ok: true };
      case 'rename':
        this.store.rename(String(op.account), String(op.alias ?? ''));
        this.changed();
        return { ok: true };
      case 'remove':
        this.store.remove(String(op.account));
        this.polls.delete(String(op.account));
        this.changed();
        return { ok: true };
    }
    throw new Error('Acción desconocida');
  }
}
