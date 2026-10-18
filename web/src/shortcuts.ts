import { effect } from '@preact/signals';
import type { HostInfo } from '../../shared/types';
import { openWindow, route } from './router';
import { findWindow, hosts, paletteOpen, toast } from './state';

/**
 * The last window opened on each host, and the host of the last one overall. Kept in
 * the browser (per device) so a reload or reopening the app still knows where you were.
 */
const STORE = 'twb-last-windows';
const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? '{}') as { host?: string; windows?: Record<string, string> };
  } catch {
    return {};
  }
})();
const lastWindow = new Map<string, string>(Object.entries(saved.windows ?? {}));
let lastHost: string | null = saved.host ?? null;
effect(() => {
  const r = route.value;
  if (r.name !== 'window') return;
  lastWindow.set(r.host, r.window);
  lastHost = r.host;
  try {
    localStorage.setItem(STORE, JSON.stringify({ host: lastHost, windows: Object.fromEntries(lastWindow) }));
  } catch {
    /* private mode: only for this session */
  }
});

/** Space N of a host: its @space_num, or its order if the host does not number them. */
function spaceWindow(host: HostInfo, n: number): string | null {
  const numbered = host.sessions.some((s) => s.num != null);
  const s = numbered ? host.sessions.find((x) => x.num === n) : host.sessions[n - 1];
  const w = s && (s.windows.find((x) => x.active) ?? s.windows[0]);
  return w?.id ?? null;
}

/** Where to land on a host: the window you last looked at there, else its first space. */
function hostWindow(host: HostInfo): string | null {
  const last = lastWindow.get(host.id);
  if (last && findWindow(host.id, last)) return last;
  const first = [...host.sessions].sort((a, b) => (a.num ?? 99) - (b.num ?? 99))[0];
  return (first?.windows.find((x) => x.active) ?? first?.windows[0])?.id ?? null;
}

/**
 * The same shortcuts as in tmux (with Ghostty): Ctrl+1..9 goes to window N of the
 * current space and Ctrl+Shift+1..9 to space N (its @space_num, as tmux-spaces.sh
 * numbers them), on the machine you are on (from the list, the last one you were
 * on). Ctrl+Shift+Alt+1..9 goes to machine N, in the list's order. Cmd+K (Mac)
 * opens the search to jump to any window by name.
 *
 * They move the app like a click in the list, so the web terminal never switches
 * by itself behind the app's back. Capture phase on window: they fire before the
 * terminal (xterm.js) sees the key.
 */
export function bindShortcuts(): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey && !e.ctrlKey && !e.altKey && e.code === 'KeyK') {
      e.preventDefault();
      e.stopPropagation();
      paletteOpen.value = !paletteOpen.value;
      return;
    }
    if (!e.ctrlKey || e.metaKey || (e.altKey && !e.shiftKey)) return;
    const m = /^Digit([1-9])$/.exec(e.code);
    if (!m) return;
    const n = Number(m[1]);
    // Claimed even when there is no such window, space or machine, as tmux does: the key is not typed.
    e.preventDefault();
    e.stopPropagation();

    const r = route.value;
    const current = r.name === 'window' ? findWindow(r.host, r.window) : null;
    let host = current?.host ?? hosts.value.find((h) => h.id === lastHost) ?? hosts.value[0];
    let target: string | null = null;

    if (e.altKey) {
      host = hosts.value[n - 1];
      if (!host) return;
      if (host.status !== 'ok') return toast(`${host.name}: sin conexión`, 'error');
      target = hostWindow(host);
      if (!target) return toast(`${host.name} no tiene spaces abiertos`);
    } else if (e.shiftKey) {
      if (!host) return;
      target = spaceWindow(host, n);
    } else if (current) {
      target = current.session.windows.find((x) => x.index === n)?.id ?? null;
    }
    if (target && host && !(current && current.host.id === host.id && current.window.id === target)) openWindow(host.id, target);
  };
  window.addEventListener('keydown', onKey, { capture: true });
  return () => window.removeEventListener('keydown', onKey, { capture: true });
}
