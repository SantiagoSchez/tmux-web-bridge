import { signal } from '@preact/signals';
import { goBack, replaceCurrent, takeOverlayEntry } from './backButton';

export type Route = { name: 'home' } | { name: 'grid' } | { name: 'window'; host: string; window: string; pane: string | null };

const GRID_HASH = '#/grid';

/** Hash routes: #/, #/grid and #/h/<host>/w/<window>[/p/<pane>] (tmux ids without @ and %). */
function parse(hash: string): Route {
  if (hash === GRID_HASH) return { name: 'grid' };
  const m = /^#\/h\/([^/]+)\/w\/(\d+)(?:\/p\/(\d+))?/.exec(hash);
  if (!m) return { name: 'home' };
  return { name: 'window', host: decodeURIComponent(m[1]), window: `@${m[2]}`, pane: m[3] ? `%${m[3]}` : null };
}

export function windowHref(host: string, window: string, pane?: string | null): string {
  return `#/h/${encodeURIComponent(host)}/w/${window.slice(1)}${pane ? `/p/${pane.slice(1)}` : ''}`;
}

export const route = signal<Route>(parse(location.hash));

/** A new page in the history, in place of the back button's entry if that is the current one. */
function push(state: unknown, hash: string): void {
  if (takeOverlayEntry()) history.replaceState(state, '', hash);
  else history.pushState(state, '', hash);
}

window.addEventListener('hashchange', () => (route.value = parse(location.hash)));

export function navigate(hash: string, replace = false): void {
  if (location.hash === hash) return;
  const go = () => {
    if (replace) history.replaceState(null, '', hash);
    else push(null, hash);
    route.value = parse(location.hash);
  };
  if (replace) replaceCurrent(go);
  else go();
}

/** Back to the list: real history back if we came from it (keeps Android's back button natural). */
export function goHome(): void {
  if (history.state?.fromHome) goBack();
  else navigate('#/');
}

export function openWindow(host: string, window: string, pane?: string | null, replace = false): void {
  const hash = windowHref(host, window, pane);
  if (location.hash === hash) return;
  const go = () => {
    // From the grid too: going back returns to it.
    const fromHome = route.value.name !== 'window' || (replace && history.state?.fromHome);
    if (replace) history.replaceState({ fromHome }, '', hash);
    else push({ fromHome }, hash);
    route.value = parse(location.hash);
  };
  if (replace) replaceCurrent(go);
  else go();
}

/** The windows grid, or back to where you were if it is already open. */
export function toggleGrid(): void {
  if (route.value.name !== 'grid') {
    push({ fromApp: true }, GRID_HASH);
    route.value = parse(location.hash);
  } else if (history.state?.fromApp) goBack();
  else navigate('#/');
}

window.addEventListener('popstate', () => (route.value = parse(location.hash)));
