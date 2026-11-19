import { DEFAULT_COMMAND } from '../../shared/folders.js';
import type { BranchList, ExtHostTargets, ExtLaunchRequest, ExtLaunchResult, TrelloCard } from '../../shared/types.js';
import { branchNameProblem, worktreeNameProblem } from '../../shared/worktree.js';
import { folderPath, folderWindow, listProjects, openSpace, projectCommand, type MachineFolders } from './actions.js';
import type { HostMonitor } from './host.js';
import { branchesScript, parseBranches, parsePrepare, prepareScript, type Prepared } from './worktree-base.js';

// Tasks: a new window running claude with a prompt, in an open space or in the space of
// an added folder, optionally in a new git worktree. Launched from the Trello extension,
// the panel's Trello drawer, «Nuevo worktree» of «Nuevo espacio», and the automations.

const MAX_PROMPT = 10_000;
const MAX_WINDOW_NAME = 30;
/** How much of a card's title goes into the rename instruction (Trello allows 16 384 characters). */
const MAX_CARD_TITLE = 200;

/** A card's name as a window name: one line, no control characters, cut to fit the list. */
export function taskWindowName(name: unknown): string {
  if (typeof name !== 'string') return '';
  const clean = name.replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim();
  const chars = [...clean];
  return chars.length > MAX_WINDOW_NAME ? `${chars.slice(0, MAX_WINDOW_NAME - 1).join('').trimEnd()}…` : clean;
}

/**
 * What a task on a Trello card asks the agent before anything else: to rename the tmux window
 * it runs in with a summary of the card's title. `$TMUX_PANE` stays literal in the typed text
 * and is expanded by Claude's own shell, so it names the pane Claude runs in, whichever window
 * the owner is looking at. The window was pinned at launch, so the kit keeps the new name.
 */
export function cardRenameInstruction(title: string): string {
  const clean = [...title.replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim()];
  const shown = clean.length > MAX_CARD_TITLE ? `${clean.slice(0, MAX_CARD_TITLE - 1).join('').trimEnd()}…` : clean.join('');
  return (
    `Antes de nada, cambia el nombre de la ventana de tmux en la que estás por un resumen del título de esta tarjeta de Trello: «${shown}». ` +
    'Sin el número de la tarjeta y de 30 caracteres como máximo. ' +
    `Ejecuta: tmux rename-window -t "$TMUX_PANE" '<resumen>'`
  );
}

/** The prompt of a task, after the rename instruction when it is about a card (`title`); alone when the prompt is empty. */
export function withCardRename(prompt: string, title: string | undefined): string {
  if (!title) return prompt;
  return [cardRenameInstruction(title), prompt].filter(Boolean).join('\n\n');
}

/**
 * One word for the shell (zsh or bash) with the text as is: single quotes, or $'…' when
 * it has new lines or other control characters, which single quotes would send as keys.
 */
export function shellWord(text: string): string {
  if (!/[\x00-\x1f\x7f]/.test(text)) return `'${text.replace(/'/g, `'\\''`)}'`;
  const esc = text.replace(/[\\'\x00-\x1f\x7f]/g, (c) => {
    if (c === '\\' || c === "'") return `\\${c}`;
    if (c === '\n') return '\\n';
    if (c === '\t') return '\\t';
    if (c === '\r') return '\\r';
    return `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`;
  });
  return `$'${esc}'`;
}

/**
 * What is typed to launch a task: the machine's command when it runs claude (any other,
 * or none, gives way to plain claude), with the permission mode chosen, the worktree it
 * makes (`--worktree`, through the machine's WorktreeCreate hook if it has one) and the
 * prompt, if any. With `cd`, a worktree the hub prepared: claude starts in it instead.
 */
export function taskCommand(command: string, skipPermissions: boolean, prompt: string, worktree?: string, cd?: string): string {
  const claude = /^(\S*\/)?claude(\s|$)/.test(command) ? command : DEFAULT_COMMAND;
  return [
    cd ? `cd ${shellWord(cd)} &&` : '',
    projectCommand(claude, skipPermissions),
    worktree && !cd ? `--worktree ${shellWord(worktree)}` : '',
    prompt ? shellWord(prompt) : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Where tasks can go on a machine: its open spaces, and its folders if it answers in time. */
export async function hostTargets(host: HostMonitor, machine: MachineFolders, timeoutMs = 8000): Promise<ExtHostTargets> {
  const info = host.snapshot;
  const out: ExtHostTargets = {
    id: info.id,
    name: info.name,
    status: info.status,
    error: info.error,
    spaces: info.sessions.map((s) => ({ id: s.id, name: s.name, windows: s.windows.length })),
  };
  if (info.status !== 'ok') return out;
  if (!machine.folders.length) {
    out.folders = [];
    return out;
  }
  let timer: NodeJS.Timeout | undefined;
  try {
    const list = await Promise.race([
      listProjects(host, machine.folders),
      new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error('La máquina no ha contestado a tiempo')), timeoutMs))),
    ]);
    out.folders = list.folders;
  } catch (err) {
    out.foldersError = (err as Error).message;
  } finally {
    clearTimeout(timer);
  }
  return out;
}

const SESSION_ID = /^\$\d+$/;

/** tmux expands formats (#{…}) in window names and start folders: a '#' of the text is written '##'. */
export function tmuxLiteral(text: string): string {
  return text.replace(/#/g, '##');
}

/**
 * Preparing a worktree fetches (bounded on the machine) and may check out a large tree;
 * reading the branches fetches too. Both answer before Chrome drops the extension's call (30 s).
 */
const PREPARE_TIMEOUT = 25_000;
const BRANCHES_TIMEOUT = 25_000;

/** The branches of origin of a target's repository, after a fetch, to pick a new worktree's base. */
export async function listBranches(host: HostMonitor, machine: MachineFolders, target: unknown): Promise<BranchList> {
  return parseBranches(await host.exec.shell(branchesScript(await targetFolder(host, machine, target), host.exec.tmuxCommand), BRANCHES_TIMEOUT));
}

/**
 * The folder a task of this target starts in: the added folder (or `sub`) when there is one,
 * else where a new window of the open space starts (its current pane's folder).
 */
export async function targetFolder(host: HostMonitor, machine: MachineFolders, target: unknown): Promise<string> {
  const t = target as Partial<{ session: unknown; folder: unknown; sub: unknown }> | undefined;
  if (!t || typeof t !== 'object') throw new Error('Falta el destino');
  if (typeof t.folder === 'string') return folderPath(host, machine, { folder: t.folder, sub: typeof t.sub === 'string' ? t.sub : undefined });
  if (typeof t.session !== 'string') throw new Error('Falta el destino');
  if (!SESSION_ID.test(t.session)) throw new Error(`Espacio inválido: ${t.session}`);
  if (!host.snapshot.sessions.some((s) => s.id === t.session)) throw new Error(`Ese espacio ya no está abierto en ${host.name}`);
  const dir = (await host.exec.runFormat(['display-message', '-p', '-t', `${t.session}:`, '#{pane_current_path}'])).trim();
  if (!dir) throw new Error(`No se sabe en qué carpeta está ese espacio de ${host.name}`);
  return dir;
}

/**
 * Launches a task: a new window running claude with the prompt, in an open space or in
 * the space of an added folder. A folder without a space gets one, and the task goes in
 * its first window; with one open, in a new window there, in the folder. An open space
 * with a folder gets a new window in that folder. With `worktree`,
 * claude starts in a new git worktree of that name, and the prompt may be left out: the
 * worktree is prepared on the machine first, from origin/<base> when `base` is given (see
 * worktree-base.ts), and nothing opens if that fails. With `opts.card`, a task on a Trello
 * card, the agent is first asked to rename its window after the card (see cardRenameInstruction).
 */
export async function launchTask(
  host: HostMonitor,
  machine: MachineFolders,
  req: Omit<ExtLaunchRequest, 'host'>,
  opts: { card?: Promise<TrelloCard | null> } = {},
): Promise<ExtLaunchResult> {
  const prompt = typeof req.prompt === 'string' ? req.prompt.trim() : '';
  const worktree = typeof req.worktree === 'string' ? req.worktree.trim() : '';
  const base = worktree && typeof req.base === 'string' ? req.base.trim() : '';
  if (worktree) {
    const problem = worktreeNameProblem(worktree);
    if (problem) throw new Error(problem);
  }
  if (base) {
    const problem = branchNameProblem(base);
    if (problem) throw new Error(problem);
  }
  if (!prompt && !worktree) throw new Error('Falta el prompt');
  if (prompt.length > MAX_PROMPT) throw new Error('El prompt es demasiado largo');
  const name = taskWindowName(req.name || worktree);
  const target = req.target as Partial<{ session: unknown; folder: unknown; sub: unknown }> | undefined;
  if (!target || typeof target !== 'object') throw new Error('Falta el destino');
  const run = (args: string[]) => host.exec.run(args);

  let prepared: Prepared | undefined;
  if (worktree) {
    const out = await host.exec.shell(prepareScript(await targetFolder(host, machine, target), worktree, base, host.exec.tmuxCommand), PREPARE_TIMEOUT);
    prepared = parsePrepare(out, worktree, base);
  }
  const cd = prepared?.kind === 'created' || prepared?.kind === 'reused' ? prepared.path : undefined;

  let session: string;
  let space: string;
  let pane: string | undefined;
  let dir = '#{pane_current_path}';
  let createdSpace = false;
  if (typeof target.session === 'string') {
    if (!SESSION_ID.test(target.session)) throw new Error(`Espacio inválido: ${target.session}`);
    const found = host.snapshot.sessions.find((s) => s.id === target.session);
    if (!found) throw new Error(`Ese espacio ya no está abierto en ${host.name}`);
    session = found.id;
    space = found.name;
    // With a folder too: a new window of that space, in the folder.
    if (typeof target.folder === 'string') {
      const sub = typeof target.sub === 'string' ? target.sub : undefined;
      pane = (await folderWindow(host, machine, { session, folder: target.folder, sub }, name)).pane;
    }
  } else if (typeof target.folder === 'string') {
    const sub = typeof target.sub === 'string' ? target.sub : undefined;
    const opened = await openSpace(host, machine, { folder: target.folder, sub }, name);
    session = opened.session;
    space = opened.name;
    pane = opened.pane;
    createdSpace = !!opened.pane;
    if (opened.dir) dir = tmuxLiteral(opened.dir);
  } else {
    throw new Error('Falta el destino');
  }

  if (!pane) {
    const args = ['new-window', '-P', '-F', '#{pane_id}', '-t', `${session}:`, '-c', dir];
    if (name) args.push('-n', tmuxLiteral(name));
    pane = (await run(args)).trim();
    if (name) await run(['set-option', '-w', '-t', pane, '@name_pinned', '1']);
  }
  // The card was read while the worktree was prepared: waiting for it only now keeps the launch as long as the slower of the two.
  const card = opts.card ? await opts.card : null;
  // Typed into the window's shell, as «Nuevo espacio» does: quitting claude leaves you there.
  await run(['send-keys', '-t', pane, '-l', taskCommand(machine.command, req.skipPermissions === true, withCardRename(prompt, card?.name), worktree || undefined, cd)]);
  await run(['send-keys', '-t', pane, 'Enter']);
  const [window, windowName] = (await host.exec.runFormat(['display-message', '-p', '-t', pane, '#{window_id}\t#{window_name}'])).trim().split('\t');
  const result: ExtLaunchResult = { host: host.id, hostName: host.name, session, space, window: window ?? '', windowName: windowName ?? name, pane, createdSpace };
  const notice = prepared && prepareNotice(prepared, worktree, base);
  if (notice) result.notice = notice;
  return result;
}

/** What the user is told about a prepared worktree: a base not applied, an origin not updated. */
function prepareNotice(prepared: Prepared, worktree: string, base: string): string | undefined {
  const notes: string[] = [];
  if (prepared.kind === 'reused' && base && !prepared.atBase) notes.push(`La rama ${worktree} ya existía: se usa tal cual, sin partir de ${base}`);
  if (prepared.stale) {
    const from = base ? `origin/${base}` : 'la rama base del proyecto';
    notes.push(`No se ha podido actualizar origin: el worktree parte de la copia local de ${from}`);
  }
  return notes.length ? notes.join('. ') : undefined;
}
