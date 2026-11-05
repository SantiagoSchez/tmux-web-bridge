import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { childPath, folderNameProblem, homePath } from '../../../shared/folders';
import type { ProjectList } from '../../../shared/types';
import { newSession, openSessionWhenReady } from '../menus';
import { prefs, setPref } from '../prefs';
import { dialog, dismissToast, openFolderSettings, toast, toasts, type Dialog } from '../state';
import { IconClose } from './icons';
import { hub } from '../ws';

/** Bottom sheet on the phone, centred card on wide screens. Escape or a tap outside closes it. */
export function Sheet(props: {
  title: string;
  subtitle?: string;
  /** A way back above the title (a section of the settings on the phone). */
  back?: { label: string; onClick: () => void };
  class?: string;
  onClose: () => void;
  children: ComponentChildren;
}) {
  const { title, subtitle, back, onClose, children } = props;
  const backdrop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Only the one on top (the last one) closes: a dialog over the settings leaves them open.
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && [...document.querySelectorAll('.sheet-backdrop')].pop() === backdrop.current && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div class="sheet-backdrop" ref={backdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class={`sheet ${props.class ?? ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div class="sheet-grip" />
        <div class="sheet-head">
          {back && (
            <button class="sheet-back" onClick={back.onClick}>
              ‹ {back.label}
            </button>
          )}
          <h2>{title}</h2>
          {subtitle && <p class="dim small">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function Dialogs() {
  const d = dialog.value;
  if (!d) return null;
  const close = () => (dialog.value = null);
  if (d.kind === 'menu') {
    return (
      <Sheet title={d.title} subtitle={d.subtitle} onClose={close}>
        {d.top}
        <ul class="menu">
          {d.items.map((it) => (
            <li key={it.label}>
              <button
                class={`menu-item ${it.danger ? 'danger' : ''}`}
                disabled={it.disabled}
                onClick={() => {
                  close();
                  it.run();
                }}
              >
                <span class="menu-icon">{it.icon}</span>
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    );
  }
  if (d.kind === 'confirm') return <ConfirmDialog d={d} close={close} />;
  if (d.kind === 'project') return <ProjectDialog d={d} close={close} />;
  return <PromptDialog d={d} close={close} />;
}

/** Copies the commands that resume the Claude about to close (the click is the gesture the clipboard needs). */
function copyResume(commands: string[], closing: boolean): void {
  const many = commands.length > 1;
  navigator.clipboard.writeText(commands.join('\n')).then(
    () => toast(closing ? (many ? 'Comandos para reanudar copiados' : 'Comando para reanudar copiado') : 'Copiado'),
    () => toast('El navegador no ha dejado copiar al portapapeles', 'error'),
  );
}

/** How the Claude a dialog starts runs: auto mode, or skipping the permissions. Remembered. */
function SkipPermissions() {
  return (
    <label class="kb-check skip-permissions" title="Sin marcar, Claude arranca en auto mode">
      <input type="checkbox" checked={prefs.value.skipPermissions} onChange={(e) => setPref('skipPermissions', e.currentTarget.checked)} />
      Saltarse los permisos
    </label>
  );
}

function ConfirmDialog({ d, close }: { d: Extract<Dialog, { kind: 'confirm' }>; close: () => void }) {
  return (
    <Sheet title={d.title} onClose={close}>
      <p class="sheet-text">{d.message}</p>
      {d.resume && d.resume.length > 0 && (
        <ul class="resume-list">
          {d.resume.map((r) => (
            <li key={r.command}>
              <div class="resume-label">{r.label}</div>
              <div class="resume-row">
                <code class="resume-cmd">{r.command}</code>
                <button class="btn resume-copy" aria-label="Copiar el comando" title="Copiar" onClick={() => copyResume([r.command], false)}>
                  Copiar
                </button>
              </div>
              {!r.session && <div class="dim small">Sin id de sesión guardado: se reanuda la última conversación de esa carpeta.</div>}
            </li>
          ))}
        </ul>
      )}
      <div class="sheet-actions">
        {d.permissions && <SkipPermissions />}
        <button class="btn" onClick={close}>
          Cancelar
        </button>
        <button
          class={`btn ${d.danger ? 'btn-danger' : 'btn-primary'}`}
          onClick={() => {
            close();
            if (d.resume?.length) copyResume(d.resume.map((r) => r.command), true);
            d.onSubmit();
          }}
        >
          {d.confirm}
        </button>
      </div>
    </Sheet>
  );
}

function PromptDialog({ d, close }: { d: Extract<Dialog, { kind: 'prompt' }>; close: () => void }) {
  const [value, setValue] = useState(d.value);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (d.noFocus) return;
    input.current?.focus();
    input.current?.select();
  }, []);
  return (
    <Sheet title={d.title} subtitle={d.label} onClose={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          close();
          d.onSubmit(value.trim());
        }}
      >
        <input
          ref={input}
          class="text-input"
          value={value}
          placeholder={d.placeholder}
          autocapitalize="off"
          autocomplete="off"
          spellcheck={false}
          onInput={(e) => setValue(e.currentTarget.value)}
        />
        <div class="sheet-actions">
          <button type="button" class="btn" onClick={close}>
            Cancelar
          </button>
          <button type="submit" class="btn btn-primary">
            {d.confirm}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/** One row of «Nuevo space»: an added folder, or one inside an added folder with subfolders. */
interface FolderItem {
  key: string;
  name: string;
  hint: string;
  folder: string;
  sub?: string;
  missing?: boolean;
}

/**
 * "Nuevo space" on a host with folders, like the `c` shell function: pick a folder
 * (or type a new name to create it inside one with subfolders) and the space opens
 * there with the host's command (claude) running. An open space of that name is reused.
 */
function ProjectDialog({ d, close }: { d: Extract<Dialog, { kind: 'project' }>; close: () => void }) {
  const [list, setList] = useState<ProjectList | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    // No focus on the search: on a phone the keyboard would cover the list, which is what
    // you pick from most of the time.
    hub.action<ProjectList>(d.host.id, { op: 'listProjects' }).then(setList, close);
  }, []);

  const q = query.trim();
  const all = useMemo(() => {
    const out: FolderItem[] = [];
    // Under each one, where it is on the machine: its whole path, with ~ for the home folder.
    const abs = (path: string) => homePath(path, list?.home ?? '');
    for (const f of list?.folders ?? []) {
      const gone = f.missing ? ' · no está' : '';
      if (f.subfolders && !f.missing) {
        for (const c of f.children) out.push({ key: `${f.path}\t${c}`, name: c, hint: abs(childPath(f.path, c)), folder: f.path, sub: c });
      } else {
        const hint = f.subfolders ? `${abs(f.path)} (subcarpetas)${gone}` : `${abs(f.path)}${gone}`;
        out.push({ key: `${f.path}\t${f.subfolders ? '*' : ''}`, name: f.name, hint, folder: f.path, missing: f.missing });
      }
    }
    return out;
  }, [list]);
  const items = useMemo(() => {
    const lq = q.toLowerCase();
    return lq ? all.filter((i) => i.name.toLowerCase().includes(lq)) : all;
  }, [all, q]);
  const usable = items.filter((i) => !i.missing);
  const exact = usable.filter((i) => i.name === q);
  // New projects go inside a folder with subfolders that does not have one of that name.
  const parents = (list?.folders ?? []).filter((f) => f.subfolders && !f.missing);
  const targets = q && !folderNameProblem(q) ? parents.filter((f) => !f.children.includes(q)) : [];

  const open = async (i: { folder: string; sub?: string }, create = false) => {
    setBusy(true);
    try {
      const res = await hub.action<{ session: string }>(d.host.id, {
        op: 'openProject',
        folder: i.folder,
        sub: i.sub,
        create,
        skipPermissions: prefs.value.skipPermissions,
      });
      close();
      openSessionWhenReady(d.host.id, res.session);
    } catch {
      setBusy(false); // the error is already a toast
    }
  };

  return (
    <Sheet title="Nuevo space" subtitle={d.host.name} onClose={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (busy || !q) return;
          if (exact.length) void open(exact[0]);
          else if (usable.length === 1) void open(usable[0]);
          else if (targets.length === 1) void open({ folder: targets[0].path, sub: q }, true);
        }}
      >
        <input
          class="text-input"
          value={query}
          placeholder={parents.length ? 'Buscar o crear un proyecto' : 'Buscar una carpeta'}
          autocapitalize="off"
          autocomplete="off"
          spellcheck={false}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
      </form>
      <ul class="menu project-list">
        {targets.map((f) => (
          <li key={`new\t${f.path}`}>
            <button class="menu-item" disabled={busy} onClick={() => void open({ folder: f.path, sub: q }, true)}>
              <span class="menu-icon">＋</span>
              <span class="project-text">
                <span class="project-name">Crear «{q}»</span>
                <span class="project-hint">en {homePath(f.path, list?.home ?? '')}</span>
              </span>
            </button>
          </li>
        ))}
        {!list && <li class="dim pad">Cargando…</li>}
        {items.map((i) => (
          <li key={i.key}>
            <button class={`menu-item ${i.missing ? 'missing' : ''}`} disabled={busy || i.missing} onClick={() => void open(i)}>
              <span class="menu-icon">▸</span>
              <span class="project-text">
                <span class="project-name">{i.name}</span>
                {i.hint && <span class="project-hint">{i.hint}</span>}
              </span>
            </button>
          </li>
        ))}
        {list && !items.length && !targets.length && <li class="dim pad">{q ? 'Ninguna carpeta con ese nombre.' : 'No hay carpetas.'}</li>}
      </ul>
      <div class="sheet-actions">
        <SkipPermissions />
        <button
          class="btn"
          title="Añadir o quitar carpetas de esta máquina"
          onClick={() => {
            close();
            openFolderSettings(d.host.id);
          }}
        >
          Carpetas…
        </button>
        <button
          class="btn"
          onClick={() => {
            close();
            newSession(d.host, true);
          }}
        >
          Space vacío
        </button>
      </div>
    </Sheet>
  );
}

export function Toasts() {
  const list = toasts.value;
  if (!list.length) return null;
  return (
    <div class="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} class={`toast toast-${t.kind}`}>
          <span class="toast-text">{t.text}</span>
          <button class="toast-close" aria-label="Cerrar aviso" onClick={() => dismissToast(t.id)}>
            <IconClose />
          </button>
        </div>
      ))}
    </div>
  );
}
