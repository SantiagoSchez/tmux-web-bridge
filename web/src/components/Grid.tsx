import { useEffect, useMemo, useState } from 'preact/hooks';
import type { HostInfo, PanePreview, PreviewsResponse, SessionInfo, WindowInfo } from '../../../shared/types';
import { renderAnsi } from '../ansi';
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

/** Every open window as a live miniature, by machine and space. A tap opens it. */
export function Grid() {
  const desktop = isDesktop.value;
  const previews = usePreviews();
  const list = hosts.value;
  const count = list.reduce((n, h) => n + h.sessions.reduce((m, s) => m + s.windows.length, 0), 0);
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
        {list.map((host) => (
          <section key={host.id} class="gv-host">
            {(multiHost.value || host.status !== 'ok') && (
              <h2 class="gv-host-head">
                <span class={`dot dot-${host.status === 'ok' ? 'open' : host.status === 'error' ? 'closed' : 'connecting'}`} />
                <span class="host-name">{host.name}</span>
                {host.status !== 'ok' && <span class="dim small">{host.status === 'error' ? 'sin conexión' : 'conectando…'}</span>}
              </h2>
            )}
            {host.status === 'ok' && host.sessions.length === 0 && <p class="dim small gv-none">tmux no tiene sesiones abiertas.</p>}
            {host.sessions.map((s) => (
              <div key={s.id} class="gv-session">
                <h3 class="gv-session-head">
                  <span class="session-num">{s.num ?? '·'}</span>
                  {s.icon && <span>{s.icon}</span>}
                  <span class="session-name">{s.name}</span>
                </h3>
                <ul class="gv-tiles">
                  {s.windows.map((w) => (
                    <Tile key={w.id} host={host} session={s} window={w} previews={previews} />
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))}
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
  const name = session.windows.length === 1 ? session.name : window.name;
  return (
    <li>
      <button
        class={`tile ${window.state ? `state-${window.state}` : ''} ${current ? 'current' : ''}`}
        title={window.state ? `${name} · ${STATE_LABEL[window.state]}` : name}
        onClick={() => openWindow(host.id, window.id)}
      >
        <span class="tile-head">
          <span class="tile-index">{window.index}</span>
          {window.icon && <span>{window.icon}</span>}
          <span class={`tile-name ${window.pinned ? 'pinned' : ''}`}>{name}</span>
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
