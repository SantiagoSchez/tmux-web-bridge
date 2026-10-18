import { signal } from '@preact/signals';

export type Route = { name: 'home' } | { name: 'window'; host: string; window: string; pane: string | null };

/** Hash routes: #/ and #/h/<host>/w/<window>[/p/<pane>] (tmux ids without @ and %). */
function parse(hash: string): Route {
  const m = /^#\/h\/([^/]+)\/w\/(\d+)(?:\/p\/(\d+))?/.exec(hash);
  if (!m) return { name: 'home' };
  return { name: 'window', host: decodeURIComponent(m[1]), window: `@${m[2]}`, pane: m[3] ? `%${m[3]}` : null };
}

export function windowHref(host: string, window: string, pane?: string | null): string {
  return `#/h/${encodeURIComponent(host)}/w/${window.slice(1)}${pane ? `/p/${pane.slice(1)}` : ''}`;
}

export const route = signal<Route>(parse(location.hash));

window.addEventListener('hashchange', () => (route.value = parse(location.hash)));

export function navigate(hash: string, replace = false): void {
  if (location.hash === hash) return;
  if (replace) history.replaceState(null, '', hash);
  else history.pushState(null, '', hash);
  route.value = parse(location.hash);
}

/** Back to the list: real history back if we came from it (keeps Android's back button natural). */
export function goHome(): void {
  if (history.state?.fromHome) history.back();
  else navigate('#/');
}

export function openWindow(host: string, window: string, pane?: string | null, replace = false): void {
  const hash = windowHref(host, window, pane);
  if (location.hash === hash) return;
  const fromHome = route.value.name === 'home' || (replace && history.state?.fromHome);
  if (replace) history.replaceState({ fromHome }, '', hash);
  else history.pushState({ fromHome }, '', hash);
  route.value = parse(location.hash);
}

window.addEventListener('popstate', () => (route.value = parse(location.hash)));
