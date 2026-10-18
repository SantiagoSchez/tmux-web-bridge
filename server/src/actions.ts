import type { ActionOp, ProjectList } from '../../shared/types.js';
import { TmuxError } from './exec.js';
import type { HostMonitor } from './host.js';

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
  const n = name.trim();
  if (!n || n.includes('/') || n.startsWith('.') || n.length > 100) throw new Error(`Nombre de proyecto inválido: ${name}`);
  return n;
}

/** The folders of the projects dir and the shortcuts file (name="path"; "!command" ones are skipped). */
async function listProjects(host: HostMonitor): Promise<ProjectList> {
  const p = host.hostConfig.projects!;
  const script = [
    `cd ${hostPath(p.dir)} 2>/dev/null && for d in */; do [ -d "$d" ] && printf 'P\t%s\n' "\${d%/}"; done`,
    p.shortcuts ? `[ -f ${hostPath(p.shortcuts)} ] && sed 's/^/S\t/' ${hostPath(p.shortcuts)}` : '',
    'true',
  ].filter(Boolean).join('; ');
  const out = await host.exec.shell(script);
  const projects: string[] = [];
  const shortcuts: ProjectList['shortcuts'] = [];
  for (const line of out.split('\n')) {
    if (line.startsWith('P\t')) projects.push(line.slice(2));
    const m = /^S\t\s*([^#=\s][^=]*?)\s*=\s*(.+?)\s*$/.exec(line);
    if (m) {
      const path = m[2].replace(/^(["'])(.*)\1$/, '$2');
      if (!path.startsWith('!')) shortcuts.push({ name: m[1], path });
    }
  }
  projects.sort((a, b) => a.localeCompare(b, 'es'));
  // A shortcut whose folder is gone (moved or deleted) is not offered.
  const found = shortcuts.length ? (await host.exec.shell(shortcuts.map((s) => `[ -d ${hostPath(s.path)} ] && echo 1 || echo 0`).join('; '))).split('\n') : [];
  return { dir: p.dir, projects, shortcuts: shortcuts.filter((_, i) => found[i] === '1') };
}

/**
 * Opens a project like `c <name>`: a space named after it, in its folder, running
 * the projects command (claude). If that space is already open, it is reused.
 */
async function openProject(host: HostMonitor, rawName: string, create: boolean): Promise<{ session: string; created: boolean }> {
  const p = host.hostConfig.projects;
  if (!p) throw new Error('Esta máquina no tiene carpeta de proyectos');
  const name = projectName(rawName);
  const space = sessionName(name);
  const existing = await host.exec.runFormat(['list-sessions', '-F', '#{session_id}\t#{session_name}']).catch(() => '');
  const open = existing.split('\n').find((l) => l.split('\t')[1] === space);
  if (open) return { session: open.split('\t')[0], created: false };

  const list = await listProjects(host);
  const shortcut = list.shortcuts.find((s) => s.name === name);
  const dir = shortcut ? shortcut.path : `${p.dir.replace(/\/$/, '')}/${name}`;
  if (!shortcut && !list.projects.includes(name)) {
    if (!create) throw new Error(`No existe el proyecto ${name}`);
    await host.exec.shell(`mkdir -p ${hostPath(dir)}`);
  }
  // The space starts in a shell (with its .zshrc) and the command is typed into it,
  // as `c` does: quitting claude leaves you in the project's folder.
  const abs = (await host.exec.shell(`cd ${hostPath(dir)} && pwd`)).trim();
  const out = await host.exec.run(['new-session', '-d', '-E', '-P', '-F', '#{session_id} #{pane_id}', '-s', space, '-c', abs]);
  const [session, pane] = out.trim().split(' ');
  if (p.command) await host.exec.run(['send-keys', '-t', pane, p.command, 'Enter']);
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

/** Runs one tree action on a host. Returns data for the client, if any. */
export async function runAction(host: HostMonitor, action: ActionOp): Promise<unknown> {
  const run = (args: string[]) => host.exec.run(args);
  switch (action.op) {
    case 'newSession': {
      const name = action.name ? sessionName(action.name) : '';
      // -E: do not copy the hub's SSH environment (no agent) into the new space.
      const out = await run(['new-session', '-d', '-E', '-P', '-F', '#{session_id}', ...(name ? ['-s', name] : [])]);
      return { session: out.trim() };
    }
    case 'listProjects':
      if (!host.hostConfig.projects) throw new Error('Esta máquina no tiene carpeta de proyectos');
      return listProjects(host);
    case 'openProject':
      return openProject(host, action.name, action.create === true);
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
        // With host-kit, the script also resumes Claude; without it, a fresh shell is all we can do.
        const quoted = `"${(path || '~').replace(/["\\$]/g, '\\$&')}"`;
        await run([
          'if-shell',
          'test -x "$HOME/.scripts/tmux-window-title.sh"',
          `run-shell -b '"$HOME/.scripts/tmux-window-title.sh" reload ${pane}'`,
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
    case 'reboot':
      await reboot(host);
      return;
    default:
      throw new Error(`Operación desconocida: ${(action as { op: string }).op}`);
  }
}
