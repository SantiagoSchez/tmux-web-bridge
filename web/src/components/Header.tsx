import { connections, pending, sheet, wsStatus } from '../state';
import { IconGear, IconUsers } from './icons';

const STATUS_LABEL = { open: 'Conectado', connecting: 'Conectando…', closed: 'Sin conexión' } as const;

/** Top bar of the list: app name, hub link status, live connections counter, settings. */
export function Header() {
  const count = connections.value.length;
  const status = wsStatus.value;
  const waiting = pending.value.length;
  return (
    <header class="topbar">
      <div class="brand">
        <span class={`dot dot-${status}`} title={STATUS_LABEL[status]} />
        <span class="brand-name">twb</span>
        {waiting > 0 && <span class="pill pill-alert">{waiting} pendiente{waiting === 1 ? '' : 's'}</span>}
      </div>
      <div class="topbar-actions">
        <ConnectionsButton count={count} />
        <button class="icon-btn" aria-label="Ajustes" onClick={() => (sheet.value = 'settings')}>
          <IconGear />
        </button>
      </div>
    </header>
  );
}

/** Live counter of browsers connected to the panel; more than one stands out. */
export function ConnectionsButton({ count }: { count: number }) {
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
