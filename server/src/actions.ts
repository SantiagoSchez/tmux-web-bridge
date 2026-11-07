import { childPath, DEFAULT_COMMAND, folderNameProblem, folderPathOk, sameFolder } from '../../shared/folders.js';
import type { ActionOp, DirListing, ProjectList, SavedFolder } from '../../shared/types.js';
import { TmuxError } from './exec.js';
import type { HostMonitor } from './host.js';
import { updateKit } from './kit.js';

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
 * A host's folders for «Nuevo space» as they are now: whether each one is there and,
 * for those with subfolders, the folders inside (not hidden ones), read every time.
 */
async function listProjects(host: HostMonitor, saved: SavedFolder[]): Promise<ProjectList> {
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

/** The folders a host offers in «Nuevo space» and what is typed into a space opened there. */
export interface MachineFolders {
  folders: SavedFolder[];
  command: string;
}

/**
 * Opens a space like `c <name>`: named after the folder, in it, running the host's
 * command (claude). The folder is an added one, or one inside an added folder with
 * subfolders (created first if asked). If a space of that name is open, it is reused.
 */
async function openProject(host: HostMonitor, machine: MachineFolders, action: Extract<ActionOp, { op: 'openProject' }>): Promise<{ session: string; created: boolean }> {
  const sub = action.sub === undefined ? undefined : projectName(String(action.sub));
  const folder = machine.folders.find((f) => sameFolder(f, String(action.folder), sub !== undefined));
  if (!folder) throw new Error(`Esa carpeta no está entre las de ${host.name}`);
  const name = sub ?? folder.name;
  const dir = sub ? childPath(folder.path, sub) : folder.path;
  const space = sessionName(name);
  const existing = await host.exec.runFormat(['list-sessions', '-F', '#{session_id}\t#{session_name}']).catch(() => '');
  const open = existing.split('\n').find((l) => l.split('\t')[1] === space);
  if (open) return { session: open.split('\t')[0], created: false };

  // Only inside a folder that is there: a disk not mounted gets no folders made under it.
  const state = (await host.exec.shell(`if [ -d ${hostPath(dir)} ]; then echo ok; elif [ -d ${hostPath(folder.path)} ]; then echo new; else echo gone; fi`)).trim();
  if (state === 'gone') throw new Error(`La carpeta ${folder.path} no está en ${host.name}`);
  if (state === 'new') {
    if (!sub || !action.create) throw new Error(`No existe la carpeta ${dir}`);
    await host.exec.shell(`mkdir ${hostPath(dir)}`);
  }
  // The space starts in a shell (with its .zshrc) and the command is typed into it,
  // as `c` does: quitting claude leaves you in the project's folder.
  const abs = (await host.exec.shell(`cd ${hostPath(dir)} && pwd`)).trim();
  const out = await host.exec.run(['new-session', '-d', '-E', '-P', '-F', '#{session_id} #{pane_id}', '-s', space, '-c', abs]);
  const [session, pane] = out.trim().split(' ');
  if (machine.command) await host.exec.run(['send-keys', '-t', pane, projectCommand(machine.command, action.skipPermissions === true), 'Enter']);
  return { session, created: true };
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
export const READ_ONLY_OPS: ReadonlySet<ActionOp['op']> = new Set(['listProjects', 'listDirs']);

/**
 * Runs one tree action on a host. Returns data for the client, if any. `latestRelease`
 * is the version updateKit moves the kit to (the hub's last check, never the client's);
 * `machine`, the host's folders for «Nuevo space».
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
      const session = check(action.session, SESSION_ID, 'sesión');
      const name = action.name?.trim();
      const args = ['new-window', '-P', '-F', '#{window_id} #{pane_id}', '-t', `${session}:`, '-c', '#{pane_current_path}'];
      if (name) args.push('-n', name);
      const [window, pane] = (await run(args)).trim().split(' ');
      if (name) await run(['set-option', '-w', '-t', window, '@name_pinned', '1']);
      return { window, pane };
    }
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
    case 'pageUp': {
      // Already in copy mode: a page up there. A full-screen program scrolls itself (Page
      // Up); a plain shell goes into copy mode a page up (copy-mode -u).
      const pane = check(action.pane, PANE_ID, 'panel');
      const [inMode, alt] = (await run(['display-message', '-p', '-t', pane, '#{pane_in_mode} #{alternate_on}'])).trim().split(' ');
      if (inMode === '1') await run(['send-keys', '-X', '-t', pane, 'page-up']);
      else if (alt === '1') await run(['send-keys', '-t', pane, 'PPage']);
      else await run(['copy-mode', '-u', '-t', pane]);
      return;
    }
    case 'reboot':
      await reboot(host);
      return;
    case 'updateKit':
      return updateKit(host, latestRelease);
    default:
      throw new Error(`Operación desconocida: ${(action as { op: string }).op}`);
  }
}
