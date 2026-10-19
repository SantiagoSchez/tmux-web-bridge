import { useEffect, useMemo, useState } from 'preact/hooks';
import type { HostInfo, PanePreview, PreviewsResponse, SessionInfo, WindowInfo } from '../../../shared/types';
import { renderAnsi } from '../ansi';
import { killSession, killWindow } from '../menus';
import { isDesktop } from '../prefs';
import { openWindow, route, toggleGrid } from '../router';
import { hosts, multiHost, STATE_LABEL } from '../state';
import { IconBack, IconClose } from './icons';

const POLL_MS = 2000;

/**
 * Screens of every pane, polled from the hub while the grid is on screen. Only the
 * panes that changed since the previous poll come down.
 */
function usePreviews(): Record<string, PanePreview> {
  const [previews, setPreviews] = useState<Record<string, PanePreview>>({});
  useEffect(() => {
    let rev = 0;
    let known: Record<string, PanePreview> = {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const poll = async () => {
      clearTimeout(timer);
      if (document.visibilityState === 'visible') {
        try {
          const res = await fetch(`/api/previews?since=${rev}`);
          if (res.ok) {
            const data = (await res.json()) as PreviewsResponse;
            const gone = Object.keys(known).length !== data.alive.length;
            if (!stopped && (gone || Object.keys(data.panes).length)) {
              known = Object.fromEntries(data.alive.flatMap((k) => (data.panes[k] ?? known[k] ? [[k, data.panes[k] ?? known[k]]] : [])));
              setPreviews(known);
            }
            rev = data.rev;
          }
        } catch {
          /* hub unreachable: try again on the next poll */
        }
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };
    void poll();
    document.addEventListener('visibilitychange', poll);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', poll);
    };
  }, []);
  return previews;
}

/** Every open window as a live miniature, titled with its space and name. A tap opens it. */
export function Grid() {
  const desktop = isDesktop.value;
  const previews = usePreviews();
  // Machines without connection have no tiles: what they have open is not known.
  const tiles = hosts.value.flatMap((host) =>
    host.status === 'ok' ? host.sessions.flatMap((session) => session.windows.map((window) => ({ host, session, window }))) : [],
  );
  const count = tiles.length;
  return (
    <div class="gv">
      <header class="wv-head">
        {!desktop && (
          <button class="icon-btn" aria-label="Volver a la lista" onClick={toggleGrid}>
            <IconBack />
          </button>
        )}
        <div class="wv-title">
          <div class="wv-name">Ventanas</div>
          <div class="wv-sub">
            <span>
              {count} abierta{count === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        {desktop && (
          <button class="icon-btn" aria-label="Cerrar la vista de ventanas" onClick={toggleGrid}>
            <IconClose />
          </button>
        )}
      </header>
      <div class="gv-body scroll">
        {count === 0 && <p class="dim small gv-none">No hay ventanas abiertas.</p>}
        {/* Up to 4 per row (2 on a phone), always as wide as the view: fewer windows, bigger tiles. */}
        <ul class="gv-tiles" style={{ '--per-row': Math.max(1, Math.min(count, desktop ? 4 : 2)) }}>
          {tiles.map(({ host, session, window }) => (
            <Tile key={`${host.id}/${session.id}/${window.id}`} host={host} session={session} window={window} previews={previews} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function Tile({ host, session, window, previews }: { host: HostInfo; session: SessionInfo; window: WindowInfo; previews: Record<string, PanePreview> }) {
  const r = route.value;
  const current = r.name === 'window' && r.host === host.id && r.window === window.id;
  // What tmux shows: every pane, or only the zoomed one.
  const shown = window.zoomed ? window.panes.filter((p) => p.active) : window.panes;
  const panes = shown.flatMap((p) => {
    const preview = previews[`${host.id}:${p.id}`];
    return preview ? [{ id: p.id, preview }] : [];
  });
  const size = panes[0]?.preview;
  const solo = session.windows.length === 1;
  const label = `${multiHost.value ? `${host.name} · ` : ''}${session.name} · ${window.name}`;
  return (
    // The tile takes the shape of the window, so there are no bands around it. Cells are 0.6 × 1.2.
    <li class="tile-item" style={size ? { '--ratio': size.cols / (size.rows * 2) } : undefined}>
      <button
        class={`tile ${window.state ? `state-${window.state}` : ''} ${current ? 'current' : ''}`}
        title={window.state ? `${label} · ${STATE_LABEL[window.state]}` : label}
        onClick={() => openWindow(host.id, window.id)}
      >
        <span class="tile-head">
          {window.icon && <span>{window.icon}</span>}
          <span class="tile-name">
            <span class="tile-space">{session.name}</span>
            <span class="tile-sep"> › </span>
            <span class={window.pinned ? 'pinned' : ''}>{window.name}</span>
          </span>
          {multiHost.value && <span class="tile-host">{host.name}</span>}
        </span>
        <span class="tile-screen">
          {size ? (
            <span class="tile-win" style={{ '--cols': size.cols, '--rows': size.rows }}>
              {panes.map((p) => (
                <PaneShot key={p.id} preview={p.preview} />
              ))}
            </span>
          ) : (
            <span class="tile-wait dim small">…</span>
          )}
        </span>
      </button>
      {/* Outside the tile: a button cannot hold another. The only window of a space closes the space, as in its menu. */}
      <button
        class="icon-btn tile-close"
        aria-label={`Cerrar ${solo ? 'el space' : 'la ventana'} ${label}`}
        title={solo ? 'Cerrar space' : 'Cerrar ventana'}
        onClick={() => (solo ? killSession(host, session) : killWindow(host, window))}
      >
        <IconClose />
      </button>
    </li>
  );
}

function PaneShot({ preview: p }: { preview: PanePreview }) {
  const content = useMemo(() => renderAnsi(p.text), [p.text]);
  return (
    <span class="tile-pane" style={{ '--l': p.left, '--t': p.top, '--w': p.width, '--h': p.height }}>
      {content}
    </span>
  );
}
