import { childPath, DEFAULT_COMMAND, folderNameProblem, folderPathOk, MAX_FOLDERS, sameFolder } from '../../shared/folders.js';
import type { ActionOp, DirListing, ProjectList, SavedFolder, WorktreeList } from '../../shared/types.js';
import { TmuxError } from './exec.js';
import type { HostMonitor } from './host.js';
import { setTrelloExtension, updateKit } from './kit.js';
import { makeTempDir, TEMP_OPTION, tempSuffix } from './temp.js';

const SESSION_ID = /^\$\d+$/;
const WINDOW_ID = /^@\d+$/;
const PANE_ID = /^%\d+$/;

function check(value: string, re: RegExp, what: string): string {
  if (!re.test(value)) throw new Error(`${what} inválido: ${value}`);
  return value;
}

/** tmux rejects '.' and ':' in session names (they are target separators). */
function sessionName(name: string): string {
  return name.replace(/[.:]/g, '-').trim();
}

// Same contract as `prefix + r` in ~/.tmux.conf: a name typed by hand is pinned
// (@name_pinned) so the Claude hooks never overwrite it; an empty name unpins it.
/** Runs host-kit's tmux-window-title.sh inside the host's tmux server, if installed there. */
export function runTitleScript(host: HostMonitor, ...args: string[]): Promise<string> {
  return host.exec.run([
    'if-shell',
    'test -x "$HOME/.scripts/tmux-window-title.sh"',
    `run-shell -b '"$HOME/.scripts/tmux-window-title.sh" ${args.join(' ')}'`,
  ]);
}

/** A path on the host for the shell: ~/ becomes "$HOME"/, the rest is quoted. */
function hostPath(p: string): string {
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
  if (p === '~') return '"$HOME"';
  return p.startsWith('~/') ? `"$HOME"/${q(p.slice(2))}` : q(p);
}

/** A project name, as `c --new-project` accepts it: no '/' and no leading '.'. */
function projectName(name: string): string {
  if (folderNameProblem(name)) throw new Error(`Nombre de proyecto inválido: ${name}`);
  return name.trim();
}

/**
 * A host's folders for «Nuevo espacio» as they are now: whether each one is there and,
 * for those with subfolders, the folders inside (not hidden ones), read every time.
 */
export async function listProjects(host: HostMonitor, saved: SavedFolder[]): Promise<ProjectList> {
  const script = [`printf 'H\t%s\n' "$HOME"`]
    .concat(saved.map((f, i) => {
      const dir = hostPath(f.path);
      const children = f.subfolders ? `; (cd ${dir} && for d in */; do [ -d "$d" ] && printf 'C\t${i}\t%s\n' "\${d%/}"; done)` : '';
      return `if [ -d ${dir} ]; then echo 'F\t${i}'${children}; fi`;
    }))
    .concat('true')
    .join('; ');
  const lines = (await host.exec.shell(script)).split('\n');
  const home = lines.find((l) => l.startsWith('H\t'))?.slice(2) ?? '';
  const folders = saved.map((f) => ({ ...f, missing: true, children: [] as string[] }));
  for (const line of lines) {
    const [kind, i, name] = line.split('\t');
    const f = folders[Number(i)];
    if (!f) continue;
    if (kind === 'F') f.missing = false;
    else if (kind === 'C' && name) f.children.push(name);
  }
  for (const f of folders) f.children.sort((a, b) => a.localeCompare(b, 'es'));
  return { folders, home };
}

/** Where a path of the host leads, and the folders inside, for the folder picker. */
async function listDirs(host: HostMonitor, path: string): Promise<DirListing> {
  const p = path.trim().replace(/(.)\/+$/, '$1');
  if (!folderPathOk(p)) throw new Error('La ruta tiene que empezar por / o por ~');
  const out = await host.exec.shell(
    `cd ${hostPath(p)} 2>/dev/null || { echo NONE; exit 0; }; pwd; printf '%s\n' "$HOME"; ` +
      `for d in * .*; do [ "$d" != . ] && [ "$d" != .. ] && [ -d "$d" ] && printf 'D\t%s\n' "$d"; done; true`,
  );
  const lines = out.split('\n');
  if (lines[0] === 'NONE') throw new Error(`No existe la carpeta ${p} en ${host.name}`);
  const [abs, home] = lines;
  const tilde = (a: string) => (home && home !== '/' && a === home ? '~' : home && home !== '/' && a.startsWith(`${home}/`) ? `~${a.slice(home.length)}` : a);
  const dirs = lines
    .filter((l) => l.startsWith('D\t'))
    .map((l) => l.slice(2))
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
    .slice(0, 2000);
  return { path: tilde(abs), parent: abs === '/' ? null : tilde(abs.replace(/\/[^/]*$/, '') || '/'), dirs };
}

/**
 * The command of a space opened from a folder, with the permission mode chosen in the panel: auto mode, or
 * skipping the permissions. Only a claude command gets the flag; any other is typed as is.
 */
export function projectCommand(command: string, skipPermissions: boolean): string {
  if (!/^(\S*\/)?claude(\s|$)/.test(command)) return command;
  return `${command} ${skipPermissions ? '--dangerously-skip-permissions' : '--permission-mode auto'}`;
}

/** The folders a host offers in «Nuevo espacio» and what is typed into a space opened there. */
export interface MachineFolders {
  folders: SavedFolder[];
  command: string;
  /** Keeps a new list of the host's folders (a folder made with createFolder goes in). */
  save?: (folders: SavedFolder[]) => void;
  /** Its kit keeps the Trello extension up to date: the folder it is in there. */
  trelloExtension?: string;
  /** Keeps whether it does, once install.sh did it there: its folder, or null. */
  saveTrelloExtension?: (dir: string | null) => void;
}

/**
 * Opens a space like `c <name>`: named after the folder, in it, running the host's
 * command (claude). The folder is an added one, or one inside an added folder with
 * subfolders (created first if asked). If a space of that name is open, it is reused.
 */
async function openProject(host: HostMonitor, machine: MachineFolders, action: Extract<ActionOp, { op: 'openProject' }>): Promise<{ session: string; created: boolean }> {
  const space = await openSpace(host, machine, action);
  if (!space.pane) return { session: space.session, created: false };
  // The space starts in a shell (with its .zshrc) and the command is typed into it,
  // as `c` does: quitting claude leaves you in the project's folder.
  if (machine.command) await host.exec.run(['send-keys', '-t', space.pane, projectCommand(machine.command, action.skipPermissions === true), 'Enter']);
  return { session: space.session, created: true };
}

/** A space of an added folder, as openSpace leaves it. */
export interface OpenedSpace {
  session: string;
  /** Its name (the folder's). */
  name: string;
  /** Its folder on the host, as an absolute path ('' if it is gone). */
  dir: string;
  /** Its first pane, with a bare shell, when the space was made now (missing: it was open already). */
  pane?: string;
}

/** An added folder, or `sub`, one inside an added folder with subfolders: its name and path. */
interface PickedFolder {
  name: string;
  /** As the host's folders give it (under ~ or absolute). */
  dir: string;
  /** The added folder it is (inside). */
  root: string;
  sub?: string;
}

function pickFolder(host: HostMonitor, machine: MachineFolders, action: { folder: string; sub?: string }): PickedFolder {
  const sub = action.sub === undefined ? undefined : projectName(String(action.sub));
  const folder = machine.folders.find((f) => sameFolder(f, String(action.folder), sub !== undefined));
  if (!folder) throw new Error(`Esa carpeta no está entre las de ${host.name}`);
  return { name: sub ?? folder.name, dir: sub ? childPath(folder.path, sub) : folder.path, root: folder.path, sub };
}

/**
 * The folder's absolute path on the host. Only inside a folder that is there (a disk not
 * mounted gets no folders made under it), and made first only with `create`, inside a
 * folder with subfolders.
 */
async function folderOnHost(host: HostMonitor, f: PickedFolder, create: boolean): Promise<string> {
  const state = (await host.exec.shell(`if [ -d ${hostPath(f.dir)} ]; then echo ok; elif [ -d ${hostPath(f.root)} ]; then echo new; else echo gone; fi`)).trim();
  if (state === 'gone') throw new Error(`La carpeta ${f.root} no está en ${host.name}`);
  if (state === 'new') {
    if (!f.sub || !create) throw new Error(`No existe la carpeta ${f.dir}`);
    await host.exec.shell(`mkdir ${hostPath(f.dir)}`);
  }
  return (await host.exec.shell(`cd ${hostPath(f.dir)} && pwd`)).trim();
}

/**
 * The space of an added folder (or of `sub`, a folder inside one with subfolders, made
 * first with `create`): the open one of that name, or a new one there with a bare shell.
 * `windowName` names (and pins) the first window of a new space.
 */
export async function openSpace(
  host: HostMonitor,
  machine: MachineFolders,
  action: { folder: string; sub?: string; create?: boolean },
  windowName?: string,
  /** Where a new space starts, if not in the folder (a worktree of it). */
  cwd?: string,
): Promise<OpenedSpace> {
  const f = pickFolder(host, machine, action);
  const space = sessionName(f.name);
  const existing = await host.exec.runFormat(['list-sessions', '-F', '#{session_id}\t#{session_name}']).catch(() => '');
  const open = existing.split('\n').find((l) => l.split('\t')[1] === space);
  if (open) {
    const abs = windowName === undefined ? '' : (await host.exec.shell(`cd ${hostPath(f.dir)} 2>/dev/null && pwd || true`)).trim();
    return { session: open.split('\t')[0], name: space, dir: abs };
  }

  const abs = await folderOnHost(host, f, action.create === true);
  const args = ['new-session', '-d', '-E', '-P', '-F', '#{session_id} #{pane_id}', '-s', space, '-c', (cwd ?? abs).replace(/#/g, '##')];
  if (windowName) args.push('-n', windowName.replace(/#/g, '##'));
  const [session, pane] = (await host.exec.run(args)).trim().split(' ');
  if (windowName) await host.exec.run(['set-option', '-w', '-t', pane, '@name_pinned', '1']);
  return { session, name: space, dir: abs, pane };
}

/**
 * A new window in an open space, in an added folder (or `sub`, made first with `create`),
 * with a bare shell. `windowName` names (and pins) it; without one, the kit names it.
 */
export async function folderWindow(
  host: HostMonitor,
  machine: MachineFolders,
  action: { session: string; folder: string; sub?: string; create?: boolean },
  windowName?: string,
): Promise<{ window: string; pane: string }> {
  const session = check(String(action.session), SESSION_ID, 'Espacio');
  const abs = await folderOnHost(host, pickFolder(host, machine, action), action.create === true);
  const args = ['new-window', '-P', '-F', '#{window_id} #{pane_id}', '-t', `${session}:`, '-c', abs.replace(/#/g, '##')];
  if (windowName) args.push('-n', windowName.replace(/#/g, '##'));
  const [window, pane] = (await host.exec.run(args)).trim().split(' ');
  if (windowName) await host.exec.run(['set-option', '-w', '-t', window, '@name_pinned', '1']);
  return { window, pane };
}

/**
 * What `git worktree list --porcelain` printed, after the folder's own top and its place
 * in it (show-prefix): the other worktrees, but bare ones and those whose folder is gone.
 */
export function parseWorktrees(out: string): WorktreeList {
  if (!out.startsWith('T\t')) return { repo: false };
  const [head, ...blocks] = out.split(/\n(?=worktree )/);
  const lines = head.split('\n');
  const top = lines[0].slice(2);
  const prefix = (lines.find((l) => l.startsWith('P\t')) ?? 'P\t').slice(2).replace(/\/+$/, '');
  const inside = new Set(lines.filter((l) => l.startsWith('I\t')).map((l) => l.slice(2)));
  const list: WorktreeList = { repo: true, worktrees: [] };
  for (const block of blocks) {
    const fields = new Map(block.split('\n').filter(Boolean).map((l) => [l.split(' ', 1)[0], l.slice(l.indexOf(' ') + 1)] as const));
    const path = fields.get('worktree');
    if (!path || fields.has('bare') || fields.has('prunable')) continue;
    const branch = fields.get('branch')?.replace(/^refs\/heads\//, '');
    if (path === top) {
      list.branch = branch;
      continue;
    }
    const at = prefix && inside.has(path) ? `${path}/${prefix}` : path;
    list.worktrees.push({ name: path.split('/').pop() || path, path: at, branch });
  }
  return list;
}

/** The git worktrees of an added folder's repo, for «Nuevo espacio» (see WorktreeList). */
async function listWorktrees(host: HostMonitor, machine: MachineFolders, action: { folder: string; sub?: string }): Promise<WorktreeList> {
  const f = pickFolder(host, machine, action);
  // I: the worktrees that have the folder's place inside them too (a subfolder of the repo).
  const out = await host.exec.shell(
    `cd ${hostPath(f.dir)} 2>/dev/null || exit 0; top=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0; ` +
      `prefix=$(git rev-parse --show-prefix); printf 'T\t%s\nP\t%s\n' "$top" "$prefix"; ` +
      `git worktree list --porcelain | sed -n 's/^worktree //p' | while IFS= read -r w; do [ -n "$prefix" ] && [ -d "$w/$prefix" ] && printf 'I\t%s\n' "$w"; done; ` +
      `git worktree list --porcelain`,
  );
  return parseWorktrees(out);
}

/**
 * Opens a worktree of a folder's repo (one listWorktrees gives, nothing else) running the
 * host's command: a new window named after it, in the folder's space or in `session`'s.
 */
async function openWorktree(
  host: HostMonitor,
  machine: MachineFolders,
  action: Extract<ActionOp, { op: 'openWorktree' }>,
): Promise<{ session: string; window: string; pane: string }> {
  const list = await listWorktrees(host, machine, action);
  const wt = list.repo ? list.worktrees.find((w) => w.path === action.path) : undefined;
  if (!wt) throw new Error(`Ese worktree ya no está en ${host.name}`);
  const name = wt.name.replace(/#/g, '##');
  let session: string;
  let pane: string | undefined;
  if (action.session !== undefined) session = check(String(action.session), SESSION_ID, 'Espacio');
  else {
    const space = await openSpace(host, machine, action, wt.name, wt.path);
    session = space.session;
    pane = space.pane;
  }
  if (!pane) {
    pane = (await host.exec.run(['new-window', '-P', '-F', '#{pane_id}', '-t', `${session}:`, '-c', wt.path.replace(/#/g, '##'), '-n', name])).trim();
    await host.exec.run(['set-option', '-w', '-t', pane, '@name_pinned', '1']);
  }
  if (machine.command) await host.exec.run(['send-keys', '-t', pane, projectCommand(machine.command, action.skipPermissions === true), 'Enter']);
  const window = (await host.exec.runFormat(['display-message', '-p', '-t', pane, '#{window_id}'])).trim();
  return { session, window, pane };
}

/** «Nueva ventana» in a folder: like openProject, in a new window of an open space. */
async function openFolderWindow(
  host: HostMonitor,
  machine: MachineFolders,
  action: { session: string; folder: string; sub?: string; create?: boolean; skipPermissions?: boolean },
): Promise<{ window: string; pane: string }> {
  const win = await folderWindow(host, machine, action);
  if (machine.command) await host.exec.run(['send-keys', '-t', win.pane, projectCommand(machine.command, action.skipPermissions === true), 'Enter']);
  return win;
}

/**
 * «Nueva carpeta» of «Nuevo espacio»: makes a folder inside `parent` and opens a space in it.
 * Inside a folder with subfolders it is one more of them (opened if it is there already);
 * anywhere else it has to be new, and goes into the host's folders, named like it. One
 * added with subfolders opens nothing: there is nothing inside to open yet.
 */
async function createFolder(
  host: HostMonitor,
  machine: MachineFolders,
  action: Extract<ActionOp, { op: 'createFolder' }>,
): Promise<{ session: string; created: boolean } | { window: string; pane: string } | { folder: string }> {
  const name = projectName(String(action.name));
  const parent = String(action.parent).trim().replace(/(.)\/+$/, '$1');
  if (!folderPathOk(parent)) throw new Error('La ruta tiene que empezar por / o por ~');
  // Opened as a space of its own, or, from «Nueva ventana», in a new window of that space.
  const open = (m: MachineFolders, target: { folder: string; sub?: string; create?: boolean }) =>
    action.session === undefined
      ? openProject(host, m, { op: 'openProject', skipPermissions: action.skipPermissions, ...target })
      : openFolderWindow(host, m, { session: action.session, skipPermissions: action.skipPermissions, ...target });
  if (machine.folders.some((f) => sameFolder(f, parent, true))) return open(machine, { folder: parent, sub: name, create: true });

  const path = childPath(parent, name);
  if (machine.folders.some((f) => f.name === name)) throw new Error(`Ya hay una carpeta llamada «${name}» en ${host.name}`);
  if (machine.folders.length >= MAX_FOLDERS) throw new Error(`${host.name} ya tiene ${MAX_FOLDERS} carpetas`);
  const state = (await host.exec.shell(`if [ -e ${hostPath(path)} ]; then echo there; elif [ -d ${hostPath(parent)} ]; then echo ok; else echo gone; fi`)).trim();
  if (state === 'gone') throw new Error(`No existe la carpeta ${parent} en ${host.name}`);
  if (state === 'there') throw new Error(`Ya existe ${path} en ${host.name}`);
  await host.exec.shell(`mkdir ${hostPath(path)}`);
  const subfolders = action.subfolders === true;
  const folders = [...machine.folders, subfolders ? { name, path, subfolders } : { name, path }];
  machine.save?.(folders);
  return subfolders ? { folder: path } : open({ ...machine, folders }, { folder: path });
}

/**
 * «Carpeta temporal»: a new folder in the machine's temp dir and, running the host's
 * command there, a space named tmp-xxxx or, with `session`, a window of that space
 * (named and pinned so). The window carries its folder in @twb_temp: TempFolders removes it.
 */
async function tempSpace(
  host: HostMonitor,
  machine: MachineFolders,
  action: Extract<ActionOp, { op: 'tempSpace' }>,
): Promise<{ session: string } | { window: string; pane: string }> {
  const session = action.session === undefined ? undefined : check(String(action.session), SESSION_ID, 'Espacio');
  const suffix = tempSuffix();
  const dir = await makeTempDir(host, suffix);
  const name = `tmp-${suffix}`;
  const args = session
    ? ['new-window', '-P', '-F', '#{session_id} #{window_id} #{pane_id}', '-t', `${session}:`, '-c', dir, '-n', name]
    : ['new-session', '-d', '-E', '-P', '-F', '#{session_id} #{window_id} #{pane_id}', '-s', name, '-c', dir];
  const [sid, window, pane] = (await host.exec.run(args)).trim().split(' ');
  await host.exec.run([
    'set-option', '-w', '-t', window, TEMP_OPTION, dir,
    ...(session ? [';', 'set-option', '-w', '-t', window, '@name_pinned', '1'] : []),
  ]);
  if (machine.command) await host.exec.run(['send-keys', '-t', pane, projectCommand(machine.command, action.skipPermissions === true), 'Enter']);
  return session ? { window, pane } : { session: sid };
}

/** Reboots the machine. The SSH connection may drop (or hang) before shutdown answers: that is a success. */
async function reboot(host: HostMonitor): Promise<void> {
  if (host.hostConfig.local) throw new Error('El servidor central no se reinicia desde el panel');
  try {
    await host.exec.shell('sudo -n shutdown -r now');
  } catch (err) {
    if (err instanceof TmuxError && (err.transport || err.code === 'timeout')) return;
    if (err instanceof TmuxError && /password|contraseña/i.test(err.stderr)) {
      throw new Error(`sudo pide contraseña en ${host.name}: permite «shutdown» sin contraseña en sudoers`);
    }
    throw err;
  }
}

/** Actions that only read: the tree needs no refresh after them. */
export const READ_ONLY_OPS: ReadonlySet<ActionOp['op']> = new Set(['listProjects', 'listDirs', 'listWorktrees', 'trelloExtension']);

/**
 * Runs one tree action on a host. Returns data for the client, if any. `latestRelease`
 * is the version updateKit moves the kit to (the hub's last check, never the client's);
 * `machine`, the host's folders for «Nuevo espacio».
 */
export async function runAction(
  host: HostMonitor,
  action: ActionOp,
  latestRelease: string | null = null,
  machine: MachineFolders = { folders: [], command: DEFAULT_COMMAND },
): Promise<unknown> {
  const run = (args: string[]) => host.exec.run(args);
  switch (action.op) {
    case 'newSession': {
      const name = action.name ? sessionName(action.name) : '';
      // -E: do not copy the hub's SSH environment (no agent) into the new space.
      const out = await run(['new-session', '-d', '-E', '-P', '-F', '#{session_id}', ...(name ? ['-s', name] : [])]);
      return { session: out.trim() };
    }
    case 'listProjects':
      return listProjects(host, machine.folders);
    case 'openProject':
      return openProject(host, machine, action);
    case 'createFolder':
      return createFolder(host, machine, action);
    case 'listWorktrees':
      return listWorktrees(host, machine, action);
    case 'openWorktree':
      if (typeof action.path !== 'string') throw new Error('Falta el worktree');
      return openWorktree(host, machine, action);
    case 'listDirs':
      if (typeof action.path !== 'string') throw new Error('Falta la ruta');
      return listDirs(host, action.path);
    case 'renameSession':
      await run(['rename-session', '-t', check(action.session, SESSION_ID, 'sesión'), '--', sessionName(action.name)]);
      return;
    case 'killSession':
      await run(['kill-session', '-t', check(action.session, SESSION_ID, 'sesión')]);
      return;
    case 'newWindow': {
      if (action.folder !== undefined) return openFolderWindow(host, machine, { ...action, folder: action.folder });
      const session = check(action.session, SESSION_ID, 'sesión');
      const name = action.name?.trim();
      const args = ['new-window', '-P', '-F', '#{window_id} #{pane_id}', '-t', `${session}:`, '-c', '#{pane_current_path}'];
      if (name) args.push('-n', name);
      const [window, pane] = (await run(args)).trim().split(' ');
      if (name) await run(['set-option', '-w', '-t', window, '@name_pinned', '1']);
      return { window, pane };
    }
    case 'tempSpace':
      return tempSpace(host, machine, action);
    case 'renameWindow': {
      const win = check(action.window, WINDOW_ID, 'ventana');
      const name = action.name.trim();
      if (name) {
        await run(['rename-window', '-t', win, '--', name, ';', 'set-option', '-w', '-t', win, '@name_pinned', '1']);
      } else {
        await run(['set-option', '-w', '-t', win, '-u', '@name_pinned', ';', 'set-window-option', '-t', win, 'automatic-rename', 'on']);
      }
      await runTitleScript(host, 'refresh', win).catch(() => {});
      return;
    }
    case 'killWindow':
      await run(['kill-window', '-t', check(action.window, WINDOW_ID, 'ventana')]);
      return;
    case 'splitPane': {
      const out = await run(['split-window', action.direction === 'h' ? '-h' : '-v', '-P', '-F', '#{pane_id}', '-t', check(action.pane, PANE_ID, 'panel'), '-c', '#{pane_current_path}']);
      return { pane: out.trim() };
    }
    case 'killPane':
      await run(['kill-pane', '-t', check(action.pane, PANE_ID, 'panel')]);
      return;
    case 'selectPane':
      await run(['select-pane', '-t', check(action.pane, PANE_ID, 'panel')]);
      return;
    case 'reloadWindow': {
      const win = check(action.window, WINDOW_ID, 'ventana');
      const panes = (await host.exec.runFormat(['list-panes', '-t', win, '-F', '#{pane_id}\t#{pane_current_path}'])).trim().split('\n');
      for (const line of panes) {
        const [pane, path] = line.split('\t');
        if (!PANE_ID.test(pane)) continue;
        // With host-kit, the script also resumes Claude (a kit older than 1.8 ignores the
        // permission mode); without it, a fresh shell is all we can do.
        const mode = action.skipPermissions ? 'skip' : 'auto';
        const quoted = `"${(path || '~').replace(/["\\$]/g, '\\$&')}"`;
        await run([
          'if-shell',
          'test -x "$HOME/.scripts/tmux-window-title.sh"',
          `run-shell -b '"$HOME/.scripts/tmux-window-title.sh" reload ${pane} ${mode}'`,
          `respawn-pane -k -t ${pane} -c ${quoted}`,
        ]);
      }
      // Give the new shells a moment before the tree is refreshed.
      await new Promise((r) => setTimeout(r, 800));
      return;
    }
    case 'zoomPane':
      await run(['resize-pane', '-Z', '-t', check(action.pane, PANE_ID, 'panel')]);
      return;
    case 'scrollToEnd': {
      // The wheel put tmux in copy mode, or went to a full-screen program that reads the
      // mouse (tmux's WheelUpPane): undo whichever it was.
      const pane = check(action.pane, PANE_ID, 'panel');
      const [inMode, alt] = (await run(['display-message', '-p', '-t', pane, '#{pane_in_mode} #{alternate_on}'])).trim().split(' ');
      if (inMode === '1') await run(['send-keys', '-X', '-t', pane, 'cancel']);
      else if (alt === '1') await run(['send-keys', '-t', pane, 'C-End']);
      return;
    }
    case 'page': {
      // In copy mode, a page there (down to the end leaves it). A full-screen program
      // scrolls itself (Page Up/Down). A plain shell goes into copy mode a page up
      // (copy-mode -u); a page down from its live end goes nowhere.
      const pane = check(action.pane, PANE_ID, 'panel');
      const up = action.dir === 'up';
      const [inMode, alt] = (await run(['display-message', '-p', '-t', pane, '#{pane_in_mode} #{alternate_on}'])).trim().split(' ');
      if (inMode === '1') await run(['send-keys', '-X', '-t', pane, up ? 'page-up' : 'page-down-and-cancel']);
      else if (alt === '1') await run(['send-keys', '-t', pane, up ? 'PPage' : 'NPage']);
      else if (up) await run(['copy-mode', '-u', '-t', pane]);
      return;
    }
    case 'reboot':
      await reboot(host);
      return;
    case 'updateKit':
      return updateKit(host, latestRelease, !!machine.trelloExtension);
    case 'trelloExtension': {
      const res = await setTrelloExtension(host, action.on === true);
      machine.saveTrelloExtension?.(res.dir);
      return res;
    }
    default:
      throw new Error(`Operación desconocida: ${(action as { op: string }).op}`);
  }
}
