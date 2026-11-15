import { useEffect, useState } from 'preact/hooks';
import type { BranchList, ExtLaunchTarget } from '../../../shared/types';
import { pickBase } from '../../../shared/worktree';
import { hub } from '../ws';

// The base branch of a new worktree: the branches of origin of the target's repository,
// read on its machine after a fetch («Nuevo worktree», the Trello drawer, automations).

/**
 * A select with the target's branches. `value` is undefined while there is nothing to launch
 * with (loading, a folder outside git); once loaded it is the remembered branch while origin
 * has it, else the project's base; '' when the list is empty or could not be read, and the
 * task launches without a base. With `projectOption`, the first option, '', is «the
 * project's base at each run» (automations), a remembered branch origin no longer has is
 * still offered, marked, so editing does not drop it unseen, and a list that could not be
 * read leaves `value` undefined (the saved base is kept).
 */
export function BaseBranchSelect(props: {
  hostId: string;
  target: ExtLaunchTarget | undefined;
  remembered?: string;
  value: string | undefined;
  onChange: (base: string | undefined) => void;
  projectOption?: boolean;
}) {
  const { hostId, target, remembered, value, onChange, projectOption } = props;
  // Keyed by the target's content: callers may build a new object each render.
  const key = hostId && target ? `${hostId}\n${JSON.stringify(target)}` : '';
  const [reads, setReads] = useState(0);
  const [state, setState] = useState<{ key: string; list?: BranchList; error?: string }>({ key: '' });

  useEffect(() => {
    onChange(undefined);
    setState({ key });
    if (!key || !target) return;
    let live = true;
    // The note below the field says what failed: no toast of its own.
    hub.action<BranchList>(hostId, { op: 'listBranches', target }, { quiet: true }).then(
      (list) => {
        if (!live) return;
        setState({ key, list });
        if (!projectOption) onChange(list.repo ? (pickBase(remembered, list) ?? '') : undefined);
        else onChange(list.repo && remembered ? remembered : list.repo ? '' : undefined);
      },
      (err: Error) => {
        if (!live) return;
        setState({ key, error: err.message });
        if (!projectOption) onChange('');
      },
    );
    return () => {
      live = false;
    };
  }, [key, reads]);

  const again = (
    <button type="button" class="btn" onClick={() => setReads((n) => n + 1)}>
      Volver a leer
    </button>
  );
  const withoutBase = projectOption ? '' : ' Puedes lanzar igualmente, sin rama base.';
  const current = state.key === key ? state : undefined;
  const list = current?.list;
  let body;
  if (!key) body = <p class="dim small">Elige primero dónde se lanza.</p>;
  else if (current?.error)
    body = (
      <>
        <p class="settings-state small">
          No se han podido leer las ramas: {current.error.replace(/\.$/, '')}.{withoutBase}
        </p>
        <div class="row-btns">{again}</div>
      </>
    );
  else if (!list)
    body = (
      <select class="text-input" aria-label="Rama base" disabled>
        <option>Cargando ramas…</option>
      </select>
    );
  else if (!list.repo) body = <p class="settings-state small">La carpeta no es un repositorio git: no se puede lanzar en un worktree.</p>;
  else if (!list.branches.length && !projectOption)
    body = (
      <>
        <p class="settings-state small">
          {list.fetchError ? `No hay ramas de origin: ${list.fetchError.replace(/\.$/, '')}.` : 'origin no tiene ramas de las que partir.'}
          {withoutBase}
        </p>
        <div class="row-btns">{again}</div>
      </>
    );
  else {
    const gone = projectOption && remembered && !list.branches.includes(remembered) ? remembered : undefined;
    body = (
      <select class="text-input mono" aria-label="Rama base" value={value ?? ''} onChange={(e) => onChange(e.currentTarget.value)}>
        {projectOption && <option value="">Base del proyecto{list.base ? ` (${list.base})` : ''}</option>}
        {gone && <option value={gone}>{gone} (ya no está en origin)</option>}
        {list.branches.map((b) => (
          <option key={b} value={b}>
            {b}
            {b === list.base && !projectOption ? ' · base del proyecto' : ''}
          </option>
        ))}
      </select>
    );
  }
  return (
    <div class="folder-name">
      <span class="dim small">Rama base (de origin)</span>
      {body}
      {list?.repo && list.fetchError && (list.branches.length > 0 || projectOption) && <span class="dim small">No se han podido actualizar las ramas: {list.fetchError}</span>}
    </div>
  );
}
