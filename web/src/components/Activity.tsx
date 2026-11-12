import { useState } from 'preact/hooks';
import type { ActivityEvent } from '../../../shared/types';
import { openWindow } from '../router';
import { activity, findWindow, multiHost, sheet } from '../state';
import { ago, clock, duration } from '../time';
import { Sheet } from './Dialogs';

// «Actividad»: what happened on every machine in the last days, newest first. A row
// whose window is still open opens it.

const ICON: Record<ActivityEvent['kind'], string> = { question: '🙋', attention: '💬', done: '✅', launch: '▶', skipped: '⏭', error: '⚠' };
const SOURCE: Record<NonNullable<ActivityEvent['source']>, string> = { trello: 'desde Trello', extension: 'desde la extensión de Trello', automation: 'por una automatización', panel: 'desde el panel' };

type Filter = 'all' | 'claude' | 'tasks';
const FILTERS: [Filter, string][] = [
  ['all', 'Todo'],
  ['claude', 'Claude'],
  ['tasks', 'Tareas'],
];

function what(e: ActivityEvent): string {
  switch (e.kind) {
    case 'question':
      return 'Preguntó';
    case 'attention':
      return 'Pidió permiso o atención';
    case 'done':
      return e.worked ? `Terminó tras ${duration(e.worked)}` : 'Terminó';
    case 'launch':
      if (e.source === 'automation') return e.text ? `Lanzada por «${e.text}»` : SOURCE.automation;
      return `Lanzada ${e.source ? SOURCE[e.source] : ''}${e.text ? ` · worktree ${e.text}` : ''}`;
    case 'skipped':
      return `Automatización saltada${e.text ? `: ${e.text.charAt(0).toLowerCase()}${e.text.slice(1)}` : ''}`;
    case 'error':
      return `Automatización fallida${e.text ? `: ${e.text}` : ''}`;
  }
}

/** «Hoy», «Ayer» or the date, for the headings. */
function dayLabel(t: number, now: number): string {
  const d = new Date(t);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function ActivitySheet() {
  if (sheet.value !== 'activity') return null;
  return <ActivityList close={() => (sheet.value = null)} />;
}

function ActivityList({ close }: { close: () => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const now = clock.value;
  const list = activity.value.filter((e) => filter === 'all' || (filter === 'tasks' ? ['launch', 'skipped', 'error'].includes(e.kind) : ['question', 'attention', 'done'].includes(e.kind)));
  const groups: { label: string; events: ActivityEvent[] }[] = [];
  for (const e of list.slice(0, 300)) {
    const label = dayLabel(e.at, now);
    if (groups[groups.length - 1]?.label !== label) groups.push({ label, events: [] });
    groups[groups.length - 1].events.push(e);
  }
  return (
    <Sheet title="Actividad" subtitle="Los últimos 7 días" class="activity-sheet" onClose={close}>
      <div class="seg activity-filter" role="radiogroup" aria-label="Qué enseñar">
        {FILTERS.map(([k, label]) => (
          <button key={k} role="radio" aria-checked={filter === k} class={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
            {label}
          </button>
        ))}
      </div>
      {!groups.length && <p class="dim pad">Nada todavía.</p>}
      {groups.map((g) => (
        <section key={g.label} class="activity-day">
          <h3 class="section-title">{g.label}</h3>
          <ul class="menu">
            {g.events.map((e) => {
              const target = e.window ? findWindow(e.host, e.window) : null;
              const title = e.windowName ?? e.text ?? '';
              return (
                <li key={e.id}>
                  <button
                    class={`menu-item activity-row act-${e.kind}`}
                    disabled={!target}
                    title={target ? 'Abrir la ventana' : 'Esa ventana ya no está abierta'}
                    onClick={() => {
                      if (!target || !e.window) return;
                      close();
                      openWindow(e.host, e.window, e.pane);
                    }}
                  >
                    <span class="activity-icon">{ICON[e.kind]}</span>
                    <span class="project-text">
                      <span class="project-name">
                        {title}
                        {e.space && <span class="dim"> [{e.space}]</span>}
                      </span>
                      <span class="project-hint">
                        {what(e)}
                        {multiHost.value ? ` · ${e.hostName}` : ''}
                      </span>
                    </span>
                    <span class="activity-time" title={new Date(e.at).toLocaleString('es-ES')}>
                      {now - e.at < 6 * 3600_000 ? ago(e.at, now) : new Date(e.at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </Sheet>
  );
}
