import { prefs, toggleSidebar } from '../prefs';
import { shortcutLabel } from '../shortcuts';
import { openWindow, route } from '../router';
import { multiHost, pending, STATE_LABEL, wsStatus, type PaneRef } from '../state';
import { ago } from '../time';
import { useHoverTip, windowTip } from './HoverTip';
import { IconSidebar } from './icons';

const STATUS_LABEL = { open: 'Conectado', connecting: 'Conectando…', closed: 'Sin conexión' } as const;

/**
 * The list folded on a wide screen: a strip with the button that unfolds it, the hub link
 * status and, one under another, the panes that are waiting for you (a click opens one).
 */
export function Rail() {
  const status = wsStatus.value;
  const r = route.value;
  const items = pending.value;
  return (
    <nav class="rail-body" aria-label="Lista plegada">
      <button class="icon-btn" aria-label="Mostrar la lista" aria-expanded={!prefs.value.sidebarCollapsed} title={`Mostrar la lista (${shortcutLabel('foldList')})`} onClick={toggleSidebar}>
        <IconSidebar />
      </button>
      <span class={`dot dot-${status}`} title={STATUS_LABEL[status]} />
      {items.length > 0 && (
        <ul class="rail-pending scroll" aria-label="Pendientes">
          {items.map((ref) => (
            <RailItem key={`${ref.host.id}:${ref.pane.id}`} item={ref} current={r.name === 'window' && r.host === ref.host.id && r.window === ref.window.id} />
          ))}
        </ul>
      )}
    </nav>
  );
}

/** A pane waiting for you: its icon; resting the mouse on it shows its window, with it marked. */
function RailItem({ item: { host, session, window, pane }, current }: { item: PaneRef; current: boolean }) {
  const tip = useHoverTip(`rail:${host.id}:${pane.id}`, windowTip(host.id, window.id, { mark: pane.id }));
  const where = [session.name, window.panes.length > 1 ? `panel ${pane.index}` : '', multiHost.value ? host.name : ''].filter(Boolean).join(' · ');
  const label = `${window.name}: ${STATE_LABEL[pane.state!]}${pane.since ? ` ${ago(pane.since)}` : ''} (${where})`;
  return (
    <li>
      <button class={`rail-item state-${pane.state} ${current ? 'current' : ''}`} aria-label={label} onClick={() => openWindow(host.id, window.id, pane.id)} {...tip}>
        {pane.icon || '•'}
      </button>
    </li>
  );
}
