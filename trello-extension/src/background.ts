import { hubPattern, loadMemory, loadSettings, saveMemory } from './settings';
import type { TrelloCardContext } from '../../shared/types';
import type { BranchList, ExtLaunchResult, ExtTargets, LaunchContext, Reply, Request, Settings } from './types';

/** A problem the options page fixes: the dialog offers to open it. */
class SetupError extends Error {}

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  try {
    const data = JSON.parse(text) as { error?: string; message?: string };
    return data.error ?? data.message ?? text;
  } catch {
    return text || `HTTP ${res.status}`;
  }
}

// ---------------------------------------------------------------- twb

async function hub<T>(s: Settings, path: string, body?: unknown, tooOld = 'El panel de twb es anterior a la versión 1.18 de la extensión: actualízalo.'): Promise<T> {
  if (!s.hubUrl || !s.hubToken) throw new SetupError('Falta la dirección o el token de twb en las opciones.');
  if (!(await chrome.permissions.contains({ origins: [hubPattern(s.hubUrl)] }))) {
    throw new SetupError('La extensión no tiene permiso para llegar al panel de twb: vuelve a guardar las opciones.');
  }
  let res: Response;
  try {
    res = await fetch(`${s.hubUrl}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${s.hubToken}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(`No se pudo conectar con twb en ${s.hubUrl}. ¿Estás en la tailnet o en la LAN?`);
  }
  if (res.status === 401) throw new SetupError('twb no acepta el token: genera otro en Ajustes › Trello y pégalo en las opciones.');
  if (res.status === 404) throw new Error(tooOld);
  if (!res.ok) throw new Error(`twb: ${await readError(res)}`);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------- requests

// Trello is the panel's business since 1.18: it reads the card and, once the task runs,
// moves it to Doing and comments, with the account of its Settings › Trello.

async function context(cardId: string): Promise<LaunchContext> {
  if (!/^[0-9a-f]{24}$/i.test(cardId)) throw new Error('No se reconoce la tarjeta');
  const s = await loadSettings();
  const [{ card, promptTemplate }, targets, memory] = await Promise.all([
    hub<TrelloCardContext>(s, `/api/ext/card/${cardId}`),
    hub<ExtTargets>(s, '/api/ext/targets'),
    loadMemory(),
  ]);
  return { card, targets, promptTemplate, remembered: memory.boards[card.board.id], skipPermissions: memory.skipPermissions, worktree: memory.worktree };
}

async function launch(req: Extract<Request, { type: 'launch' }>): Promise<ExtLaunchResult> {
  const s = await loadSettings();
  const result = await hub<ExtLaunchResult>(s, '/api/ext/launch', { ...req.req, card: req.card.id });
  const memory = await loadMemory();
  const board = req.card.board.id;
  // A launch without a worktree, or without a base, keeps the base remembered for the next one.
  const base = req.req.worktree && req.req.base ? req.req.base : memory.boards[board]?.base;
  memory.boards[board] = { host: req.req.host, destination: req.destination, space: req.space, base };
  memory.skipPermissions = req.req.skipPermissions === true;
  memory.worktree = req.worktree;
  await saveMemory(memory);
  return result;
}

/** The branches of origin of the target's repository, read by the hub on the machine after a fetch. */
async function branches(msg: Extract<Request, { type: 'branches' }>): Promise<BranchList> {
  const s = await loadSettings();
  const t: { session?: string; folder?: string; sub?: string } = msg.target;
  const q = new URLSearchParams({ host: msg.host });
  if (t.session) q.set('session', t.session);
  if (t.folder) q.set('folder', t.folder);
  if (t.sub) q.set('sub', t.sub);
  return hub<BranchList>(s, `/api/ext/branches?${q}`, undefined, 'El panel de twb es anterior a la elección de la rama base: actualízalo para elegirla.');
}

// ---------------------------------------------------------------- updates

/**
 * A newer version on disk than the one running: the kit put it in this extension's folder
 * (install.sh --trello-extension). Chrome reads it on a reload, or when it starts again.
 */
async function waitingVersion(): Promise<string | null> {
  try {
    const disk = (await (await fetch(chrome.runtime.getURL('manifest.json'), { cache: 'no-store' })).json()) as { version?: string };
    return disk.version && disk.version !== chrome.runtime.getManifest().version ? disk.version : null;
  } catch {
    return null;
  }
}

/** The icon tells it too, so it shows without opening a dialog. */
async function markUpdate(): Promise<string | null> {
  const version = await waitingVersion();
  await chrome.action.setBadgeText({ text: version ? '↑' : '' });
  await chrome.action.setTitle({ title: version ? `Trello → twb: versión ${version} lista, recárgala en chrome://extensions` : 'Trello → twb: opciones' });
  return version;
}
void markUpdate();

async function handle(msg: Request): Promise<unknown> {
  switch (msg.type) {
    case 'context':
      return context(msg.cardId);
    case 'launch':
      return launch(msg);
    case 'branches':
      return branches(msg);
    case 'openOptions':
      await chrome.runtime.openOptionsPage();
      return null;
    case 'update':
      return { version: await markUpdate() };
    case 'openExtensions':
      await chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
      return null;
  }
}

chrome.runtime.onMessage.addListener((msg: Request, _sender, sendResponse: (r: Reply<unknown>) => void) => {
  handle(msg).then(
    (data) => sendResponse({ ok: true, data }),
    (err: Error) => sendResponse({ ok: false, error: err.message, setup: err instanceof SetupError }),
  );
  return true;
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install') return;
  const s = await loadSettings();
  if (!s.hubUrl || !s.hubToken) await chrome.runtime.openOptionsPage();
});

chrome.action.onClicked.addListener(() => void chrome.runtime.openOptionsPage());
