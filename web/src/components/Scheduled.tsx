import { useState } from 'preact/hooks';
import { limitSuggestions, scheduledProblem } from '../../../shared/scheduled';
import type { ScheduledMessage } from '../../../shared/types';
import { runWorktreeName } from '../../../shared/worktree';
import { api } from '../api';
import { isDesktop, prefs, setPref } from '../prefs';
import { openWindow } from '../router';
import { dialog, findWindow, hosts, hubSettings, scheduled, scratchpadsOpen, toast, type Dialog } from '../state';
import { LaunchOptionFields, LaunchTargetFields, useLaunchFields } from './LaunchFields';
import { machineLimits } from './LimitsBar';
import { Sheet } from './Sheet';

// Scheduled messages: a prompt the hub launches once, at a fixed date and time, to spend
// what is left of the limits. The form opens from the clock button of each machine in the
// list; the «Programados» section, above the scratchpads, shows them while there is any.

/** «mié 20 nov, 12:00». */
const when = (t: number) => new Date(t).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Epoch ms as a `datetime-local` field holds it, in local time: «2026-11-20T12:00». */
function localInput(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Opens the form for a new message on `host`, or to change a pending one. */
export function openScheduled(host: string, message?: ScheduledMessage): void {
  dialog.value = { kind: 'scheduled', host, message };
}

/** The resets of the machine's account, in epoch ms (its readings come in seconds; 0 is unknown). */
function resets(hostId: string): { five: number | null; seven: number | null } {
  const l = machineLimits(hostId);
  const ms = (s: number | undefined) => (s ? s * 1000 : null);
  return { five: ms(l?.five?.resetsAt), seven: ms(l?.seven?.resetsAt) };
}

export function ScheduledDialog({ d, close }: { d: Extract<Dialog, { kind: 'scheduled' }>; close: () => void }) {
  const m = d.message;
  const f = useLaunchFields(m ?? { host: d.host });
  const [at, setAt] = useState(m ? localInput(m.at) : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const time = at ? new Date(at).getTime() : Number.NaN;
  const r = resets(f.hostId);
  const suggestions = limitSuggestions(Date.now(), r.five, r.seven);
  const problem = f.value && at ? scheduledProblem({ ...f.value, at: time }, new Date()) : null;
  const ready = !!f.value && !!at && !problem;
  const worktreeName = f.name.trim() ? runWorktreeName(f.name.trim(), Number.isFinite(time) ? new Date(time) : new Date()) : '';

  const submit = async () => {
    if (!f.value || !ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api<ScheduledMessage>('/api/scheduled', { ...f.value, at: time, ...(m ? { id: m.id } : {}) });
      toast(`«${f.value.name}» se lanzará el ${when(time)}`);
      close();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Sheet title={m ? 'Editar mensaje programado' : 'Programar mensaje'} subtitle="Se lanza una vez, a la hora que elijas, aunque el límite esté agotado." onClose={close}>
      <form
        class="folder-picker"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <LaunchTargetFields f={f} namePlaceholder="p. ej. Repasar los tests" />
        <label class="folder-name">
          <span class="dim small">Cuándo</span>
          <input class="text-input" type="datetime-local" value={at} min={localInput(Date.now())} onInput={(e) => setAt(e.currentTarget.value)} />
        </label>
        {suggestions.length > 0 && (
          <div class="sched-chips" role="group" aria-label="Horas sugeridas por los límites de la cuenta">
            {suggestions.map((s) => (
              <button key={s.label} type="button" class={`sched-chip ${localInput(s.at) === at ? 'on' : ''}`} onClick={() => setAt(localInput(s.at))}>
                <span>{s.label}</span>
                <span class="dim">{when(s.at)}</span>
              </button>
            ))}
          </div>
        )}
        {problem && <p class="settings-state small">{problem}</p>}
        <LaunchOptionFields f={f} worktreeLabel={`En un worktree nuevo${worktreeName ? ` (${worktreeName})` : ''}`} />
        {error && <p class="settings-state small">{error}</p>}
        <div class="sheet-actions">
          <button type="button" class="btn" onClick={close}>
            Cancelar
          </button>
          <button type="submit" class="btn btn-primary" disabled={!ready || busy}>
            {m ? 'Guardar' : 'Programar'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/** The folder of a message as the machine's folders name it, else its path. */
function folderLabel(m: ScheduledMessage): string {
  if (m.target.sub) return m.target.sub;
  return (hubSettings.value?.folders[m.host] ?? []).find((f) => f.path === m.target.folder)?.name ?? m.target.folder;
}

/** Pending ones first, the soonest on top; then the results, the newest on top. */
function ordered(list: ScheduledMessage[]): ScheduledMessage[] {
  const waiting = list.filter((m) => m.status === 'pending' || m.status === 'launching').sort((a, b) => a.at - b.at);
  const done = list.filter((m) => m.status === 'launched' || m.status === 'error').sort((a, b) => (b.ranAt ?? 0) - (a.ranAt ?? 0));
  return [...waiting, ...done];
}

function remove(m: ScheduledMessage): void {
  api(`/api/scheduled/${m.id}/delete`, {}).catch((err: Error) => toast(err.message, 'error'));
}

function cancel(m: ScheduledMessage): void {
  dialog.value = {
    kind: 'confirm',
    title: `¿Cancelar «${m.name}»?`,
    message: `Ya no se lanzará el ${when(m.at)}.`,
    confirm: 'Cancelar el mensaje',
    danger: true,
    onSubmit: () => remove(m),
  };
}

function ScheduledRow({ m }: { m: ScheduledMessage }) {
  const hostName = hosts.value.find((h) => h.id === m.host)?.name ?? m.host;
  const win = m.status === 'launched' && m.window ? findWindow(m.host, m.window) : null;
  const status =
    m.status === 'pending'
      ? `Se lanza el ${when(m.at)}`
      : m.status === 'launching'
        ? 'Lanzándose…'
        : m.status === 'launched'
          ? `Lanzado el ${when(m.ranAt ?? m.at)}${m.late ? ` (tarde: tocaba el ${when(m.at)})` : ''}`
          : `No se pudo lanzar${m.message ? `: ${m.message}` : ''}`;
  return (
    <li class={`sched-row sched-${m.status}`}>
      <div class="sched-text">
        <span class="sched-name">{m.name}</span>
        <span class="sched-status small">{status}</span>
        <span class="dim small sched-where">
          {hostName} › {folderLabel(m)}
          {m.worktree ? ` · worktree${m.base ? ` desde ${m.base}` : ''}` : ''}
        </span>
      </div>
      <div class="sched-actions">
        {m.status === 'pending' && (
          <>
            <button class="btn sched-btn" onClick={() => openScheduled(m.host, m)}>
              Editar
            </button>
            <button class="btn sched-btn" onClick={() => cancel(m)}>
              Cancelar
            </button>
          </>
        )}
        {win && (
          <button
            class="btn sched-btn"
            onClick={() => {
              openWindow(m.host, m.window!);
              if (!isDesktop.value) scratchpadsOpen.value = false;
            }}
          >
            Ir a la ventana
          </button>
        )}
        {(m.status === 'launched' || m.status === 'error') && (
          <button class="btn sched-btn" onClick={() => remove(m)}>
            Quitar
          </button>
        )}
      </div>
    </li>
  );
}

/** «Programados (n)», above the scratchpads while there is any; folded to its header on request. */
export function ScheduledList() {
  const list = scheduled.value;
  if (!list.length) return null;
  const folded = prefs.value.scheduledFolded;
  return (
    <section class="sched" aria-label="Mensajes programados">
      <button class="sched-head" aria-expanded={!folded} onClick={() => setPref('scheduledFolded', !folded)}>
        <span class={`chevron ${folded ? '' : 'open'}`} aria-hidden="true">
          ›
        </span>
        Programados ({list.length})
      </button>
      {!folded && (
        <ul class="sched-list scroll">
          {ordered(list).map((m) => (
            <ScheduledRow key={m.id} m={m} />
          ))}
        </ul>
      )}
    </section>
  );
}
