import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ExtHostTargets, ExtTargets } from '../../../shared/types';
import { api } from '../api';
import { toast } from '../state';
import { BaseBranchSelect } from './BaseBranch';

// The fields of a task the hub launches on its own later (an automation, a scheduled
// message): its name, machine, folder and prompt, and its options (new worktree, its base
// branch, skipping permissions). Each form puts its own «when» between the two groups.

/** Where the task opens: an added folder, or `sub`, one inside a folder with subfolders. */
export type LaunchTarget = { folder: string; sub?: string };

/** What a form starts from: a new task, or the one being edited. */
export interface LaunchInit {
  name?: string;
  host?: string;
  target?: LaunchTarget;
  prompt?: string;
  worktree?: boolean;
  base?: string;
  skipPermissions?: boolean;
}

/** The fields as the form saves them. */
export interface LaunchValue {
  name: string;
  host: string;
  target: LaunchTarget;
  prompt: string;
  worktree: boolean;
  base?: string;
  skipPermissions: boolean;
}

/** A folder of a machine where a task can open: an added one, or one inside an added folder with subfolders. */
interface FolderChoice {
  key: string;
  label: string;
  group: string;
  target: LaunchTarget;
}

function folderChoices(h: ExtHostTargets | undefined): FolderChoice[] {
  const out: FolderChoice[] = [];
  for (const f of h?.folders ?? []) {
    if (f.missing) continue;
    if (f.subfolders) for (const c of f.children) out.push({ key: `${f.path}\n${c}`, label: c, group: `${f.name} (carpetas)`, target: { folder: f.path, sub: c } });
    else out.push({ key: `${f.path}\n`, label: f.name, group: 'Carpetas', target: { folder: f.path } });
  }
  return out;
}

const targetKey = (t: LaunchTarget) => `${t.folder}\n${t.sub ?? ''}`;

/** The state of the launch fields, the machines and folders read from /api/targets, and the value to save once they are complete. */
export function useLaunchFields(init: LaunchInit) {
  const [name, setName] = useState(init.name ?? '');
  const [hostId, setHostId] = useState(init.host ?? '');
  const [target, setTarget] = useState(init.target ? targetKey(init.target) : '');
  const [prompt, setPrompt] = useState(init.prompt ?? '');
  const [worktree, setWorktree] = useState(init.worktree ?? false);
  /** '' is the project's base; undefined, the list is not read (the saved one is kept). */
  const [base, setBase] = useState<string | undefined>(undefined);
  const [skip, setSkip] = useState(init.skipPermissions ?? false);
  const [targets, setTargets] = useState<ExtHostTargets[] | null>(null);

  useEffect(() => {
    api<ExtTargets>('/api/targets').then(
      ({ hosts: list }) => {
        setTargets(list);
        if (!hostId) setHostId(list.find((h) => h.status === 'ok')?.id ?? list[0]?.id ?? '');
      },
      (err: Error) => toast(err.message, 'error'),
    );
  }, []);

  const host = targets?.find((h) => h.id === hostId);
  const choices = useMemo(() => folderChoices(host), [host]);
  const chosen = choices.find((c) => c.key === target);
  // A task kept with a folder this machine no longer offers still saves with it.
  const keptTarget = !chosen && init.target && target === targetKey(init.target) && hostId === init.host ? init.target : undefined;
  const finalTarget = chosen?.target ?? keptTarget;
  const value: LaunchValue | null =
    name.trim() && hostId && finalTarget && prompt.trim()
      ? { name: name.trim(), host: hostId, target: finalTarget, prompt: prompt.trim(), worktree, base: worktree ? (base === undefined ? init.base : base || undefined) : undefined, skipPermissions: skip }
      : null;

  return { init, name, setName, hostId, setHostId, target, setTarget, prompt, setPrompt, worktree, setWorktree, base, setBase, skip, setSkip, targets, host, choices, keptTarget, finalTarget, value };
}

export type LaunchFields = ReturnType<typeof useLaunchFields>;

/** Name, machine, folder and prompt. */
export function LaunchTargetFields({ f, namePlaceholder }: { f: LaunchFields; namePlaceholder: string }) {
  const groups = [...new Set(f.choices.map((c) => c.group))];
  return (
    <>
      <label class="folder-name">
        <span class="dim small">Nombre</span>
        <input class="text-input" value={f.name} placeholder={namePlaceholder} onInput={(e) => f.setName(e.currentTarget.value)} />
      </label>
      <label class="folder-name">
        <span class="dim small">Máquina</span>
        <select
          class="text-input"
          value={f.hostId}
          onChange={(e) => {
            f.setHostId(e.currentTarget.value);
            f.setTarget('');
          }}
        >
          {(f.targets ?? []).map((h) => (
            <option key={h.id} value={h.id}>
              {h.status === 'ok' ? h.name : `${h.name} (sin conexión)`}
            </option>
          ))}
        </select>
      </label>
      <label class="folder-name">
        <span class="dim small">Carpeta</span>
        <select class="text-input" value={f.target} onChange={(e) => f.setTarget(e.currentTarget.value)}>
          <option value="" disabled>
            {f.targets ? 'Elige una carpeta…' : 'Cargando…'}
          </option>
          {f.keptTarget && <option value={f.target}>{f.keptTarget.sub ?? f.keptTarget.folder}</option>}
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {f.choices
                .filter((c) => c.group === g)
                .map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      {f.host && f.host.status === 'ok' && !f.choices.length && <p class="settings-state small">Esta máquina no tiene carpetas en Ajustes › Carpetas.</p>}
      <label class="folder-name">
        <span class="dim small">Prompt</span>
        <textarea class="text-input" rows={4} value={f.prompt} onInput={(e) => f.setPrompt(e.currentTarget.value)} />
      </label>
    </>
  );
}

/** New worktree (with its base branch) and skipping permissions; `worktreeLabel` says what the worktree box does. */
export function LaunchOptionFields({ f, worktreeLabel }: { f: LaunchFields; worktreeLabel: ComponentChildren }) {
  return (
    <>
      <label class="kb-check">
        <input type="checkbox" checked={f.worktree} onChange={(e) => f.setWorktree(e.currentTarget.checked)} />
        {worktreeLabel}
      </label>
      {f.worktree && <BaseBranchSelect hostId={f.hostId} target={f.finalTarget} remembered={f.init.base} value={f.base} onChange={f.setBase} projectOption />}
      <label class="kb-check">
        <input type="checkbox" checked={f.skip} onChange={(e) => f.setSkip(e.currentTarget.checked)} />
        Saltarse los permisos
      </label>
    </>
  );
}
