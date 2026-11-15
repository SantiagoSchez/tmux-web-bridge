import { useEffect, useState } from 'preact/hooks';
import type { BranchList, ExtLaunchTarget } from '../../../shared/types';
import { pickBase } from '../../../shared/worktree';
import { hub } from '../ws';

// The base branch of a new worktree: the branches of origin of the target's repository,
// read on its machine after a fetch («Nuevo worktree», the Trello drawer, automations).

/**
 * A select with the target's branches. `value` is undefined while there is nothing to launch
 * with (loading, no repository, no branches); once loaded it is the remembered branch while
 * origin has it, else the project's base. With `projectOption`, the first option, '', is
 * «the project's base at each run» (automations), and a remembered branch origin no longer
 * has is still offered, marked, so editing does not drop it unseen.
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
  const key =hostId && target ? `${hostId}\n${JSON.stringify(target)}` : '';
  const [state, setState] = useState<{ key: string; list?: BranchList; error?: string }>({ key: '' });

  useEffect(() => {
    onChange(undefined);
    setState({ key });
    if (!key || !target) return;
    let live = true;
    hub.action<BranchList>(hostId, { op: 'listBranches', target }).then(
      (list) => {
        if (!live) return;
        setState({ key, list });
        if (!projectOption) onChange(pickBase(remembered, list));
        else onChange(list.repo && remembered ? remembered : list.repo ? '' : undefined);
      },
      (err: Error) => live && setState({ key, error: err.message }),
    );
    return () => {
      live = false;
    };
  }, [key]);

  const list = state.key === key ? state.list : undefined;
  let body;
  if (!key) body = <p class="dim small">Elige primero dónde se lanza.</p>;
  else if (state.error) body = <p class="settings-state small">No se han podido leer las ramas: {state.error}</p>;
  else if (!list)
    body = (
      <select class="text-input" disabled>
        <option>Cargando ramas…</option>
      </select>
    );
  else if (!list.repo) body = <p class="settings-state small">La carpeta no es un repositorio git: no se puede lanzar en un worktree.</p>;
  else if (!list.branches.length && !projectOption) body = <p class="settings-state small">origin no tiene ramas de las que partir.</p>;
  else {
    const gone = projectOption && remembered && !list.branches.includes(remembered) ? remembered : undefined;
    body = (
      <select class="text-input mono" value={value ?? ''} onChange={(e) => onChange(e.currentTarget.value)}>
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
    <label class="folder-name">
      <span class="dim small">Rama base (de origin)</span>
      {body}
      {list?.repo && list.fetchError && <span class="dim small">No se han podido actualizar las ramas: {list.fetchError}</span>}
    </label>
  );
}
