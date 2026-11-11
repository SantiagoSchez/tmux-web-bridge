import { signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { ClaudeAccount, PaneState, RateLimits, UsageSample, UsageWindow } from '../../../shared/types';
import { accountMenu, addAccount, useAccount } from '../accounts';
import { openWindow, route } from '../router';
import { accountsInfo, findWindow, hosts, STATE_LABEL, usageSamples, type PaneRef } from '../state';

/** "2d23h", "3h37m", "45m": time left until a reset, like the Claude Code statusline. */
function left(seconds: number): string {
  if (seconds <= 0) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d${h}h`;
  if (h > 0) return `${h}h${m}m`;
  return `${m}m`;
}

function when(epoch: number): string {
  const d = new Date(epoch * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

type Window = 'five' | 'seven';

/** How far back the pace is measured, and the shortest stretch that says anything. */
const PACE: Record<Window, { lookback: number; minSpan: number }> = {
  five: { lookback: 30 * 60, minSpan: 10 * 60 },
  seven: { lookback: 6 * 3600, minSpan: 3600 },
};

/**
 * When the limit would hit 100% at the pace of the last stretch (30 min for 5 h,
 * 6 h for the week), or null if it lasts until its reset. The pace is measured up
 * to now, not to the last reading: time without Claude working slows it down.
 */
function runsOutAt(samples: UsageSample[], w: Window, pct: number, resetsAt: number, now: number): number | null {
  if (pct >= 100 || resetsAt <= now) return null;
  const same = samples.filter((s) => Math.abs((w === 'five' ? s.fiveReset : s.sevenReset) - resetsAt) < 120);
  if (!same.length) return null;
  const { lookback, minSpan } = PACE[w];
  const from = now - lookback;
  const before = same.filter((s) => s.t <= from).pop();
  const t0 = before ? from : same[0].t;
  const p0 = before ? before[w] : same[0][w];
  if (now - t0 < minSpan || pct <= p0) return null;
  const at = now + ((100 - pct) * (now - t0)) / (pct - p0);
  return at < resetsAt ? at : null;
}

type Tip = { key: string; anchor: DOMRect };

/** The meter whose forecast is open, if any: one at a time, for every row. */
const tip = signal<Tip | null>(null);

/**
 * One limit: its label, its bar, the time left until its reset and, if it would
 * run out before then, a ⚠. Only then is it a button: a tap opens the forecast
 * in a tooltip, so its text does not take room from the reset on a phone.
 */
function Meter({ id, label, pct, resetsAt, now, runsOut }: { id: string; label: ComponentChildren; pct: number; resetsAt: number; now: number; runsOut: number | null }) {
  const reset = resetsAt > 0 && resetsAt <= now; // the window already restarted since it was read
  const value = reset ? 0 : Math.max(0, Math.min(100, Math.round(pct)));
  const level = value >= 80 ? 'high' : value >= 60 ? 'mid' : 'low';
  const open = tip.value?.key === id;
  const content = (
    <>
      <span class="limit-label">{label}</span>
      <span class={`limit-bar ${level}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label={`Uso ${id.split('|').pop()}`}>
        <span class="limit-fill" style={{ width: `${value}%` }} />
        <span class="limit-pct">{value}%</span>
      </span>
      <span class="limit-left">
        {reset ? 'reiniciado' : left(resetsAt - now)}
        {!reset && resetsAt > 0 && <span class="limit-when"> ({when(resetsAt)})</span>}
      </span>
    </>
  );
  if (!runsOut) return <div class={`limit ${reset ? 'reset' : ''}`}>{content}</div>;
  const toggle = (e: MouseEvent) => {
    tip.value = open ? null : { key: id, anchor: (e.currentTarget as HTMLElement).getBoundingClientRect() };
  };
  return (
    <>
      <button type="button" class={`limit warn ${open ? 'open' : ''}`} aria-expanded={open} onClick={toggle}>
        {content}
        <span class="limit-eta" aria-label="Llegarás al 100% antes del reinicio">
          ⚠
        </span>
      </button>
      {open && (
        <LimitTip anchor={tip.value!.anchor}>
          ⚠ Al ritmo actual llegas al 100% en {left(runsOut - now)} <span class="limit-when">({when(runsOut)})</span>, antes del reinicio
        </LimitTip>
      )}
    </>
  );
}

/**
 * A meter's forecast, under it and inside the screen. Fixed rather than
 * absolute: the strip cuts (or, on phones, scrolls) what overflows it. It closes
 * with a tap elsewhere, Escape, or when anything scrolls or resizes.
 */
function LimitTip({ anchor, children }: { anchor: DOMRect; children: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  const [x, setX] = useState<number | null>(null);
  useLayoutEffect(() => {
    const w = ref.current!.offsetWidth;
    const center = anchor.left + anchor.width / 2;
    setX(Math.max(8, Math.min(innerWidth - 8 - w, center - w / 2)));
  }, [anchor]);
  useEffect(() => {
    const close = () => (tip.value = null);
    const down = (e: PointerEvent) => {
      const t = e.target as Element;
      if (!ref.current?.contains(t) && !t.closest?.('.limit')) close();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    addEventListener('pointerdown', down, true);
    addEventListener('keydown', key);
    addEventListener('scroll', close, true);
    addEventListener('resize', close);
    return () => {
      removeEventListener('pointerdown', down, true);
      removeEventListener('keydown', key);
      removeEventListener('scroll', close, true);
      removeEventListener('resize', close);
    };
  }, []);
  return (
    <div ref={ref} class="limit-tip" role="tooltip" style={{ top: `${anchor.bottom + 6}px`, left: `${x ?? anchor.left}px`, visibility: x === null ? 'hidden' : undefined }}>
      {children}
    </div>
  );
}

const SUMMARY: { state: PaneState; icon: string }[] = [
  { state: 'question', icon: '🙋' },
  { state: 'attention', icon: '💬' },
  { state: 'done', icon: '✅' },
  { state: 'busy', icon: '🔨' },
];

type Group = { state: PaneState; icon: string; panes: PaneRef[] };

/** Panes of every machine by state, in list order; only the states with any. */
function groups(): Group[] {
  const by = new Map<PaneState, PaneRef[]>();
  for (const host of hosts.value) {
    if (host.status !== 'ok') continue;
    for (const session of [...host.sessions].sort((a, b) => (a.num ?? 99) - (b.num ?? 99)))
      for (const window of session.windows)
        for (const pane of window.panes) if (pane.state) by.set(pane.state, [...(by.get(pane.state) ?? []), { host, session, window, pane }]);
  }
  return SUMMARY.filter((s) => by.has(s.state)).map((s) => ({ ...s, panes: by.get(s.state)! }));
}

/** Claude in every machine at a glance; a tap goes to the next pane in that state. */
function Summary({ groups }: { groups: Group[] }) {
  const next = (list: PaneRef[]) => {
    const r = route.value;
    const here = list.findIndex(
      (p) => r.name === 'window' && p.host.id === r.host && p.window.id === r.window && (r.pane ? p.pane.id === r.pane : p.pane.active),
    );
    const p = list[(here + 1) % list.length];
    openWindow(p.host.id, p.window.id, p.pane.id);
  };
  return (
    <div class="summary">
      {groups.map(({ state, icon, panes }) => (
        <button key={state} class="summary-item" title={`${STATE_LABEL[state]}: ${panes.length} · ir al siguiente`} onClick={() => next(panes)}>
          {icon}
          <span>{panes.length}</span>
        </button>
      ))}
    </div>
  );
}

/** The freshest statusline reading of each account among all hosts (by email). */
function statuslineLimits(): Map<string, RateLimits> {
  const by = new Map<string, RateLimits>();
  for (const h of hosts.value)
    for (const l of h.limits ?? []) {
      const prev = by.get(l.account ?? '');
      if (!prev || l.updatedAt > prev.updatedAt) by.set(l.account ?? '', l);
    }
  return by;
}

/** One row of the strip: an account the hub keeps, or one only a statusline knows of. */
interface Row {
  key: string;
  label: string;
  email?: string;
  acc?: ClaudeAccount;
  five?: UsageWindow;
  seven?: UsageWindow;
  models: (UsageWindow & { name: string })[];
  /** When its 5h/7d were read (epoch seconds), 0 if never. */
  readAt: number;
}

/**
 * The hub's accounts, each with the freshest of its two readings: the hub's own
 * (every few minutes, with the per-model limits) and a statusline's (live, while a
 * Claude of it works). An email two accounts share cannot tell which one a statusline
 * reading is of, so it is left out for both. Then the accounts only a statusline knows.
 */
function rows(): Row[] {
  const live = statuslineLimits();
  const list = accountsInfo.value?.list ?? [];
  const out: Row[] = list.map((acc) => {
    const u = acc.usage;
    const shared = list.some((b) => b !== acc && b.email === acc.email);
    const sl = shared ? undefined : live.get(acc.email);
    const fresher = sl && sl.updatedAt > (u?.t ?? 0);
    return {
      key: acc.id,
      label: acc.alias,
      email: acc.email,
      acc,
      five: fresher ? sl.fiveHour : u?.fiveHour,
      seven: fresher ? sl.sevenDay : u?.sevenDay,
      models: u?.models ?? [],
      readAt: fresher ? sl.updatedAt : (u?.t ?? 0),
    };
  });
  const known = new Set(list.map((a) => a.email));
  for (const [email, l] of live) {
    if (known.has(email)) continue;
    out.push({ key: `sl:${email}`, label: email ? email.split('@')[0] : '—', email: email || undefined, five: l.fiveHour, seven: l.sevenDay, models: [], readAt: l.updatedAt });
  }
  return out.sort((a, b) => Number(!a.acc) - Number(!b.acc) || a.label.localeCompare(b.label));
}

/** The machine and the account of the Claude in the pane open in the app (its active one if none is picked), if any. */
function openPane(): { host: string; account?: string } | undefined {
  const r = route.value;
  if (r.name !== 'window') return undefined;
  const panes = findWindow(r.host, r.window)?.window.panes ?? [];
  const pane = panes.find((p) => (r.pane ? p.id === r.pane : p.active));
  return { host: r.host, account: pane?.state && pane.state !== 'ssh' ? pane.account : undefined };
}

/**
 * The row of the account the open window's machine uses. Its login says it: it changes
 * the moment a switch lands, while a Claude's statusline keeps the old email until
 * its next message, and an email shared by two accounts (a personal and a Team one)
 * cannot tell them apart. The statusline's email only counts on a machine the hub
 * knows no account of.
 */
function currentRow(list: Row[], pane: { host: string; account?: string } | undefined): string | undefined {
  if (!pane) return undefined;
  const onHost = list.filter((r) => r.acc?.activeOn.includes(pane.host));
  if (onHost.length === 1) return onHost[0].key;
  const byEmail = pane.account ? list.filter((r) => r.email === pane.account) : [];
  return byEmail.length === 1 ? byEmail[0].key : undefined;
}

function hostNames(ids: string[]): string {
  return ids.map((id) => hosts.value.find((h) => h.id === id)?.name ?? id).join(' · ');
}

/** A model's weekly limit: its name whole on a big screen, its initial on a phone. */
function modelLabel(name: string) {
  return (
    <>
      {name.slice(0, 1)}
      <span class="limit-label-rest">{name.slice(1)}</span>
    </>
  );
}

/**
 * One account's row: its name (a tap opens its menu), its meters, where it is in use
 * and, with a window open on a machine that uses another one, «Usar aquí».
 */
function AccountRow({ row, samples, now, dim, here }: { row: Row; samples: UsageSample[]; now: number; dim?: boolean; here?: string }) {
  const { acc, email } = row;
  const mine = samples.filter((s) => s.account === email);
  const age = row.readAt ? left(now - row.readAt) : null;
  const switching = accountsInfo.value?.switching ?? [];
  const title = [
    acc ? `${acc.alias} · ${acc.email}` : email,
    acc?.plan,
    acc?.org && acc.plan === 'Team' ? acc.org : undefined,
    age ? `leídos hace ${age === '—' ? 'un momento' : age}` : 'sin lecturas todavía',
    acc?.usageError,
  ]
    .filter(Boolean)
    .join(' · ');
  const open = () => (acc ? accountMenu(acc, here) : addAccount());
  const canUse = acc && here && !acc.activeOn.includes(here) && !acc.needsLogin;
  const busy = here !== undefined && switching.includes(here);
  const use = () => void useAccount(here!, acc!);
  return (
    <div class={`limit-row ${dim === false ? 'current' : dim ? 'dim' : ''}`}>
      <span class="limit-account-cell">
        <button type="button" class="limit-account" title={title} onClick={open}>
          {row.label}
          {acc?.plan && <span class="limit-plan"> {acc.plan}</span>}
          {(acc?.needsLogin || (acc?.usageError && !acc.usage)) && <span class="limit-warn"> ⚠</span>}
        </button>
      </span>
      {row.five ? (
        <Meter id={`${row.key}|5h`} label="5h" pct={row.five.pct} resetsAt={row.five.resetsAt} now={now} runsOut={runsOutAt(mine, 'five', row.five.pct, row.five.resetsAt, now)} />
      ) : (
        <span />
      )}
      {row.seven ? (
        <Meter id={`${row.key}|7d`} label="7d" pct={row.seven.pct} resetsAt={row.seven.resetsAt} now={now} runsOut={runsOutAt(mine, 'seven', row.seven.pct, row.seven.resetsAt, now)} />
      ) : (
        <span />
      )}
      <span class="limit-models">
        {row.models.map((m) => (
          <Meter key={m.name} id={`${row.key}|${m.name}`} label={modelLabel(m.name)} pct={m.pct} resetsAt={m.resetsAt} now={now} runsOut={null} />
        ))}
      </span>
      <span class="limit-actions">
        {acc && acc.activeOn.length > 0 && (
          <span class="limit-active" title={`En uso en ${hostNames(acc.activeOn)}`}>
            ●<span class="limit-active-hosts"> {hostNames(acc.activeOn)}</span>
          </span>
        )}
        {canUse && (
          <button type="button" class="limit-use" disabled={busy} onClick={use}>
            Usar aquí
          </button>
        )}
      </span>
    </div>
  );
}

/**
 * Claude's usage limits (5 h, 7 d and per model), one row per account: those the hub
 * keeps logins of, read by the hub and by the statuslines, and those only a
 * statusline knows of. From here a machine switches to another account.
 */
export function LimitsBar() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(t);
  }, []);

  const list = rows();
  const states = groups();
  if (!list.length && !states.length) return null;

  const samples = usageSamples.value;
  // With a window open, its account stands out and the others fade.
  const pane = openPane();
  const current = list.length > 1 ? currentRow(list, pane) : undefined;
  return (
    <div class={`limits ${states.length ? 'has-summary' : ''}`}>
      {states.length > 0 && <Summary groups={states} />}
      {list.length > 0 && (
        <div class="limit-meters">
          {list.map((r) => (
            <AccountRow key={r.key} row={r} samples={samples} now={now} dim={current === undefined ? undefined : r.key !== current} here={pane?.host} />
          ))}
        </div>
      )}
    </div>
  );
}
