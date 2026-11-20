// The automatic account switch: when a machine's Claude account passes a threshold of
// its 5-hour or weekly limit, the hub moves the machine to an account with margin, with
// the same switch the panel makes. The decision is shared/rotation.ts; this service
// gathers what it needs, switches one machine at a time and reports what happened.

import { decideRotation, failureKey, OFFLINE_REASON, RETRY_AFTER, type RotationMemory, rotationAccounts } from '../../shared/rotation.js';
import type { AccountRotationSettings, AccountsInfo, ActivityAccount, RateLimits, UsageLimit } from '../../shared/types.js';

/** What the service reads and does, handed in by index.ts (and by the tests). */
export interface RotationDeps {
  settings(): AccountRotationSettings;
  accounts(): AccountsInfo;
  /** The statusline readings the hub kept (none foreign), of every machine. */
  readings(): RateLimits[];
  /** The machines in the panel's order. */
  machines(): { id: string; connected: boolean }[];
  /** AccountManager.switchHost. */
  switchHost(host: string, account: string): Promise<void>;
  /** Into «Actividad» and a push notification. */
  report(host: string, event: ActivityAccount): void;
  /** Epoch seconds. */
  now?(): number;
}

const LIMIT_TEXT: Record<UsageLimit, string> = { fiveHour: 'límite de 5 h', sevenDay: 'límite semanal' };

/** The push of an automatic switch on `hostName`: a switch, no account with margin, or a failure. */
export function rotationNotice(hostName: string, event: ActivityAccount): { title: string; body: string } {
  const why = `el ${LIMIT_TEXT[event.limit]} de ${event.from} iba por el ${event.pct} %`;
  if (event.error) return { title: `⚠️ ${hostName}: cambio de cuenta fallido`, body: `No se ha podido pasar de ${event.from} a ${event.to}: ${event.error}` };
  if (event.to) return { title: `🔄 ${hostName}: ahora con ${event.to}`, body: `Pasa de ${event.from} a ${event.to}: ${why}.` };
  return { title: `⚠️ ${hostName}: sin cuenta con margen`, body: `Sigue con ${event.from}, porque ninguna otra cuenta tiene margen: ${why}.` };
}

/**
 * Decides and switches whenever evaluate() is called: index.ts calls it when an
 * account's usage, a statusline reading or the settings change. What it remembers of
 * earlier decisions lives in memory only: after a restart a warning may come once more.
 */
export class AccountRotation {
  private readonly memory: RotationMemory = { left: {}, warned: {}, failed: {}, retryAt: {} };
  /** The account each machine was on when a round last looked: a change by any route forgets its failure. */
  private readonly seen: Record<string, string | null> = {};
  private running: Promise<void> | null = null;

  constructor(private readonly deps: RotationDeps) {}

  /**
   * One round of decisions. A call while one runs joins it: the round reads everything
   * again after each switch and ends only when nothing is left to do, with no wait
   * between that last decision and its end, so it already sees what the call was about.
   * The round is registered before it starts: AccountManager.switchHost emits 'change'
   * synchronously, which calls this again, and must join instead of starting another.
   */
  evaluate(): Promise<void> {
    if (!this.running) {
      this.running = Promise.resolve()
        .then(() => this.round())
        .finally(() => {
          this.running = null;
        });
    }
    return this.running;
  }

  /** Forgets the failure of each machine whose account changed since the last look. */
  private notice(machines: { id: string; account: string | null }[]): void {
    for (const m of machines) {
      if (m.id in this.seen && this.seen[m.id] !== m.account) {
        delete this.memory.failed[m.id];
        delete this.memory.retryAt[m.id];
      }
      this.seen[m.id] = m.account;
    }
  }

  /** Every machine that needs something, one at a time, each seeing the switches before it. */
  private async round(): Promise<void> {
    const skip: string[] = [];
    for (;;) {
      const info = this.deps.accounts();
      const now = this.deps.now?.() ?? Math.floor(Date.now() / 1000);
      const machines = this.deps.machines().map((m) => ({ id: m.id, account: info.hosts[m.id] ?? null, connected: m.connected, switching: info.switching.includes(m.id) }));
      this.notice(machines);
      const action = decideRotation({
        settings: this.deps.settings(),
        accounts: rotationAccounts(info.list, this.deps.readings(), now),
        machines,
        memory: this.memory,
        skip,
        now,
      });
      if (!action) return;
      // Each machine is decided once per round, so the round ends after one pass per machine at most.
      if (skip.includes(action.host)) {
        console.error(`[cuentas] ${action.host}: decidida dos veces en la misma ronda; se corta la ronda`);
        return;
      }
      skip.push(action.host);
      const alias = (id: string) => info.list.find((a) => a.id === id)?.alias ?? id;
      const { host, limit, window } = action;
      // Anthropic's utilization may carry decimals; the panel shows whole percentages.
      const pct = Math.round(action.pct);
      const from = alias(action.from);
      const why = `${LIMIT_TEXT[limit]} al ${pct} %`;
      if (action.kind === 'stuck') {
        this.memory.warned[host] = { ...this.memory.warned[host], [limit]: window };
        console.log(`[cuentas] ${host}: ninguna cuenta con margen, sigue con ${from} (${why})`);
        this.deps.report(host, { from, limit, pct });
        continue;
      }
      const to = alias(action.to);
      if (action.kind === 'offline') {
        this.memory.failed[host] = { ...this.memory.failed[host], [limit]: failureKey(window, OFFLINE_REASON) };
        console.log(`[cuentas] ${host}: sin conexión, no se pasa de ${from} a ${to} (${why})`);
        this.deps.report(host, { from, to, limit, pct, error: OFFLINE_REASON });
        continue;
      }
      try {
        await this.deps.switchHost(host, action.to);
        this.memory.left[host] = action.from;
        delete this.memory.failed[host];
        delete this.memory.retryAt[host];
        // The switch's own report says where the machine went: no warning of no target follows it in the window the target passed.
        const target = action.targetWindow;
        if (target) this.memory.warned[host] = { ...this.memory.warned[host], [target.limit]: target.window };
        console.log(`[cuentas] ${host}: cambio automático de ${from} a ${to} (${why})`);
        this.deps.report(host, { from, to, limit, pct });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        // Every failure emits changes (the re-inspection of switchHost among them): without a wait they would try it again in a loop.
        this.memory.retryAt[host] = (this.deps.now?.() ?? Math.floor(Date.now() / 1000)) + RETRY_AFTER;
        console.warn(`[cuentas] ${host}: no se pudo pasar de ${from} a ${to}: ${error}`);
        const key = failureKey(window, error);
        if (this.memory.failed[host]?.[limit] === key) continue;
        this.memory.failed[host] = { ...this.memory.failed[host], [limit]: key };
        this.deps.report(host, { from, to, limit, pct, error });
      }
    }
  }
}
