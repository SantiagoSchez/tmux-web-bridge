import { commentText, findDoingList } from './logic';
import { hubPattern, loadMemory, loadSettings, saveMemory } from './settings';
import type { CardInfo, ExtLaunchResult, ExtTargets, LaunchContext, LaunchOutcome, Reply, Request, Settings } from './types';

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

async function hub<T>(s: Settings, path: string, body?: unknown): Promise<T> {
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
  if (!res.ok) throw new Error(`twb: ${await readError(res)}`);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------- Trello

async function trello<T>(s: Settings, method: 'GET' | 'PUT' | 'POST', path: string, params: Record<string, string> = {}): Promise<T> {
  if (!s.trelloKey || !s.trelloToken) throw new SetupError('Falta la API key o el token de Trello en las opciones.');
  const url = new URL(`https://api.trello.com/1${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method,
    headers: { Authorization: `OAuth oauth_consumer_key="${s.trelloKey}", oauth_token="${s.trelloToken}"`, Accept: 'application/json' },
  });
  if (res.status === 401) throw new SetupError('Trello no acepta la API key o el token de las opciones.');
  if (!res.ok) throw new Error(`Trello: ${await readError(res)}`);
  return (await res.json()) as T;
}

interface TrelloCard {
  id: string;
  name: string;
  shortUrl: string;
  shortLink: string;
  idList: string;
  board: { id: string; name: string };
}

async function cardInfo(s: Settings, cardId: string): Promise<CardInfo> {
  if (!/^[0-9a-f]{24}$/i.test(cardId)) throw new Error('No se reconoce la tarjeta');
  const c = await trello<TrelloCard>(s, 'GET', `/cards/${cardId}`, { fields: 'name,shortUrl,shortLink,idList', board: 'true', board_fields: 'name' });
  return { id: c.id, name: c.name, url: c.shortUrl, shortLink: c.shortLink, idList: c.idList, board: { id: c.board.id, name: c.board.name } };
}

/** Moves the card to the end of its board's Doing list. Returns the list's name, or why it did not move. */
async function moveToDoing(s: Settings, card: CardInfo): Promise<{ list?: string; warning?: string }> {
  const lists = await trello<{ id: string; name: string; closed: boolean }[]>(s, 'GET', `/boards/${card.board.id}/lists`, { fields: 'name,closed' });
  const doing = findDoingList(lists);
  if (!doing) return { warning: 'No hay una lista «Doing» en este tablero: la tarjeta se queda donde estaba.' };
  if (doing.id === card.idList) return { list: doing.name };
  await trello(s, 'PUT', `/cards/${card.id}`, { idList: doing.id, pos: 'bottom' });
  return { list: doing.name };
}

// ---------------------------------------------------------------- requests

async function context(cardId: string): Promise<LaunchContext> {
  const s = await loadSettings();
  const [card, targets, memory] = await Promise.all([cardInfo(s, cardId), hub<ExtTargets>(s, '/api/ext/targets'), loadMemory()]);
  return { card, targets, promptTemplate: s.promptTemplate, remembered: memory.boards[card.board.id], skipPermissions: memory.skipPermissions };
}

async function launch(req: Extract<Request, { type: 'launch' }>): Promise<LaunchOutcome> {
  const s = await loadSettings();
  const result = await hub<ExtLaunchResult>(s, '/api/ext/launch', req.req);

  const memory = await loadMemory();
  memory.boards[req.card.board.id] = { host: req.req.host, destination: req.destination };
  memory.skipPermissions = req.req.skipPermissions === true;
  await saveMemory(memory);

  // The task is running: from here on, a failure is only a warning.
  const warnings: string[] = [];
  let movedTo: string | undefined;
  try {
    const moved = await moveToDoing(s, req.card);
    movedTo = moved.list;
    if (moved.warning) warnings.push(moved.warning);
  } catch (err) {
    warnings.push(`No se pudo mover la tarjeta a Doing: ${(err as Error).message}`);
  }
  let commented = false;
  try {
    await trello(s, 'POST', `/cards/${req.card.id}/actions/comments`, { text: commentText(result) });
    commented = true;
  } catch (err) {
    warnings.push(`No se pudo comentar en la tarjeta: ${(err as Error).message}`);
  }
  return { result, movedTo, commented, warnings };
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
  if (!s.hubUrl || !s.trelloKey) await chrome.runtime.openOptionsPage();
});

chrome.action.onClicked.addListener(() => void chrome.runtime.openOptionsPage());
