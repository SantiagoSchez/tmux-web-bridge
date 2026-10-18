import type { HostInfo, PaneInfo, SessionInfo, WindowInfo } from '../../shared/types';
import { goHome, openWindow, route } from './router';
import { applyHostOrder, dialog, hosts, multiHost, toast, wsStatus, type MenuItem } from './state';
import { hub } from './ws';

// Tree actions shared by the list and the window view. Anything that destroys
// something asks first.

/** Opens the first window of a space as soon as it shows up in the tree (it was just created). */
export function openSessionWhenReady(hostId: string, sessionId: string): void {
  const started = Date.now();
  const tick = () => {
    const s = hosts.value.find((h) => h.id === hostId)?.sessions.find((x) => x.id === sessionId);
    const w = s?.windows.find((x) => x.active) ?? s?.windows[0];
    if (w) openWindow(hostId, w.id);
    else if (Date.now() - started < 5000) setTimeout(tick, 200);
  };
  tick();
}

export function newSession(host: HostInfo, plain = false): void {
  // Hosts with a projects folder: pick a project, like `c <name>`.
  if (host.projects && !plain) {
    dialog.value = { kind: 'project', host };
    return;
  }
  dialog.value = {
    kind: 'prompt',
    title: 'Nuevo space',
    label: `Sesión nueva en ${host.name}`,
    value: '',
    placeholder: 'Nombre (vacío = automático)',
    confirm: 'Crear',
    onSubmit: async (name) => {
      await hub.action(host.id, { op: 'newSession', name: name || undefined });
    },
  };
}

export function newWindow(host: HostInfo, session: SessionInfo, open = true): void {
  dialog.value = {
    kind: 'prompt',
    title: 'Nueva ventana',
    label: `En ${session.name}`,
    value: '',
    placeholder: 'Nombre (vacío = automático)',
    confirm: 'Crear',
    onSubmit: async (name) => {
      const res = await hub.action<{ window: string; pane: string }>(host.id, { op: 'newWindow', session: session.id, name: name || undefined });
      if (open && res?.window) openWindow(host.id, res.window, res.pane, route.value.name === 'window');
    },
  };
}

export function renameSession(host: HostInfo, session: SessionInfo): void {
  dialog.value = {
    kind: 'prompt',
    title: 'Renombrar space',
    value: session.name,
    confirm: 'Guardar',
    onSubmit: (name) => {
      if (name.trim()) void hub.action(host.id, { op: 'renameSession', session: session.id, name });
    },
  };
}

export function renameWindow(host: HostInfo, window: WindowInfo): void {
  dialog.value = {
    kind: 'prompt',
    title: 'Renombrar ventana',
    label: 'Vacío = nombre automático (proyecto de Claude o comando)',
    value: window.pinned ? window.name : '',
    placeholder: window.name,
    confirm: 'Guardar',
    onSubmit: (name) => void hub.action(host.id, { op: 'renameWindow', window: window.id, name }),
  };
}

export function killSession(host: HostInfo, session: SessionInfo, leave = false): void {
  dialog.value = {
    kind: 'confirm',
    title: `¿Cerrar el space «${session.name}»?`,
    message:
      session.windows.length === 1
        ? 'Se terminará lo que se esté ejecutando en él.'
        : `Se cerrarán sus ${session.windows.length} ventanas y todo lo que se esté ejecutando en ellas.`,
    confirm: 'Cerrar space',
    danger: true,
    onSubmit: async () => {
      await hub.action(host.id, { op: 'killSession', session: session.id });
      if (leave) goHome();
    },
  };
}

export function killWindow(host: HostInfo, window: WindowInfo, leave = false): void {
  dialog.value = {
    kind: 'confirm',
    title: `¿Cerrar la ventana «${window.name}»?`,
    message: window.panes.length > 1 ? `Tiene ${window.panes.length} paneles; se cerrarán todos.` : 'Se terminará lo que se esté ejecutando en ella.',
    confirm: 'Cerrar ventana',
    danger: true,
    onSubmit: async () => {
      await hub.action(host.id, { op: 'killWindow', window: window.id });
      if (leave) goHome();
    },
  };
}

export function killPane(host: HostInfo, window: WindowInfo, pane: PaneInfo): void {
  const last = window.panes.length === 1;
  dialog.value = {
    kind: 'confirm',
    title: `¿Cerrar el panel ${pane.index}?`,
    message: `${pane.command}${last ? ' · Es el único panel: se cerrará la ventana.' : ''}`,
    confirm: 'Cerrar panel',
    danger: true,
    onSubmit: async () => {
      await hub.action(host.id, { op: 'killPane', pane: pane.id });
      if (last) goHome();
    },
  };
}

/** Restarts every pane of a window: fresh shell (.zshrc reloaded) and Claude resumed. */
export function reloadWindow(host: HostInfo, window: WindowInfo): void {
  const isClaude = (p: PaneInfo) => p.command === 'claude' || (p.state !== null && p.state !== 'ssh');
  const claude = window.panes.filter(isClaude);
  const busy = window.panes.filter((p) => p.state === 'busy');
  const many = window.panes.length > 1;
  let message = many
    ? `Se reinician sus ${window.panes.length} paneles con una shell nueva, que vuelve a cargar .zshrc.`
    : 'Se reinicia el panel con una shell nueva, que vuelve a cargar .zshrc.';
  if (claude.length) message += ` Claude se vuelve a abrir con su conversación${many ? ` (panel ${claude.map((p) => p.index).join(', ')})` : ''}.`;
  if (busy.length) message += ` ⚠️ Claude está trabajando${many ? ` en el panel ${busy.map((p) => p.index).join(', ')}` : ''}: se interrumpirá lo que esté haciendo.`;
  dialog.value = {
    kind: 'confirm',
    title: `¿Recargar «${window.name}»?`,
    message,
    confirm: 'Recargar',
    danger: busy.length > 0,
    onSubmit: () => void hub.action(host.id, { op: 'reloadWindow', window: window.id }),
  };
}

/**
 * A window's actions, from the list or from the window itself. `pane` is the one
 * split/zoomed (default: the window's active pane); `extra` goes before closing it.
 * The only window of a space stands for the space: its menu also renames and closes it.
 */
export function windowMenu(
  host: HostInfo,
  session: SessionInfo,
  window: WindowInfo,
  { pane, extra = [], leave = false }: { pane?: PaneInfo; extra?: MenuItem[]; leave?: boolean } = {},
): void {
  const target = pane ?? window.panes.find((p) => p.active) ?? window.panes[0];
  const solo = session.windows.length === 1;
  const items: MenuItem[] = [
    { label: 'Recargar ventana (.zshrc y Claude)', icon: '↻', run: () => reloadWindow(host, window) },
    ...(solo ? [{ label: 'Renombrar space', icon: '✎', run: () => renameSession(host, session) }] : []),
    { label: 'Renombrar ventana', icon: '✎', run: () => renameWindow(host, window) },
    { label: 'Nueva ventana en este space', icon: '＋', run: () => newWindow(host, session) },
    { label: 'Dividir lado a lado  │', icon: '◫', run: () => target && void hub.action(host.id, { op: 'splitPane', pane: target.id, direction: 'h' }) },
    { label: 'Dividir arriba y abajo  ─', icon: '⊟', run: () => target && void hub.action(host.id, { op: 'splitPane', pane: target.id, direction: 'v' }) },
  ];
  if (window.panes.length > 1)
    items.push({ label: window.zoomed ? 'Quitar zoom' : 'Zoom al panel', icon: '⤢', run: () => target && void hub.action(host.id, { op: 'zoomPane', pane: target.id }) });
  items.push(...extra);
  items.push(
    solo
      ? { label: 'Cerrar space', icon: '✕', danger: true, run: () => killSession(host, session, leave) }
      : { label: 'Cerrar ventana', icon: '✕', danger: true, run: () => killWindow(host, window, leave) },
  );
  const title = solo ? session.name : window.name;
  const subtitle = [solo ? (window.name !== session.name ? window.name : '') : session.name, multiHost.value ? host.name : ''].filter(Boolean).join(' · ');
  dialog.value = { kind: 'menu', title: `${window.icon ? window.icon + ' ' : ''}${title}`, subtitle: subtitle || undefined, items };
}

export function sessionMenu(host: HostInfo, session: SessionInfo): void {
  const items: MenuItem[] = [
    { label: 'Nueva ventana', icon: '＋', run: () => newWindow(host, session) },
    { label: 'Renombrar space', icon: '✎', run: () => renameSession(host, session) },
    { label: 'Cerrar space', icon: '✕', danger: true, run: () => killSession(host, session) },
  ];
  dialog.value = { kind: 'menu', title: session.name, subtitle: host.name, items };
}

/**
 * Moves a machine so it lands before the one now at `index` (the list's length:
 * last). The hub keeps the order for every device.
 */
export function moveHost(id: string, index: number): void {
  const ids = hosts.value.map((h) => h.id);
  const from = ids.indexOf(id);
  if (from < 0 || index === from || index === from + 1) return;
  if (wsStatus.value !== 'open') return toast('Sin conexión con el servidor', 'error');
  ids.splice(from, 1);
  ids.splice(index > from ? index - 1 : index, 0, id);
  applyHostOrder(ids);
  hub.send({ t: 'hostOrder', hosts: ids });
}

export function hostMenu(host: HostInfo): void {
  const items: MenuItem[] = [{ label: 'Nuevo space', icon: '＋', disabled: host.status !== 'ok', run: () => newSession(host) }];
  if (multiHost.value) {
    const i = hosts.value.findIndex((h) => h.id === host.id);
    items.push(
      { label: 'Subir en la lista', icon: '↑', disabled: i === 0, run: () => moveHost(host.id, i - 1) },
      { label: 'Bajar en la lista', icon: '↓', disabled: i === hosts.value.length - 1, run: () => moveHost(host.id, i + 2) },
      { label: 'Poner arriba del todo', icon: '⤒', disabled: i === 0, run: () => moveHost(host.id, 0) },
    );
  }
  if (host.reboot) items.push({ label: 'Reiniciar la máquina', icon: '⏻', danger: true, run: () => rebootHost(host) });
  dialog.value = { kind: 'menu', title: host.name, items };
}

export function rebootHost(host: HostInfo): void {
  const windows = host.sessions.reduce((n, s) => n + s.windows.length, 0);
  const busy = host.sessions.flatMap((s) => s.windows.flatMap((w) => w.panes)).filter((p) => p.state === 'busy').length;
  let message =
    host.status === 'ok' && host.sessions.length
      ? `Se cerrarán sus ${host.sessions.length} spaces (${windows} ventanas) y todo lo que se esté ejecutando en ellos.`
      : 'Se reiniciará el sistema operativo.';
  if (busy) message += ` ⚠️ Claude está trabajando en ${busy === 1 ? 'un panel' : `${busy} paneles`}.`;
  message += ' Volverá a aparecer en la lista cuando arranque.';
  dialog.value = {
    kind: 'confirm',
    title: `¿Reiniciar ${host.name}?`,
    message,
    confirm: 'Reiniciar',
    danger: true,
    onSubmit: async () => {
      await hub.action(host.id, { op: 'reboot' });
      toast(`Reiniciando ${host.name}…`);
    },
  };
}
