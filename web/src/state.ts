import { computed, signal } from '@preact/signals';
import type { ConnectionInfo, HostInfo, PaneInfo, PaneState, SessionInfo, UsageSample, WindowInfo } from '../../shared/types';

export type WsStatus = 'connecting' | 'open' | 'closed';

export const wsStatus = signal<WsStatus>('connecting');
export const clientId = signal<string | null>(null);
export const vapidKey = signal<string | null>(null);
export const hosts = signal<HostInfo[]>([]);
export const connections = signal<ConnectionInfo[]>([]);
/** Recent readings of the usage limits (from the hub), to forecast when they run out. */
export const usageSamples = signal<UsageSample[]>([]);

export const PRIO: Record<PaneState, number> = { question: 60, attention: 50, done: 40, busy: 30, claude: 20, ssh: 10 };
export const ALERT_STATES: PaneState[] = ['question', 'attention', 'done'];
export const STATE_LABEL: Record<PaneState, string> = {
  question: 'Pregunta',
  attention: 'Necesita atención',
  done: 'Terminado',
  busy: 'Trabajando',
  claude: 'Claude',
  ssh: 'SSH',
};

export interface PaneRef {
  host: HostInfo;
  session: SessionInfo;
  window: WindowInfo;
  pane: PaneInfo;
}

/** Panes waiting for you (🙋 > 💬 > ✅), most urgent first, like `prefix + g`. */
export const pending = computed<PaneRef[]>(() => {
  const list: PaneRef[] = [];
  for (const host of hosts.value) {
    if (host.status !== 'ok') continue;
    for (const session of host.sessions)
      for (const window of session.windows)
        for (const pane of window.panes) if (pane.state && ALERT_STATES.includes(pane.state)) list.push({ host, session, window, pane });
  }
  const hostOrder = (h: HostInfo) => hosts.value.indexOf(h);
  return list.sort(
    (a, b) =>
      PRIO[b.pane.state!] - PRIO[a.pane.state!] ||
      hostOrder(a.host) - hostOrder(b.host) ||
      (a.session.num ?? 99) - (b.session.num ?? 99) ||
      a.window.index - b.window.index ||
      a.pane.index - b.pane.index,
  );
});

export function findWindow(hostId: string, windowId: string): { host: HostInfo; session: SessionInfo; window: WindowInfo } | null {
  const host = hosts.value.find((h) => h.id === hostId);
  if (!host) return null;
  for (const session of host.sessions) {
    const window = session.windows.find((w) => w.id === windowId);
    if (window) return { host, session, window };
  }
  return null;
}

export const multiHost = computed(() => hosts.value.length > 1);

/** Puts the machines in the hub's order (host ids); any it does not name keep their place at the end. */
export function applyHostOrder(ids: string[]): void {
  const rank = (h: HostInfo) => (ids.includes(h.id) ? ids.indexOf(h.id) : ids.length);
  hosts.value = [...hosts.value].sort((a, b) => rank(a) - rank(b));
}

// ---------------------------------------------------------------- toasts & dialogs

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}
export const toasts = signal<Toast[]>([]);
let toastSeq = 0;
export function toast(text: string, kind: Toast['kind'] = 'info'): void {
  const id = ++toastSeq;
  toasts.value = [...toasts.value, { id, text, kind }];
  setTimeout(() => dismissToast(id), kind === 'error' ? 6000 : 3000);
}

export function dismissToast(id: number): void {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

export type Dialog =
  | { kind: 'prompt'; title: string; label?: string; value: string; placeholder?: string; confirm: string; onSubmit: (v: string) => void }
  | { kind: 'confirm'; title: string; message: string; confirm: string; danger?: boolean; onSubmit: () => void }
  | { kind: 'menu'; title: string; subtitle?: string; items: MenuItem[] }
  | { kind: 'project'; host: HostInfo };

export interface MenuItem {
  label: string;
  icon?: string;
  danger?: boolean;
  disabled?: boolean;
  run: () => void;
}

export const dialog = signal<Dialog | null>(null);
export const sheet = signal<'connections' | 'settings' | null>(null);
/** The Cmd+K search, to jump to any window. */
export const paletteOpen = signal(false);
