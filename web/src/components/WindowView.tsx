import { useEffect, useRef, useState } from 'preact/hooks';
import type { HostInfo, SessionInfo, WindowInfo } from '../../../shared/types';
import { killPane, reloadWindow, windowMenu } from '../menus';
import { isDesktop, prefs, setPref } from '../prefs';
import { goHome, openWindow } from '../router';
import { connections, multiHost, STATE_LABEL, type MenuItem } from '../state';
import { uploadFiles } from '../upload';
import { hub } from '../ws';
import { ConnectionsButton } from './Header';
import { PendingStrip } from './Assist';
import { IconBack, IconMore } from './icons';
import { EDGE } from './Drawer';
import { TerminalView } from './TerminalView';

interface Props {
  host: HostInfo;
  session: SessionInfo;
  window: WindowInfo;
  paneId: string | null;
}

/** One tmux window: pane tabs, its terminal and window actions. */
export function WindowView({ host, session, window, paneId }: Props) {
  const desktop = isDesktop.value;
  const pane = window.panes.find((p) => p.id === paneId) ?? window.panes.find((p) => p.active) ?? window.panes[0];

  // Tell the hub what this tab shows: connection list + no push for what you are looking at.
  useEffect(() => {
    hub.setView({ host: host.id, session: session.id, window: window.id, pane: pane?.id });
  }, [host.id, session.id, window.id, pane?.id]);
  useEffect(() => () => hub.setView(null), []);

  const selectPane = (id: string) => {
    openWindow(host.id, window.id, id, true);
    void hub.action(host.id, { op: 'selectPane', pane: id });
  };

  // Swipe on the header: previous / next window of this space.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const sibling = (dir: 1 | -1) => {
    const i = session.windows.findIndex((w) => w.id === window.id);
    const next = session.windows[(i + dir + session.windows.length) % session.windows.length];
    if (next && next.id !== window.id) openWindow(host.id, next.id, null, true);
  };

  const solo = session.windows.length === 1;

  // Files dropped on the window, or an image pasted (Cmd+V of a screenshot), go to the pane for Claude.
  const [dropping, setDropping] = useState(false);
  const carriesFiles = (e: DragEvent) => !!pane && !!e.dataTransfer?.types.includes('Files');
  const onDragOver = (e: DragEvent) => {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    setDropping(true);
  };
  const onDragLeave = (e: DragEvent) => {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) setDropping(false);
  };
  const onDrop = (e: DragEvent) => {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    setDropping(false);
    void uploadFiles(host.id, pane!.id, [...e.dataTransfer!.files]);
  };
  const onPaste = (e: ClipboardEvent) => {
    const data = e.clipboardData;
    // Text wins: copying spreadsheet cells also carries a picture of them.
    if (!pane || !data?.files.length || data.getData('text/plain')) return;
    e.preventDefault();
    e.stopPropagation();
    void uploadFiles(host.id, pane.id, [...data.files]);
  };
  const openMenu = () => {
    const extra: MenuItem[] = [];
    if (pane) extra.push({ label: `Cerrar panel ${pane.index}`, icon: '✕', danger: true, run: () => killPane(host, window, pane) });
    windowMenu(host, session, window, { pane, extra, leave: !desktop });
  };

  // Above the keyboard bar: the other pending panes (on wide screens the sidebar already lists them).
  const above = pane && !desktop && <PendingStrip host={host} pane={pane} />;

  return (
    <div class={`wv ${dropping ? 'dropping' : ''}`} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} onPasteCapture={onPaste}>
      <header
        class="wv-head"
        onTouchStart={(e) => (touch.current = e.touches[0].clientX > EDGE ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null)}
        onTouchEnd={(e) => {
          const t = touch.current;
          touch.current = null;
          if (!t) return;
          const dx = e.changedTouches[0].clientX - t.x;
          const dy = e.changedTouches[0].clientY - t.y;
          if (Math.abs(dx) > 70 && Math.abs(dy) < 40) sibling(dx < 0 ? 1 : -1);
        }}
      >
        {!desktop && (
          <button class="icon-btn" aria-label="Volver a la lista" onClick={goHome}>
            <IconBack />
          </button>
        )}
        <div class="wv-title">
          <div class="wv-name">
            {window.icon && <span class="wv-icon">{window.icon}</span>}
            {/* The only window of a space goes by the space's name. */}
            {solo ? <span>{session.name}</span> : <span class={window.pinned ? 'pinned' : ''}>{window.name}</span>}
          </div>
          <div class="wv-sub">
            <span>
              {solo ? (window.name !== session.name ? window.name : '') : `${session.name} · ${window.index}/${session.windows.length}`}
              {multiHost.value ? `${solo && window.name === session.name ? '' : ' · '}${host.name}` : ''}
            </span>
            {window.state && <span class={`state-chip state-${window.state}`}>{STATE_LABEL[window.state]}</span>}
          </div>
        </div>
        {!desktop && <ConnectionsButton count={connections.value.length} />}
        <button class="icon-btn" aria-label="Acciones de la ventana" onClick={openMenu}>
          <IconMore />
        </button>
      </header>

      {window.panes.length > 1 && (
        <div class="pane-tabs scroll-x" role="tablist" aria-label="Paneles">
          {window.panes.map((p) => (
            <button key={p.id} role="tab" aria-selected={p.id === pane?.id} class={`pane-tab ${p.id === pane?.id ? 'on' : ''}`} onClick={() => selectPane(p.id)}>
              {p.icon && <span>{p.icon}</span>}
              <span class="pane-tab-idx">{p.index}</span>
              <span class="pane-tab-cmd">{p.command}</span>
            </button>
          ))}
        </div>
      )}
      <div class="wv-bar">
        <ViewTools />
        <button class="reload-btn" onClick={() => reloadWindow(host, window)} aria-label="Recargar ventana" title="Recargar ventana: .zshrc y Claude">
          ↻
        </button>
      </div>

      {pane && <TerminalView key={`${host.id}:${session.id}`} host={host} session={session} window={window} pane={pane} above={above} />}
    </div>
  );
}

/** Font size of the terminal (stored per device). */
function ViewTools() {
  const size = prefs.value.termFontSize;
  return (
    <div class="view-tools">
      <button onClick={() => setPref('termFontSize', Math.max(8, size - 1))} aria-label="Letra más pequeña">
        A−
      </button>
      <button onClick={() => setPref('termFontSize', Math.min(22, size + 1))} aria-label="Letra más grande">
        A+
      </button>
    </div>
  );
}
