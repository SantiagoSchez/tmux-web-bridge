import { prefs, SIDEBAR_KEY, toggleSidebar } from '../prefs';
import { openWindow, route } from '../router';
import { multiHost, pending, STATE_LABEL, wsStatus } from '../state';
import { ago } from '../time';
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
      <button class="icon-btn" aria-label="Mostrar la lista" aria-expanded={!prefs.value.sidebarCollapsed} title={`Mostrar la lista (${SIDEBAR_KEY})`} onClick={toggleSidebar}>
        <IconSidebar />
      </button>
      <span class={`dot dot-${status}`} title={STATUS_LABEL[status]} />
      {items.length > 0 && (
        <ul class="rail-pending scroll" aria-label="Pendientes">
          {items.map(({ host, session, window, pane }) => {
            const current = r.name === 'window' && r.host === host.id && r.window === window.id;
            const where = [session.name, window.panes.length > 1 ? `panel ${pane.index}` : '', multiHost.value ? host.name : ''].filter(Boolean).join(' · ');
            const label = `${window.name}: ${STATE_LABEL[pane.state!]}${pane.since ? ` ${ago(pane.since)}` : ''} (${where})`;
            return (
              <li key={`${host.id}:${pane.id}`}>
                <button class={`rail-item state-${pane.state} ${current ? 'current' : ''}`} aria-label={label} title={label} onClick={() => openWindow(host.id, window.id, pane.id)}>
                  {pane.icon || '•'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
