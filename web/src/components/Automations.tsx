import { useEffect, useMemo, useState } from 'preact/hooks';
import { describeSchedule, EVERY_HOURS, nextRun, scheduleProblem, type Schedule } from '../../../shared/schedule';
import type { Automation, AutomationInfo, AutomationRun } from '../../../shared/types';
import { runWorktreeName } from '../../../shared/worktree';
import { api } from '../api';
import { openWindow } from '../router';
import { DayPicker } from './DayPicker';
import { LaunchOptionFields, LaunchTargetFields, useLaunchFields } from './LaunchFields';
import { dialog, findWindow, hosts, sheet, toast } from '../state';

// Settings › Automatizaciones: prompts the hub launches on its own on a schedule, each as
// a task in a new window of a folder's space, optionally in a new worktree per run.

const when = (t: number) =>
  new Date(t).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const RUN_LABEL: Record<AutomationRun['status'], string> = { launched: '▶ Lanzada', skipped: '⏭ Saltada', error: '⚠ Falló' };

export function AutomationSettings() {
  const [list, setList] = useState<AutomationInfo[] | null>(null);
  const [editing, setEditing] = useState<Partial<Automation> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => api<AutomationInfo[]>('/api/automations').then(setList, (err: Error) => toast(err.message, 'error'));
  useEffect(() => void load(), []);

  const save = async (a: Partial<Automation>) => {
    await api<AutomationInfo>('/api/automations', a);
    setEditing(null);
    await load();
  };
  const toggle = async (a: AutomationInfo) => {
    try {
      await api('/api/automations', { ...a, enabled: !a.enabled });
      await load();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };
  const runNow = async (a: AutomationInfo) => {
    setBusy(a.id);
    try {
      const r = await api<AutomationRun>(`/api/automations/${a.id}/run`, {});
      toast(r.status === 'launched' ? `«${a.name}» lanzada` : `«${a.name}»: ${r.message ?? RUN_LABEL[r.status]}`, r.status === 'error' ? 'error' : 'info');
      await load();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };
  const remove = (a: AutomationInfo) => {
    dialog.value = {
      kind: 'confirm',
      title: `¿Borrar «${a.name}»?`,
      message: 'Deja de ejecutarse y se pierde su historial. Las ventanas y los worktrees que lanzó se quedan.',
      confirm: 'Borrar',
      danger: true,
      onSubmit: () => {
        api(`/api/automations/${a.id}/delete`, {}).then(
          () => {
            setEditing(null);
            void load();
          },
          (err: Error) => toast(err.message, 'error'),
        );
      },
    };
  };

  if (editing) return <AutomationForm initial={editing} onSave={save} onCancel={() => setEditing(null)} onDelete={editing.id ? () => remove(editing as AutomationInfo) : undefined} />;

  return (
    <>
      <section class="setting">
        <p class="dim small">
          Prompts que el servidor central lanza solo, a su hora (la de Madrid): «sube las dependencias cada noche», «repasa los tests inestables los lunes». Cada
          ejecución abre una ventana nueva en el espacio de la carpeta, si quieres en un worktree nuevo, y te avisa como cualquier otro Claude. Si la anterior sigue
          trabajando o esperándote, esa vez se salta.
        </p>
        <div class="row-btns">
          <button class="btn btn-primary" onClick={() => setEditing({})}>
            Nueva automatización
          </button>
        </div>
      </section>
      {!list ? (
        <p class="dim pad">Cargando…</p>
      ) : (
        list.map((a) => {
          const last = a.runs[0];
          const win = last?.window ? findWindow(a.host, last.window) : null;
          const hostName = hosts.value.find((h) => h.id === a.host)?.name ?? a.host;
          return (
            <section class="setting automation" key={a.id}>
              <div class="setting-row">
                <div class="setting-text">
                  <h3>{a.name}</h3>
                  <p class="dim small">
                    {describeSchedule(a.schedule)} · {hostName} › {a.target.sub ?? a.target.folder}
                    {a.worktree ? ` · worktree${a.base ? ` desde ${a.base}` : ''}` : ''}
                  </p>
                  <p class="small">{a.enabled ? (a.nextRun ? `Próxima: ${when(a.nextRun)}` : 'No volverá a ejecutarse') : 'Pausada'}</p>
                  {last && (
                    <p class={`small auto-run auto-${last.status}`}>
                      {RUN_LABEL[last.status]} {when(last.at)}
                      {last.manual ? ' (a mano)' : ''}
                      {last.message ? `: ${last.message}` : ''}
                    </p>
                  )}
                </div>
                <button class={`switch ${a.enabled ? 'on' : ''}`} role="switch" aria-checked={a.enabled} aria-label={`${a.name} activa`} onClick={() => void toggle(a)} />
              </div>
              <div class="row-btns">
                {win && last?.window && (
                  <button
                    class="btn"
                    onClick={() => {
                      sheet.value = null;
                      openWindow(a.host, last.window!);
                    }}
                  >
                    Abrir la última
                  </button>
                )}
                <button class="btn" onClick={() => setEditing(a)}>
                  Editar
                </button>
                <button class="btn" disabled={busy === a.id} onClick={() => void runNow(a)}>
                  {busy === a.id ? 'Lanzando…' : 'Ejecutar ahora'}
                </button>
              </div>
            </section>
          );
        })
      )}
      {list && !list.length && <p class="dim pad">Todavía no hay ninguna.</p>}
    </>
  );
}

type Mode = Schedule['kind'];

function AutomationForm(props: { initial: Partial<Automation>; onSave: (a: Partial<Automation>) => Promise<void>; onCancel: () => void; onDelete?: () => void }) {
  const init = props.initial;
  const f = useLaunchFields(init);
  const s = init.schedule;
  const [mode, setMode] = useState<Mode>(s?.kind ?? 'days');
  const [days, setDays] = useState<number[]>(s?.kind === 'days' ? s.days : [1, 2, 3, 4, 5]);
  const [time, setTime] = useState(s?.kind === 'days' ? s.time : '18:00');
  const [hours, setHours] = useState(s?.kind === 'every' ? s.hours : 6);
  const [minute, setMinute] = useState(s?.kind === 'every' ? s.minute : 0);
  const [expr, setExpr] = useState(s?.kind === 'cron' ? s.expr : '0 18 * * 1-5');
  const [busy, setBusy] = useState(false);
  const schedule: Schedule = mode === 'days' ? { kind: 'days', days, time } : mode === 'every' ? { kind: 'every', hours, minute } : { kind: 'cron', expr };
  const problem = scheduleProblem(schedule);
  const upcoming = useMemo(() => {
    if (problem) return [];
    const out: Date[] = [];
    let from = new Date();
    for (let i = 0; i < 3; i++) {
      const n = nextRun(schedule, from);
      if (!n) break;
      out.push(n);
      from = n;
    }
    return out;
  }, [JSON.stringify(schedule)]);
  const ready = !!f.value && !problem;

  const submit = async () => {
    if (!f.value || problem || busy) return;
    setBusy(true);
    try {
      await props.onSave({ ...init, ...f.value, schedule, enabled: init.enabled ?? true });
    } catch (err) {
      toast((err as Error).message, 'error');
      setBusy(false);
    }
  };

  return (
    <section class="setting">
      <h3>{init.id ? 'Editar automatización' : 'Nueva automatización'}</h3>
      <form
        class="folder-picker"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <LaunchTargetFields f={f} namePlaceholder="p. ej. Dependencias nocturnas" />

        <div class="folder-name">
          <span class="dim small">Cuándo</span>
          <div class="seg" role="radiogroup" aria-label="Tipo de horario">
            {(
              [
                ['days', 'Días y hora'],
                ['every', 'Cada N horas'],
                ['cron', 'Cron'],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={mode === k} class={mode === k ? 'on' : ''} onClick={() => setMode(k)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {mode === 'days' && (
          <div class="auto-days">
            <DayPicker days={days} label="Días" onChange={setDays} />
            <input class="text-input auto-time" type="time" value={time} aria-label="Hora" onInput={(e) => setTime(e.currentTarget.value)} />
          </div>
        )}
        {mode === 'every' && (
          <div class="auto-days">
            <span>Cada</span>
            <select class="text-input auto-small" value={hours} aria-label="Horas" onChange={(e) => setHours(Number(e.currentTarget.value))}>
              {EVERY_HOURS.map((h) => (
                <option key={h} value={h}>
                  {h} h
                </option>
              ))}
            </select>
            <span>a y</span>
            <input class="text-input auto-small" type="number" min={0} max={59} value={minute} aria-label="Minuto" onInput={(e) => setMinute(Number(e.currentTarget.value))} />
          </div>
        )}
        {mode === 'cron' && (
          <label class="folder-name">
            <input class="text-input mono" value={expr} spellcheck={false} autocapitalize="off" onInput={(e) => setExpr(e.currentTarget.value)} />
            <span class="dim small">minuto · hora · día del mes · mes · día de la semana (0 o 7 es domingo)</span>
          </label>
        )}
        <p class="small">{problem ? <span class="settings-state">{problem}</span> : upcoming.length ? `Próximas: ${upcoming.map((d) => when(d.getTime())).join(' · ')}` : 'Ese cron no se cumple nunca.'}</p>

        <LaunchOptionFields f={f} worktreeLabel={`Cada ejecución en un worktree nuevo${f.name.trim() ? ` (${runWorktreeName(f.name.trim(), new Date())})` : ''}`} />
        <div class="row-btns">
          {props.onDelete && (
            <button type="button" class="btn" onClick={props.onDelete}>
              Borrar
            </button>
          )}
          <button type="button" class="btn" onClick={props.onCancel}>
            Cancelar
          </button>
          <button type="submit" class="btn btn-primary" disabled={!ready || busy}>
            Guardar
          </button>
        </div>
      </form>
    </section>
  );
}
