import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { HostInfo, SessionInfo, WindowInfo } from '../../../shared/types';
import { openWindow, route } from '../router';
import { ALERT_STATES, hosts, multiHost, paletteOpen, PRIO } from '../state';
import { Sheet } from './Dialogs';

interface Entry {
  host: HostInfo;
  session: SessionInfo;
  window: WindowInfo;
  title: string;
  meta: string;
  /** Normalised text the query is matched against. */
  names: string;
  rest: string;
  order: number;
}

/** Lower case and no accents: "camión" is found by "camion". */
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** "/Users/me/x" and "/home/me/x" as "~/x". */
const shortPath = (p: string) => p.replace(/^\/(?:Users|home)\/[^/]+(?=\/|$)/, '~');

function entries(): Entry[] {
  const list: Entry[] = [];
  let order = 0;
  for (const host of hosts.value) {
    if (host.status !== 'ok') continue;
    for (const session of [...host.sessions].sort((a, b) => (a.num ?? 99) - (b.num ?? 99)))
      for (const window of session.windows) {
        const solo = session.windows.length === 1;
        const pane = window.panes.find((p) => p.active) ?? window.panes[0];
        const title = solo ? session.name : `${session.name} › ${window.name}`;
        const meta = [solo && window.name !== session.name ? window.name : '', pane?.command, pane ? shortPath(pane.path) : '', multiHost.value ? host.name : '']
          .filter(Boolean)
          .join(' · ');
        list.push({
          host,
          session,
          window,
          title,
          meta,
          names: norm(`${session.name} ${window.name}`),
          rest: norm(`${pane?.command ?? ''} ${pane?.path ?? ''} ${host.name}`),
          order: order++,
        });
      }
  }
  return list;
}

/** What needs you first, then names starting with the query, then names containing it. */
function search(all: Entry[], query: string): Entry[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  const alert = (e: Entry) => (e.window.state && ALERT_STATES.includes(e.window.state) ? PRIO[e.window.state] : 0);
  const rank = (e: Entry) => {
    if (!words.length) return 0;
    if (e.names.split(/[\s›]+/).some((n) => n.startsWith(words[0]))) return 0;
    return e.names.includes(words[0]) ? 1 : 2;
  };
  return all
    .filter((e) => words.every((w) => e.names.includes(w) || e.rest.includes(w)))
    .sort((a, b) => alert(b) - alert(a) || rank(a) - rank(b) || a.order - b.order);
}

/** Cmd+K: jump to any window of any machine by typing part of its name. */
export function Palette() {
  if (!paletteOpen.value) return null;
  return <PaletteSheet />;
}

function PaletteSheet() {
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const all = useMemo(entries, [hosts.value]);
  const items = useMemo(() => search(all, query), [all, query]);
  const r = route.value;
  const close = () => (paletteOpen.value = false);

  useEffect(() => input.current?.focus(), []);
  useEffect(() => setSel(0), [query]);
  useEffect(() => listRef.current?.children[sel]?.scrollIntoView({ block: 'nearest' }), [sel]);

  const go = (e: Entry | undefined) => {
    if (!e) return;
    close();
    openWindow(e.host.id, e.window.id);
  };

  return (
    <Sheet title="Ir a una ventana" onClose={close}>
      <input
        ref={input}
        class="text-input"
        value={query}
        placeholder="Space, ventana, comando o carpeta"
        autocapitalize="off"
        autocomplete="off"
        spellcheck={false}
        onInput={(e) => setQuery(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (items.length) setSel((sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            go(items[sel]);
          }
        }}
      />
      <ul class="menu project-list" ref={listRef}>
        {items.map((e, i) => {
          const current = r.name === 'window' && r.host === e.host.id && r.window === e.window.id;
          return (
            <li key={`${e.host.id}:${e.window.id}`}>
              <button class={`menu-item ${i === sel ? 'selected' : ''}`} onClick={() => go(e)} onMouseMove={() => i !== sel && setSel(i)}>
                <span class="menu-icon">{e.window.icon || '▸'}</span>
                <span class="project-text">
                  <span class="project-name">
                    {e.title}
                    {current && <span class="dim small"> · aquí</span>}
                  </span>
                  {e.meta && <span class="project-hint">{e.meta}</span>}
                </span>
              </button>
            </li>
          );
        })}
        {!items.length && <li class="dim pad">{query ? 'Nada coincide.' : 'No hay ventanas abiertas.'}</li>}
      </ul>
    </Sheet>
  );
}
