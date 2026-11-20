import { useEffect } from 'preact/hooks';
import { describeMute, isMutedAt, MUTE_HOURS, type MuteHours } from '../../../shared/mute';
import { route, toggleGrid } from '../router';
import { connections, dialog, hubSettings, openSettings, pending, sheet, toast, wsStatus } from '../state';
import { isDesktop, toggleSidebar } from '../prefs';
import { shortcutLabel } from '../shortcuts';
import { clock } from '../time';
import { hub } from '../ws';
import { IconActivity, IconBell, IconBellOff, IconBoard, IconChevronDown, IconGear, IconGrid, IconSidebar, IconUsers } from './icons';
import { trelloInfo } from './Trello';

const STATUS_LABEL = { open: 'Conectado', connecting: 'Conectando…', closed: 'Sin conexión' } as const;

/**
 * Top bar of the list: app name, hub link status, the menu of the views (highlighted while
 * the windows view is open), the mute bell, Trello, live connections counter, settings.
 */
export function Header() {
  const count = connections.value.length;
  const status = wsStatus.value;
  const waiting = pending.value.length;
  return (
    <header class="topbar">
      <div class="brand">
        {isDesktop.value && (
          <button class="icon-btn sidebar-btn" aria-label="Ocultar la lista" title={`Ocultar la lista (${shortcutLabel('foldList')})`} onClick={toggleSidebar}>
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
          class={`icon-btn chevron-btn ${route.value.name === 'grid' ? 'on' : ''}`}
          aria-label="Más vistas"
          aria-haspopup="menu"
          aria-pressed={route.value.name === 'grid'}
          title="Más vistas"
          onClick={viewsMenu}
        >
          <IconChevronDown />
        </button>
        <MuteButton />
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

/**
 * The views that do not fit in the bar: the windows view (its entry closes it while it is
 * open) and «Actividad».
 */
function viewsMenu(): void {
  const gridOpen = route.value.name === 'grid';
  dialog.value = {
    kind: 'menu',
    title: 'Más vistas',
    items: [
      { label: gridOpen ? 'Cerrar la vista de ventanas' : 'Vista de ventanas', icon: <IconGrid />, run: toggleGrid },
      { label: 'Actividad', icon: <IconActivity />, run: () => (sheet.value = 'activity') },
    ],
  };
}

/**
 * The bell: a menu to mute push notifications on every device for a while, or, while
 * muted, crossed out with until when, and one tap turns them on again. The hub sets the
 * end on its own clock, so the mute shows when the hub sends it back.
 */
function MuteButton() {
  const mute = hubSettings.value?.mute ?? null;
  const muted = isMutedAt(mute, clock.value);
  const until = mute?.until ?? null;
  // The bell turns back at the end itself, not at the next tick of the clock (30 s).
  useEffect(() => {
    if (until === null) return;
    const left = until - Date.now();
    if (left <= 0) return;
    const timer = setTimeout(() => (clock.value = Date.now()), left + 50);
    return () => clearTimeout(timer);
  }, [until]);

  if (!mute || !muted) {
    const menu = () => {
      // Read when the duration is chosen: the connection may drop while the menu is open.
      const run = (hours: MuteHours | null) => () =>
        wsStatus.value === 'open' ? hub.send({ t: 'mute', hours }) : toast('Sin conexión con el servidor central: no se han silenciado', 'error');
      dialog.value = {
        kind: 'menu',
        title: 'Silenciar notificaciones',
        subtitle: 'En todos los dispositivos. «Enviar prueba» llega igual.',
        items: [...MUTE_HOURS.map((h) => ({ label: h === 1 ? '1 hora' : `${h} horas`, run: run(h) })), { label: 'Hasta nuevo aviso', run: run(null) }],
      };
    };
    return (
      <button class="icon-btn" aria-label="Silenciar notificaciones" aria-haspopup="menu" title="Silenciar notificaciones" onClick={menu}>
        <IconBell />
      </button>
    );
  }
  const label = `${describeMute(mute, clock.value)}. Toca para activarlas.`;
  const unmute = () => {
    // hub.send drops a message while the socket is down: say so instead of showing them on.
    if (wsStatus.value !== 'open') return toast('Sin conexión con el servidor central: no se han activado', 'error');
    const current = hubSettings.value;
    // Shown at once: turning them on needs no word from the hub.
    if (current) hubSettings.value = { ...current, mute: null };
    hub.send({ t: 'unmute' });
    toast('Notificaciones activadas');
  };
  return (
    <button class="icon-btn on" aria-label={label} aria-pressed={true} title={label} onClick={unmute}>
      <IconBellOff />
    </button>
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
