import { route, toggleGrid } from '../router';
import { connections, openSettings, pending, sheet, wsStatus } from '../state';
import { isDesktop, SIDEBAR_KEY, toggleSidebar } from '../prefs';
import { IconActivity, IconBoard, IconGear, IconGrid, IconSidebar, IconUsers } from './icons';
import { trelloInfo } from './Trello';

const STATUS_LABEL = { open: 'Conectado', connecting: 'Conectando…', closed: 'Sin conexión' } as const;

/** Top bar of the list: app name, hub link status, windows grid, live connections counter, settings. */
export function Header() {
  const count = connections.value.length;
  const status = wsStatus.value;
  const waiting = pending.value.length;
  return (
    <header class="topbar">
      <div class="brand">
        {isDesktop.value && (
          <button class="icon-btn sidebar-btn" aria-label="Ocultar la lista" title={`Ocultar la lista (${SIDEBAR_KEY})`} onClick={toggleSidebar}>
            <IconSidebar />
          </button>
        )}
        <span class={`dot dot-${status}`} title={STATUS_LABEL[status]} />
        <span class="brand-name">twb</span>
        {waiting > 0 && (
          <span class="pill pill-alert" title={`${waiting} pendiente${waiting === 1 ? '' : 's'}`}>
            {waiting}
            <span class="pill-word"> pendiente{waiting === 1 ? '' : 's'}</span>
          </span>
        )}
      </div>
      <div class="topbar-actions">
        <button
          class={`icon-btn ${route.value.name === 'grid' ? 'on' : ''}`}
          aria-label="Vista de ventanas"
          aria-pressed={route.value.name === 'grid'}
          title="Todas las ventanas en miniatura"
          onClick={toggleGrid}
        >
          <IconGrid />
        </button>
        <button class="icon-btn" aria-label="Actividad" title="Lo que ha pasado en todas las máquinas" onClick={() => (sheet.value = 'activity')}>
          <IconActivity />
        </button>
        {trelloInfo.value?.configured && (
          <button class="icon-btn" aria-label="Trello" title="Lanzar una tarea desde una tarjeta de Trello" onClick={() => (sheet.value = 'trello')}>
            <IconBoard />
          </button>
        )}
        <ConnectionsButton count={count} />
        <button class="icon-btn" aria-label="Ajustes" onClick={openSettings}>
          <IconGear />
        </button>
      </div>
    </header>
  );
}

/** Live counter of browsers connected to the panel; more than one stands out. */
function ConnectionsButton({ count }: { count: number }) {
  return (
    <button
      class={`conn-btn ${count > 1 ? 'conn-many' : ''}`}
      aria-label={`${count} conexiones activas`}
      title="Conexiones activas al panel"
      onClick={() => (sheet.value = 'connections')}
    >
      <IconUsers />
      <span class="conn-count">{count}</span>
    </button>
  );
}
