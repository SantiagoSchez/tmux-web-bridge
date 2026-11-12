import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { folderNameProblem, homePath } from '../../../shared/folders';
import type { ActionOp, ExtLaunchResult, ProjectList } from '../../../shared/types';
import { worktreeNameProblem } from '../../../shared/worktree';
import { newSession, newWindow, openNewWindow, openSessionWhenReady, openWindowWhenReady } from '../menus';
import { isDesktop, prefs, setPref } from '../prefs';
import { accountsInfo, dialog, dismissToast, hosts, hubSettings, openFolderSettings, toast, toasts, type Dialog } from '../state';
import { DirBrowser, nameProblem, SubfoldersCheck, useDirBrowser } from './Folders';
import { IconClose } from './icons';
import { hub } from '../ws';

/** How far down (px), or how fast (px/ms), a sheet has to be dragged for it to close. */
const DISMISS_AT = 120;
const DISMISS_SPEED = 0.5;

/** The sheets' backdrop colour, as faded as a sheet is dragged down (1 up, 0 gone). */
const dim = (k: number) => `color-mix(in srgb, var(--backdrop-soft) ${Math.round(k * 100)}%, transparent)`;

/**
 * Dragging a sheet down by its grip or its title, on the phone: it follows the
 * finger and, let go, closes if dragged far or fast enough, or goes back up.
 * Pointer events captured by the sheet, with touch-action off on the handle, so
 * the browser neither scrolls the sheet nor cancels the drag.
 */
function dragToClose(down: PointerEvent, sheet: HTMLElement, backdrop: HTMLElement, onClose: () => void): void {
  if (isDesktop.value || !down.isPrimary || (down.pointerType === 'mouse' && down.button !== 0)) return;
  const y0 = down.clientY;
  let dragging = false;
  let last = { y: y0, t: down.timeStamp };
  let speed = 0;
  const move = (e: PointerEvent) => {
    const dy = e.clientY - y0;
    if (!dragging) {
      if (dy < 6) return;
      dragging = true;
      sheet.setPointerCapture(down.pointerId);
      sheet.style.transition = 'none';
      backdrop.style.transition = 'none';
    }
    if (e.timeStamp > last.t) speed = (e.clientY - last.y) / (e.timeStamp - last.t);
    last = { y: e.clientY, t: e.timeStamp };
    const off = Math.max(0, dy);
    sheet.style.transform = `translateY(${off}px)`;
    // Its colour, not its opacity, which would fade the sheet inside it too.
    backdrop.style.backgroundColor = dim(Math.max(0, 1 - off / sheet.offsetHeight));
  };
  const up = (e: PointerEvent) => {
    sheet.removeEventListener('pointermove', move);
    sheet.removeEventListener('pointerup', up);
    sheet.removeEventListener('pointercancel', up);
    if (!dragging) return;
    // Letting go over the back button would also press it.
    const swallow = (ev: Event) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => removeEventListener('click', swallow, { capture: true }));
    const dy = e.clientY - y0;
    const close = e.type === 'pointerup' && (dy > DISMISS_AT || (dy > 20 && speed > DISMISS_SPEED));
    sheet.style.transition = 'transform 0.2s ease-out';
    backdrop.style.transition = 'background-color 0.2s ease-out';
    if (close) {
      sheet.style.transform = 'translateY(100%)';
      backdrop.style.backgroundColor = dim(0);
      setTimeout(onClose, 200);
    } else {
      sheet.style.transform = '';
      backdrop.style.backgroundColor = '';
    }
  };
  sheet.addEventListener('pointermove', move);
  sheet.addEventListener('pointerup', up);
  sheet.addEventListener('pointercancel', up);
}

/**
 * Bottom sheet on the phone, centred card on wide screens. Escape, a tap outside
 * or (on the phone) dragging it down by its top closes it.
 */
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
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Only the one on top (the last one) closes: a dialog over the settings leaves them open.
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && [...document.querySelectorAll('.sheet-backdrop')].pop() === backdrop.current && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div class="sheet-backdrop" ref={backdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class={`sheet ${props.class ?? ''}`} ref={panel} role="dialog" aria-modal="true" aria-label={title}>
        <div class="sheet-top" onPointerDown={(e) => dragToClose(e, panel.current!, backdrop.current!, onClose)}>
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
  if (d.kind === 'claudeLogin') return <ClaudeLoginDialog d={d} close={close} />;
  return <PromptDialog d={d} close={close} />;
}

/**
 * A Claude login made from the panel, as `/login` does it without a browser on the
 * machine: Claude's page opens in another tab and shows a code to paste here. The hub
 * keeps the login; with a machine, it switches it to the account right after.
 */
function ClaudeLoginDialog({ d, close }: { d: Extract<Dialog, { kind: 'claudeLogin' }>; close: () => void }) {
  const [start, setStart] = useState<{ url: string; state: string } | null>(null);
  const [code, setCode] = useState('');
  const [alias, setAlias] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meant = d.account ? accountsInfo.value?.list.find((a) => a.id === d.account) : undefined;
  const hostName = d.host ? (hosts.value.find((h) => h.id === d.host)?.name ?? d.host) : undefined;

  useEffect(() => {
    hub.account<{ url: string; state: string }>({ op: 'loginStart' }).then(setStart, (e: Error) => setError(e.message));
  }, []);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!start || !code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await hub.account<{ alias: string; switched: boolean; other?: boolean }>({
        op: 'loginFinish',
        state: start.state,
        code: code.trim(),
        alias: alias.trim() || undefined,
        host: d.host,
        account: d.account,
      });
      close();
      if (r.other) toast(`Has iniciado sesión con ${r.alias}, no con ${meant?.alias ?? 'la cuenta que tocaba'}: se queda guardada, sin cambiar nada`, 'error');
      else if (r.switched) toast(`${hostName} usa ahora ${r.alias}`);
      else toast(meant ? `Sesión de ${r.alias} guardada` : `Cuenta ${r.alias} añadida`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const title = meant ? `Iniciar sesión con ${meant.alias}` : 'Añadir una cuenta de Claude';
  return (
    <Sheet title={title} subtitle={meant ? meant.email : hostName ? `Para usarla en ${hostName}` : undefined} onClose={close}>
      <form class="claude-login" onSubmit={submit}>
        <ol class="claude-login-steps">
          <li>
            Abre la página de Claude e inicia sesión con {meant ? <b>{meant.email}</b> : 'la cuenta que quieras añadir'}. Si el navegador ya tiene abierta otra cuenta en
            claude.ai, cámbiala antes o usa una ventana privada.
            <div>
              <a class={`btn btn-primary ${start ? '' : 'disabled'}`} href={start?.url} target="_blank" rel="noopener noreferrer" aria-disabled={!start}>
                Abrir el login de Claude
              </a>
            </div>
          </li>
          <li>
            Pega aquí el código que te muestra al terminar:
            <input
              class="text-input"
              value={code}
              placeholder="Código"
              autocapitalize="off"
              autocomplete="off"
              spellcheck={false}
              onInput={(e) => setCode(e.currentTarget.value)}
            />
          </li>
          {!meant && (
            <li>
              Un nombre corto para la barra (opcional):
              <input class="text-input" value={alias} placeholder="max, team…" autocapitalize="off" autocomplete="off" spellcheck={false} onInput={(e) => setAlias(e.currentTarget.value)} />
            </li>
          )}
        </ol>
        {error && <p class="claude-login-error">{error}</p>}
        <div class="sheet-actions">
          <button type="button" class="btn" onClick={close}>
            Cancelar
          </button>
          <button type="submit" class="btn btn-primary" disabled={!start || !code.trim() || busy}>
            {busy ? 'Comprobando…' : hostName ? `Usar en ${hostName}` : 'Guardar'}
          </button>
        </div>
      </form>
    </Sheet>
  );
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
export function SkipPermissions() {
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

/** A folder of «Nuevo space» to open: an added one, or one inside an added folder with subfolders. */
interface FolderItem {
  key: string;
  name: string;
  folder: string;
  sub?: string;
  /** Its whole path, for an added folder; those inside one go under it without. */
  hint?: string;
  missing?: boolean;
}

/**
 * A small heading with folders under it: an added folder with subfolders (its `path`)
 * and the folders inside, or «Sueltas», the added folders without subfolders.
 */
interface FolderGroup {
  key: string;
  name: string;
  path?: string;
  missing?: boolean;
  children: FolderItem[];
}

/** What «Nuevo space» shows: the folders, where a new one goes, or its name. */
type ProjectStep = { kind: 'list' } | { kind: 'where' } | { kind: 'name'; parent: string } | { kind: 'worktree'; item: FolderItem };

/**
 * "Nuevo space" on a host with folders, like the `c` shell function: pick a folder and
 * the space opens there with the host's command (claude) running; an open space of
 * that name is reused. A new folder is made inside one with subfolders (its ＋), or
 * anywhere on the machine, and then it is one more of the host's folders. From «Nueva
 * ventana» (with `d.session`), the same, but in a new window of that space.
 */
function ProjectDialog({ d, close }: { d: Extract<Dialog, { kind: 'project' }>; close: () => void }) {
  const [list, setList] = useState<ProjectList | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<ProjectStep>({ kind: 'list' });
  const [inWorktree, setInWorktree] = useState(false);
  const load = () => hub.action<ProjectList>(d.host.id, { op: 'listProjects' }).then(setList, close);
  // No focus on the search: on a phone the keyboard would cover the list, which is what
  // you pick from most of the time.
  useEffect(() => void load(), []);

  const q = query.trim();
  const abs = (path: string) => homePath(path, list?.home ?? '');
  const rows = useMemo(() => {
    const lq = q.toLowerCase();
    const hit = (name: string) => !lq || name.toLowerCase().includes(lq);
    const out: FolderGroup[] = [];
    const loose: FolderItem[] = [];
    for (const f of list?.folders ?? []) {
      const gone = f.missing ? ' · no está' : '';
      if (f.subfolders) {
        // Found by its own name, it comes with everything inside.
        const all = f.children.map((c) => ({ key: `${f.path}\t${c}`, name: c, folder: f.path, sub: c }));
        const children = hit(f.name) ? all : all.filter((c) => hit(c.name));
        if (!lq || children.length) out.push({ key: `${f.path}\t*`, name: f.name, path: f.path, missing: f.missing, children });
      } else if (hit(f.name)) {
        loose.push({ key: `${f.path}\t`, name: f.name, hint: `${abs(f.path)}${gone}`, folder: f.path, missing: f.missing });
      }
    }
    // After the folders with subfolders: on their own they would read as one of the group above.
    if (loose.length) out.push({ key: '\tsueltas', name: 'Sueltas', children: loose });
    return out;
  }, [list, q]);
  const usable = rows.flatMap((r) => r.children.filter((i) => !i.missing));
  const exact = usable.filter((i) => i.name === q);

  const win = d.session;
  const run = async (op: ActionOp) => {
    setBusy(true);
    try {
      const res = await hub.action<{ session: string } | { window: string; pane: string }>(d.host.id, op);
      close();
      if ('window' in res) openNewWindow(d.host.id, res);
      else openSessionWhenReady(d.host.id, res.session);
    } catch {
      setBusy(false); // the error is already a toast
    }
  };
  const open = (i: FolderItem) =>
    inWorktree
      ? setStep({ kind: 'worktree', item: i })
      : win
        ? run({ op: 'newWindow', session: win.id, folder: i.folder, sub: i.sub, skipPermissions: prefs.value.skipPermissions })
        : run({ op: 'openProject', folder: i.folder, sub: i.sub, skipPermissions: prefs.value.skipPermissions });
  /** A new folder with subfolders opens no space: back to the list, where it is a group now, empty. */
  const addGroup = async (parent: string, name: string) => {
    setBusy(true);
    try {
      await hub.action(d.host.id, { op: 'createFolder', parent, name, subfolders: true });
      setQuery('');
      await load();
      setStep({ kind: 'list' });
    } catch {
      // the error is already a toast
    } finally {
      setBusy(false);
    }
  };

  const make = (parent: string, name: string, subfolders: boolean) =>
    subfolders ? addGroup(parent, name) : run({ op: 'createFolder', parent, name, skipPermissions: prefs.value.skipPermissions, session: win?.id });
  const back = () => setStep({ kind: 'list' });
  if (step.kind === 'worktree') return <WorktreeStep d={d} item={step.item} close={close} back={back} />;
  if (step.kind === 'where') return <NewFolderWhere d={d} value={q} busy={busy} close={close} back={back} create={make} />;
  if (step.kind === 'name') {
    const parent = step.parent;
    return (
      <Sheet title="Nueva carpeta" subtitle={`en ${abs(parent)} · ${d.host.name}`} onClose={close}>
        <NewFolderForm hostId={d.host.id} space={win?.name} parent={parent} value={q} busy={busy} focus back={back} create={(name, sub) => make(parent, name, sub)} />
      </Sheet>
    );
  }

  const item = (i: FolderItem) => (
    <li key={i.key}>
      <button class={`menu-item ${i.missing ? 'missing' : ''}`} disabled={busy || i.missing} onClick={() => void open(i)}>
        <span class="menu-icon">▸</span>
        <span class="project-text">
          <span class="project-name">{i.name}</span>
          {i.hint && <span class="project-hint">{i.hint}</span>}
        </span>
      </button>
    </li>
  );

  return (
    <Sheet title={win ? 'Nueva ventana' : 'Nuevo space'} subtitle={win ? `En ${win.name} · ${d.host.name}` : d.host.name} onClose={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (busy || !q) return;
          if (exact.length) void open(exact[0]);
          else if (usable.length === 1) void open(usable[0]);
        }}
      >
        <input
          class="text-input"
          value={query}
          placeholder="Buscar una carpeta"
          autocapitalize="off"
          autocomplete="off"
          spellcheck={false}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
      </form>
      <ul class="menu project-list">
        <li>
          <button class="menu-item" disabled={busy} onClick={() => setStep({ kind: 'where' })}>
            <span class="menu-icon">＋</span>
            <span class="project-text">
              <span class="project-name">Nueva carpeta…</span>
              <span class="project-hint">En cualquier sitio de {d.host.name}</span>
            </span>
          </button>
        </li>
        {!list && <li class="dim pad">Cargando…</li>}
        {rows.map((r) => {
          const path = r.path;
          return (
            <li key={r.key} class="project-group">
              <div class={`project-parent ${r.missing ? 'missing' : ''}`}>
                <span class="project-parent-text">
                  <span class="project-parent-name">{r.name}</span>
                  {path && <span class="project-parent-path"> {abs(path)}</span>}
                  {r.missing && ' · no está'}
                </span>
                {path && !r.missing && (
                  <button
                    class="icon-btn small-btn"
                    disabled={busy}
                    aria-label={`Nueva carpeta en ${r.name}`}
                    title={`Nueva carpeta en ${abs(path)}`}
                    onClick={() => setStep({ kind: 'name', parent: path })}
                  >
                    ＋
                  </button>
                )}
              </div>
              {r.children.length ? (
                <ul class="menu">{r.children.map(item)}</ul>
              ) : (
                !r.missing && <div class="project-empty dim small">Vacía</div>
              )}
            </li>
          );
        })}
        {list && q && !rows.length && <li class="dim pad">Ninguna carpeta con ese nombre.</li>}
      </ul>
      <div class="sheet-actions">
        <SkipPermissions />
        <label class="kb-check" title="Claude arranca en un git worktree nuevo (claude --worktree), en una ventana con su nombre">
          <input type="checkbox" checked={inWorktree} onChange={(e) => setInWorktree(e.currentTarget.checked)} />
          En un worktree nuevo
        </label>
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
            if (win) newWindow(d.host, win, true, true);
            else newSession(d.host, true);
          }}
        >
          {win ? 'Ventana vacía' : 'Space vacío'}
        </button>
      </div>
    </Sheet>
  );
}

/**
 * «Nuevo space» with «En un worktree nuevo»: the worktree's name and, if wanted, a prompt.
 * Claude starts there with `--worktree`, in a new window named after it, in the folder's
 * space (opened first if it is not), or, from «Nueva ventana», in that space.
 */
function WorktreeStep(props: { d: Extract<Dialog, { kind: 'project' }>; item: FolderItem; close: () => void; back: () => void }) {
  const { d, item, close, back } = props;
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const problem = name.trim() ? worktreeNameProblem(name.trim()) : null;
  const launch = async () => {
    if (busy || !name.trim() || problem) return;
    setBusy(true);
    try {
      const res = await hub.action<ExtLaunchResult>(d.host.id, {
        op: 'launchTask',
        target: d.session ? { session: d.session.id, folder: item.folder, sub: item.sub } : { folder: item.folder, sub: item.sub },
        worktree: name.trim(),
        prompt: prompt.trim(),
        skipPermissions: prefs.value.skipPermissions,
      });
      close();
      openWindowWhenReady(d.host.id, res.session, res.window);
    } catch {
      setBusy(false); // the error is already a toast
    }
  };
  return (
    <Sheet title="Nuevo worktree" subtitle={`${item.name}${d.session ? ` · en ${d.session.name}` : ''} · ${d.host.name}`} onClose={close}>
      <form
        class="folder-picker"
        onSubmit={(e) => {
          e.preventDefault();
          void launch();
        }}
      >
        <label class="folder-name">
          <span class="dim small">Nombre (también el de la rama)</span>
          <input
            class="text-input"
            value={name}
            placeholder="p. ej. 142-arreglar-login"
            autocapitalize="off"
            autocomplete="off"
            spellcheck={false}
            ref={input}
            onInput={(e) => setName(e.currentTarget.value)}
          />
        </label>
        {problem && <p class="settings-state small">{problem}</p>}
        <label class="folder-name">
          <span class="dim small">Prompt (opcional)</span>
          <textarea class="text-input" rows={3} value={prompt} onInput={(e) => setPrompt(e.currentTarget.value)} />
        </label>
        <div class="sheet-actions">
          <SkipPermissions />
          <button type="button" class="btn" onClick={back}>
            Atrás
          </button>
          <button type="submit" class="btn btn-primary" disabled={busy || !name.trim() || !!problem}>
            {busy ? 'Lanzando…' : 'Lanzar'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/**
 * «Nueva carpeta» anywhere, as Ajustes › Carpetas adds one: browsing to where it goes,
 * with its name and whether it offers its subfolders.
 */
function NewFolderWhere(props: {
  d: Extract<Dialog, { kind: 'project' }>;
  value: string;
  busy: boolean;
  close: () => void;
  back: () => void;
  create: (parent: string, name: string, subfolders: boolean) => void;
}) {
  const b = useDirBrowser(props.d.host.id);
  return (
    <Sheet title="Nueva carpeta" subtitle={`¿Dónde? · ${props.d.host.name}`} onClose={props.close}>
      <div class="folder-picker">
        <DirBrowser b={b} />
        <NewFolderForm
          hostId={props.d.host.id}
          space={props.d.session?.name}
          parent={b.at?.path ?? null}
          value={props.value}
          busy={props.busy || b.busy}
          back={props.back}
          create={async (name, subfolders) => {
            // A path typed but not opened yet: opened first, so it goes where it says.
            const l = await b.here();
            if (l) props.create(l.path, name, subfolders);
          }}
        />
      </div>
    </Sheet>
  );
}

/**
 * The name of a new folder inside `parent` and how it goes in: made, and a space opened
 * in it (or, with `space`, a new window of that space). Anywhere but inside a folder with
 * subfolders it becomes one of the host's folders, and may be one with subfolders: then
 * nothing opens.
 */
function NewFolderForm(props: {
  hostId: string;
  /** From «Nueva ventana»: the space the window goes in. */
  space?: string;
  parent: string | null;
  value: string;
  busy: boolean;
  /** Straight to the name (no folders to browse above): the keyboard is wanted. */
  focus?: boolean;
  back: () => void;
  create: (name: string, subfolders: boolean) => void;
}) {
  const [name, setName] = useState(props.value);
  const [subfolders, setSubfolders] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!props.focus) return;
    input.current?.focus();
    input.current?.select();
  }, []);
  const saved = hubSettings.value?.folders[props.hostId] ?? [];
  const inGroup = saved.some((f) => f.subfolders && f.path === props.parent);
  const group = subfolders && !inGroup;
  const n = name.trim();
  const problem = !n ? null : inGroup ? folderNameProblem(n) : nameProblem(saved, n);
  return (
    <form
      class="folder-picker"
      onSubmit={(e) => {
        e.preventDefault();
        if (!props.busy && props.parent && n && !problem) props.create(n, group);
      }}
    >
      {!inGroup && <SubfoldersCheck checked={subfolders} onChange={setSubfolders} />}
      <input
        ref={input}
        class="text-input"
        value={name}
        placeholder="Nombre de la carpeta"
        aria-label="Nombre de la carpeta"
        autocapitalize="off"
        autocomplete="off"
        spellcheck={false}
        onInput={(e) => setName(e.currentTarget.value)}
      />
      {problem && <p class="settings-state small">{problem}</p>}
      <p class="dim small">
        {group
          ? `Queda entre las carpetas de esta máquina, con sus subcarpetas: no se abre ${props.space ? 'ninguna ventana' : 'ningún space'}, crea dentro las que quieras con su ＋.`
          : `${props.space ? `Se abre una ventana de ${props.space} en ella` : 'Se abre un space en ella'}${inGroup ? '.' : ' y queda entre las carpetas de esta máquina.'}`}
      </p>
      <div class="sheet-actions">
        {!group && <SkipPermissions />}
        <button type="button" class="btn" onClick={props.back}>
          Atrás
        </button>
        <button type="submit" class="btn btn-primary" disabled={props.busy || !props.parent || !n || !!problem}>
          {group ? 'Crear' : 'Crear y abrir'}
        </button>
      </div>
    </form>
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
          {t.action && (
            <button
              class="toast-action"
              onClick={() => {
                dismissToast(t.id);
                t.action!.run();
              }}
            >
              {t.action.label}
            </button>
          )}
          <button class="toast-close" aria-label="Cerrar aviso" onClick={() => dismissToast(t.id)}>
            <IconClose />
          </button>
        </div>
      ))}
    </div>
  );
}
