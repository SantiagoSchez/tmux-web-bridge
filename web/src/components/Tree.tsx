import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { homePath } from '../../../shared/folders';
import type { HostInfo, PaneInfo, SessionInfo, WindowInfo } from '../../../shared/types';
import { hostMenu, killSession, killWindow, moveHost, newSession, newWindow, sessionMenu, windowMenu } from '../menus';
import { isTouch, prefs, setPref } from '../prefs';
import { openWindow, route } from '../router';
import { activity, hosts, isSolo, multiHost, pending, STATE_LABEL, toast, wsStatus, type PaneRef } from '../state';
import { ago, duration } from '../time';
import { updateInfo } from '../updates';
import { IconBranch, IconClose, IconMore, IconPlus, IconWorktree } from './icons';

/** Home: what needs you first, then every host → space → window. */
export function Tree() {
  const list = hosts.value;
  return (
    <div class={`tree scroll ${prefs.value.listView === 'compact' ? 'compact' : ''}`}>
      {wsStatus.value === 'closed' && <div class="banner">Sin conexión con el servidor central. Reintentando…</div>}
      <Pending />
      {list.map((h, i) => (
        <HostBlock key={h.id} host={h} index={i} last={i === list.length - 1} />
      ))}
      {list.length === 0 && wsStatus.value === 'open' && <p class="dim pad">No hay máquinas configuradas.</p>}
      <VersionFooter />
    </div>
  );
}

/** The hub's version and the date of its release, at the bottom of the list. */
function VersionFooter() {
  const info = updateInfo.value;
  if (!info) return null;
  const r = info.released;
  const date = r && new Date(r.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <footer class="version-footer">
      {r ? (
        <a href={r.url} target="_blank" rel="noopener" title="Notas de esta versión">
          twb v{info.current} · {date}
        </a>
      ) : (
        `twb v${info.current}`
      )}
    </footer>
  );
}

/** Panes that just started waiting: highlighted for a few seconds. */
const FRESH_MS = 10_000;

function Pending() {
  const items = pending.value;
  const seen = useRef<Set<string> | null>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  // A pane that becomes pending (or changes, e.g. 🔨 → 🙋) scrolls into view and pulses.
  useEffect(() => {
    const keys = new Set(items.map((p) => `${p.host.id}:${p.pane.id}:${p.pane.state}`));
    const before = seen.current;
    seen.current = keys;
    if (!before) return; // first render: nothing is "new"
    const added = [...keys].filter((k) => !before.has(k));
    if (!added.length) return;
    setFresh((f) => new Set([...f, ...added]));
    const el = cards.current.get(added[0]);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const t = setTimeout(() => setFresh((f) => new Set([...f].filter((k) => !added.includes(k)))), FRESH_MS);
    return () => clearTimeout(t);
  }, [items.map((p) => `${p.host.id}:${p.pane.id}:${p.pane.state}`).join('|')]);

  if (items.length === 0) return null;
  return (
    <section class="pending">
      <h2 class="section-title">Pendientes</h2>
      <ul class="cards">
        {items.map((p) => {
          const key = `${p.host.id}:${p.pane.id}:${p.pane.state}`;
          return (
            <PendingCard
              key={`${p.host.id}:${p.pane.id}`}
              item={p}
              fresh={fresh.has(key)}
              cardRef={(el: HTMLElement | null) => (el ? cards.current.set(key, el) : cards.current.delete(key))}
            />
          );
        })}
      </ul>
    </section>
  );
}

function PendingCard({ item, fresh, cardRef }: { item: PaneRef; fresh: boolean; cardRef: (el: HTMLElement | null) => void }) {
  const { host, session, window, pane } = item;
  const r = route.value;
  const current = r.name === 'window' && r.host === host.id && r.window === window.id;
  // How long it worked before finishing: the activity's last «done» of this pane.
  const worked =
    pane.state === 'done' ? activity.value.find((e) => e.host === host.id && e.pane === pane.id && (e.kind === 'done' || e.kind === 'launch'))?.worked : undefined;
  return (
    <li ref={cardRef}>
      <button class={`card state-${pane.state} ${current ? 'current' : ''} ${fresh ? 'fresh' : ''}`} onClick={() => openWindow(host.id, window.id, pane.id)}>
        <span class="card-icon">{pane.icon}</span>
        <span class="card-body">
          <span class="card-title">{window.name}</span>
          <span class="card-meta">
            {STATE_LABEL[pane.state!]}
            {pane.since ? ` ${ago(pane.since)}` : ''}
            {worked ? ` · trabajó ${duration(worked)}` : ''} · {session.name}
            {window.panes.length > 1 ? ` · panel ${pane.index}` : ''}
            {multiHost.value ? ` · ${host.name}` : ''}
          </span>
        </span>
      </button>
    </li>
  );
}

/** A machine being dragged by its header, and where it would land (before the host at `index`). */
const hostDrag = signal<{ id: string; index: number } | null>(null);

/**
 * With a mouse, a machine's header drags it up or down the list. Pointer events
 * rather than HTML drag and drop: Firefox does not start a drag on a button.
 */
function dragHost(down: PointerEvent, id: string): void {
  if (down.pointerType !== 'mouse' || down.button !== 0 || !multiHost.value) return;
  const tree = (down.currentTarget as HTMLElement).closest('.tree');
  if (!tree) return;
  let moving = false;
  const move = (e: PointerEvent) => {
    if (!moving) {
      if (Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) < 6) return;
      moving = true;
      document.body.classList.add('dragging-host');
      getSelection()?.removeAllRanges();
    }
    const blocks = [...tree.querySelectorAll<HTMLElement>('section.host')];
    const at = blocks.findIndex((b) => {
      const r = b.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    hostDrag.value = { id, index: at < 0 ? blocks.length : at };
  };
  const up = (e: PointerEvent) => {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    removeEventListener('pointercancel', up);
    const drop = hostDrag.value;
    hostDrag.value = null;
    if (!moving) return;
    document.body.classList.remove('dragging-host');
    // Releasing over the header would also fold the machine.
    const swallow = (ev: Event) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => removeEventListener('click', swallow, { capture: true }));
    if (drop && e.type === 'pointerup') moveHost(id, drop.index);
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
}

/** The dragged machine fades; a line shows where it would land (nothing when it would not move). */
function dragClass(id: string, index: number, last: boolean): string {
  const drag = hostDrag.value;
  if (!drag) return '';
  if (drag.id === id) return 'dragged';
  const from = hosts.value.findIndex((h) => h.id === drag.id);
  if (drag.index === from || drag.index === from + 1) return '';
  if (drag.index === index) return 'drop-before';
  return last && drag.index === index + 1 ? 'drop-after' : '';
}

function HostBlock({ host, index, last }: { host: HostInfo; index: number; last: boolean }) {
  const collapsed = prefs.value.collapsedHosts.includes(host.id);
  const toggle = () => {
    const list = prefs.value.collapsedHosts.filter((id) => id !== host.id);
    setPref('collapsedHosts', collapsed ? list : [...list, host.id]);
  };
  const waiting = pending.value.filter((p) => p.host.id === host.id).length;
  return (
    <section class={`host ${dragClass(host.id, index, last)}`}>
      {multiHost.value || host.status !== 'ok' ? (
        <div class="host-head" onPointerDown={(e) => dragHost(e, host.id)}>
          <button class="host-toggle" onClick={toggle} aria-expanded={!collapsed}>
            <span class={`chevron ${collapsed ? '' : 'open'}`} aria-hidden="true">
              ›
            </span>
            <span class={`dot dot-${host.status === 'ok' ? 'open' : host.status === 'error' ? 'closed' : 'connecting'}`} />
            <h2 class="host-name">{host.name}</h2>
            {collapsed && waiting > 0 && <span class="pill pill-alert">{waiting}</span>}
            {host.status === 'error' ? (
              <span
                class="dim small host-offline"
                title={host.error || undefined}
                onClick={(e) => {
                  // No hover on a phone: a tap shows the error instead of folding the host.
                  if (!isTouch || !host.error) return;
                  e.stopPropagation();
                  toast(`${host.name}: ${host.error}`, 'error');
                }}
              >
                sin conexión
              </span>
            ) : (
              <span class="dim small">{host.status === 'ok' ? `${host.sessions.length} spaces` : 'conectando…'}</span>
            )}
          </button>
          {host.status === 'ok' && (
            <button class="icon-btn small-btn" aria-label={`Nuevo space en ${host.name}`} title="Nuevo space" onClick={() => newSession(host)}>
              <IconPlus />
            </button>
          )}
          <button class="icon-btn small-btn" aria-label={`Acciones de ${host.name}`} onClick={() => hostMenu(host)}>
            <IconMore />
          </button>
        </div>
      ) : (
        <div class="host-head">
          <h2 class="section-title">Spaces</h2>
          <button class="icon-btn small-btn" aria-label="Nuevo space" title="Nuevo space" onClick={() => newSession(host)}>
            <IconPlus />
          </button>
          <button class="icon-btn small-btn" aria-label="Acciones" onClick={() => hostMenu(host)}>
            <IconMore />
          </button>
        </div>
      )}
      {!(collapsed && multiHost.value) && (
        <>
          {host.status === 'ok' && host.sessions.length === 0 && (
            <div class="host-empty">
              <span class="dim">tmux no tiene sesiones abiertas.</span>
              <button class="btn" onClick={() => newSession(host)}>
                Nuevo space
              </button>
            </div>
          )}
          {host.sessions.map((s) => (
            <SessionBlock key={s.id} host={host} session={s} />
          ))}
        </>
      )}
    </section>
  );
}

function SessionBlock({ host, session }: { host: HostInfo; session: SessionInfo }) {
  if (isSolo(session)) return <SoloSession host={host} session={session} window={session.windows[0]} />;
  const key = `${host.id}:${session.name}`;
  const collapsed = prefs.value.collapsedSessions.includes(key);
  const toggle = () => {
    const list = prefs.value.collapsedSessions.filter((k) => k !== key);
    setPref('collapsedSessions', collapsed ? list : [...list, key]);
  };
  const r = route.value;
  const holdsCurrent = r.name === 'window' && r.host === host.id && session.windows.some((w) => w.id === r.window);
  // Folded: the windows' state icons, so a 🙋 inside is not hidden.
  const icons = collapsed ? [...new Set(session.windows.map((w) => w.icon).filter(Boolean))] : [];
  return (
    <div class={`session ${collapsed ? 'collapsed' : ''} ${collapsed && holdsCurrent ? 'holds-current' : ''}`}>
      <div class="session-head">
        <button class="session-toggle" onClick={toggle} aria-expanded={!collapsed} title={collapsed ? 'Desplegar' : 'Plegar'}>
          <span class={`chevron ${collapsed ? '' : 'open'}`} aria-hidden="true">
            ›
          </span>
          <span class="session-num">{session.num ?? '·'}</span>
          {session.icon && <span class="session-icon">{session.icon}</span>}
          <span class="session-name">{session.name}</span>
          {collapsed && (
            <span class="session-summary">
              {icons.join(' ')} {session.windows.length}
            </span>
          )}
          {session.attached > 0 && <span class="attached" title="Hay un cliente de tmux conectado" />}
        </button>
        <button class="icon-btn small-btn" aria-label={`Nueva ventana en ${session.name}`} title="Nueva ventana" onClick={() => newWindow(host, session)}>
          <IconPlus />
        </button>
        <button class="icon-btn small-btn" aria-label={`Acciones de ${session.name}`} onClick={() => sessionMenu(host, session)}>
          <IconMore />
        </button>
      </div>
      {!collapsed && (
        <ul class="windows">
          {session.windows.map((w) => (
            <WindowRow key={w.id} host={host} session={session} window={w} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** A space with a single window: one row that is both, instead of a header and a window with the same name. */
function SoloSession({ host, session, window }: { host: HostInfo; session: SessionInfo; window: WindowInfo }) {
  const r = route.value;
  const current = r.name === 'window' && r.host === host.id && r.window === window.id;
  const active = window.panes.find((p) => p.active) ?? window.panes[0];
  const meta = [
    window.name !== session.name ? window.name : '',
    active?.command,
    window.panes.length > 1 ? `${window.panes.length} paneles` : '',
    window.zoomed ? 'zoom' : '',
  ].filter(Boolean);
  return (
    <div class="session solo">
      <div class={`win-row ${current ? 'current' : ''}`}>
        <button class={`win ${current ? 'current' : ''} ${window.state ? `state-${window.state}` : ''}`} onClick={() => openWindow(host.id, window.id)}>
          <span class="session-num">{session.num ?? '·'}</span>
          <span class="win-icon">{window.icon || session.icon}</span>
          <span class="win-body">
            <span class="win-line">
              <span class="session-name">{session.name}</span>
              <span class="win-meta">{meta.join(' · ')}</span>
            </span>
            <WhereLine host={host} pane={active} />
          </span>
          {session.attached > 0 && <span class="attached" title="Hay un cliente de tmux conectado" />}
          {window.bell && <span class="flag flag-bell" title="Campana" />}
          {window.activity && <span class="flag flag-activity" title="Actividad" />}
        </button>
        <span class="win-acts">
          <button class="win-act" aria-label={`Nueva ventana en ${session.name}`} title="Nueva ventana" onClick={() => newWindow(host, session)}>
            <IconPlus />
          </button>
          <button class="win-act" aria-label={`Acciones de ${session.name}`} title="Acciones" onClick={() => windowMenu(host, session, window, { leave: current })}>
            <IconMore />
          </button>
          <button class="win-act win-close" aria-label={`Cerrar el space ${session.name}`} title="Cerrar space" onClick={() => killSession(host, session, current)}>
            <IconClose />
          </button>
        </span>
      </div>
    </div>
  );
}

/**
 * The detailed list's second line of a window: the git worktree its active pane is in or
 * else the branch; out of a repo, its folder, cut at the start if it does not fit (the
 * end is what tells one from another).
 */
function WhereLine({ host, pane }: { host: HostInfo; pane: PaneInfo | undefined }) {
  if (prefs.value.listView === 'compact' || !pane?.path) return null;
  const git = pane.git;
  const path = homePath(pane.path, host.home ?? '');
  return (
    <span class="win-meta win-where">
      {git ? (
        <span class="win-git" title={`${git.worktree ? `Worktree de git: ${git.worktree}` : `Rama de git: ${git.branch}`}\n${path}`}>
          <span class="git-icon">{git.worktree ? <IconWorktree /> : <IconBranch />}</span>
          {git.worktree ?? git.branch}
        </span>
      ) : (
        // Right to left, so the ellipsis goes at the start; the marks keep ~ and / where they are.
        <span class="win-path" title={path}>
          {`\u200e${path}\u200e`}
        </span>
      )}
    </span>
  );
}

function WindowRow({ host, session, window }: { host: HostInfo; session: SessionInfo; window: WindowInfo }) {
  const r = route.value;
  const current = r.name === 'window' && r.host === host.id && r.window === window.id;
  const active = window.panes.find((p) => p.active) ?? window.panes[0];
  return (
    <li class={`win-row ${current ? 'current' : ''}`}>
      <button class={`win ${current ? 'current' : ''} ${window.state ? `state-${window.state}` : ''}`} onClick={() => openWindow(host.id, window.id)}>
        <span class="win-index">{window.index}</span>
        <span class="win-icon">{window.icon}</span>
        <span class="win-body">
          <span class="win-line">
            <span class={`win-name ${window.pinned ? 'pinned' : ''}`}>{window.name}</span>
            <span class="win-meta">
              {active?.command}
              {window.panes.length > 1 ? ` · ${window.panes.length} paneles` : ''}
              {window.zoomed ? ' · zoom' : ''}
            </span>
          </span>
          <WhereLine host={host} pane={active} />
        </span>
        {window.bell && <span class="flag flag-bell" title="Campana" />}
        {window.activity && <span class="flag flag-activity" title="Actividad" />}
      </button>
      <span class="win-acts">
        <button class="win-act" aria-label={`Acciones de la ventana ${window.name}`} title="Acciones" onClick={() => windowMenu(host, session, window, { leave: current })}>
          <IconMore />
        </button>
        <button class="win-act win-close" aria-label={`Cerrar la ventana ${window.name}`} title="Cerrar ventana" onClick={() => killWindow(host, window, current)}>
          <IconClose />
        </button>
      </span>
    </li>
  );
}
