import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { commentText, findDoingList } from '../../shared/trello.js';
import type { ExtLaunchResult, TrelloAfterLaunch, TrelloBoard, TrelloCard, TrelloInfo, TrelloLabel, TrelloList } from '../../shared/types.js';

// The hub's Trello account (Settings › Trello): an API key and a token, kept in
// dataDir/trello.json (0600). With it the panel lists boards and cards, and a task
// launched on a card (from the panel or the extension) moves it to Doing and comments.

/** Trello said no to the key or the token, or there are none: fixed in Settings › Trello. */
export class TrelloSetupError extends Error {}

/** Trello answered that what was asked for does not exist (404). */
export class TrelloNotFoundError extends Error {}

const API = 'https://api.trello.com/1';
const CARD_ID = /^[0-9a-f]{24}$/i;
const BOARD_ID = /^[0-9a-f]{24}$/i;
/** A board's shortLink (8 characters) or its id (24 hex). */
export const TRELLO_BOARD = /^(?:[A-Za-z0-9]{8}|[0-9a-f]{24})$/;
/** Where a card's page is: the panel opens it in a tab that shares its origin until then. */
const CARD_PAGE = 'https://trello.com/';

/** Whether a board (shortLink or id) and a card's short number can be put in a Trello path. */
export function isCardRef(board: string, n: string): boolean {
  return TRELLO_BOARD.test(board) && /^\d{1,7}$/.test(n);
}

/** A card's labels as Trello sends them (missing when it has none): only their name and colour. */
const labelsOf = (labels: TrelloLabel[] = []): TrelloLabel[] => labels.map((x) => ({ name: x.name, color: x.color }));

/** A card read for a launch: the card, or why Trello did not give it. */
export type CardRead = { card: TrelloCard; error?: undefined } | { card?: undefined; error: string };

interface Creds {
  key: string;
  token: string;
}

type Fetch = typeof fetch;

export class TrelloService {
  private readonly file: string;
  private creds: Creds | null = null;
  private member: { at: number; info: TrelloInfo } | null = null;

  constructor(
    dataDir: string,
    private readonly fetchFn: Fetch = fetch,
  ) {
    this.file = join(dataDir, 'trello.json');
    if (!existsSync(this.file)) return;
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Creds>;
      if (typeof data.key === 'string' && typeof data.token === 'string' && data.key && data.token) this.creds = { key: data.key, token: data.token };
    } catch {
      console.warn('[trello] trello.json ilegible: sin cuenta de Trello');
    }
  }

  get configured(): boolean {
    return !!this.creds;
  }

  private async call<T>(method: 'GET' | 'PUT' | 'POST', path: string, params: Record<string, string> = {}, creds = this.creds): Promise<T> {
    if (!creds) throw new TrelloSetupError('El panel no tiene cuenta de Trello: añade la API key y el token en Ajustes › Trello.');
    const url = new URL(`${API}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method,
        headers: { Authorization: `OAuth oauth_consumer_key="${creds.key}", oauth_token="${creds.token}"`, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error('No se pudo conectar con la API de Trello');
    }
    if (res.status === 401) throw new TrelloSetupError('Trello no acepta la API key o el token de Ajustes › Trello.');
    if (res.status === 404) throw new TrelloNotFoundError('Trello no lo encuentra');
    if (!res.ok) throw new Error(`Trello: ${(await res.text().catch(() => '')) || `error ${res.status}`}`);
    return (await res.json()) as T;
  }

  /** Whether there is an account, and whose (asked to Trello at most every 10 minutes). */
  async info(fresh = false): Promise<TrelloInfo> {
    if (!this.creds) return { configured: false };
    if (!fresh && this.member && Date.now() - this.member.at < 600_000) return this.member.info;
    let info: TrelloInfo;
    try {
      const me = await this.call<{ username: string; fullName: string }>('GET', '/members/me', { fields: 'username,fullName' });
      info = { configured: true, member: `${me.fullName} (@${me.username})` };
    } catch (err) {
      info = { configured: true, error: (err as Error).message };
    }
    this.member = { at: Date.now(), info };
    return info;
  }

  /** Keeps a new key and token, once Trello takes them. */
  async set(key: unknown, token: unknown): Promise<TrelloInfo> {
    const creds = { key: String(key ?? '').trim(), token: String(token ?? '').trim() };
    if (!/^[0-9a-f]{32}$/i.test(creds.key)) throw new Error('La API key de Trello son 32 caracteres hexadecimales');
    if (!/^[A-Za-z0-9]{32,128}$/.test(creds.token)) throw new Error('El token de Trello no tiene buena pinta');
    const me = await this.call<{ username: string; fullName: string }>('GET', '/members/me', { fields: 'username,fullName' }, creds);
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(creds), { mode: 0o600 });
    renameSync(tmp, this.file);
    this.creds = creds;
    const info = { configured: true, member: `${me.fullName} (@${me.username})` };
    this.member = { at: Date.now(), info };
    return info;
  }

  forget(): TrelloInfo {
    this.creds = null;
    this.member = null;
    rmSync(this.file, { force: true });
    return { configured: false };
  }

  /** The account's open boards, by name. */
  async boards(): Promise<TrelloBoard[]> {
    const list = await this.call<{ id: string; name: string }[]>('GET', '/members/me/boards', { filter: 'open', fields: 'name' });
    return list.map((b) => ({ id: b.id, name: b.name })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  /** A board's open lists, in order, with their open cards. */
  async lists(boardId: string): Promise<TrelloList[]> {
    if (!BOARD_ID.test(boardId)) throw new Error('No se reconoce el tablero');
    const lists = await this.call<
      { id: string; name: string; cards?: { id: string; name: string; idShort: number; shortUrl: string; labels?: TrelloLabel[] }[] }[]
    >('GET', `/boards/${boardId}/lists`, { filter: 'open', fields: 'name', cards: 'open', card_fields: 'name,idShort,shortUrl,labels' });
    return lists.map((l) => ({
      id: l.id,
      name: l.name,
      cards: (l.cards ?? []).map((c) => ({ id: c.id, name: c.name, idShort: c.idShort, url: c.shortUrl, labels: labelsOf(c.labels) })),
    }));
  }

  /** The page of the card with short number `n` on a board (its shortLink or id), for a `Trello #N` link in the terminal. */
  async cardUrl(board: string, n: string): Promise<string> {
    if (!isCardRef(board, n)) throw new Error('No se reconoce la tarjeta');
    let url: unknown;
    try {
      url = (await this.call<{ shortUrl?: unknown }>('GET', `/boards/${board}/cards/${n}`, { fields: 'shortUrl' })).shortUrl;
    } catch (err) {
      if (err instanceof TrelloNotFoundError) throw new TrelloNotFoundError(`No encuentro la tarjeta ${n} en el tablero del proyecto`);
      throw err;
    }
    if (typeof url !== 'string' || !url.startsWith(CARD_PAGE)) throw new Error(`Trello ha devuelto una dirección de la tarjeta ${n} que no es de Trello`);
    return url;
  }

  async card(cardId: string): Promise<TrelloCard> {
    if (!CARD_ID.test(cardId)) throw new Error('No se reconoce la tarjeta');
    const c = await this.call<{
      id: string;
      name: string;
      shortUrl: string;
      shortLink: string;
      idShort: number;
      idList: string;
      board: { id: string; name: string };
      labels?: TrelloLabel[];
    }>('GET', `/cards/${cardId}`, { fields: 'name,shortUrl,shortLink,idShort,idList,labels', board: 'true', board_fields: 'name' });
    return {
      id: c.id,
      name: c.name,
      url: c.shortUrl,
      shortLink: c.shortLink,
      idShort: c.idShort,
      idList: c.idList,
      board: { id: c.board.id, name: c.board.name },
      labels: labelsOf(c.labels),
    };
  }

  /**
   * A card a task is launched on, read once for the launch (its title for the rename
   * instruction) and for what follows it. Never rejects: the task launches anyway.
   */
  async readCard(cardId: string): Promise<CardRead> {
    try {
      return { card: await this.card(cardId) };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  /**
   * Once a task is running on a card: to the end of its board's Doing list, and a comment
   * saying where it runs. Failures are warnings: the task was launched anyway.
   */
  async afterLaunch(read: CardRead, result: Pick<ExtLaunchResult, 'hostName' | 'space' | 'windowName'>): Promise<TrelloAfterLaunch> {
    const out: TrelloAfterLaunch = { commented: false, warnings: [] };
    const card = read.card;
    if (!card) {
      out.warnings.push(`No se pudo leer la tarjeta: ${read.error}`);
      return out;
    }
    try {
      const lists = await this.call<{ id: string; name: string; closed: boolean }[]>('GET', `/boards/${card.board.id}/lists`, { fields: 'name,closed' });
      const doing = findDoingList(lists);
      if (!doing) out.warnings.push('No hay una lista «Doing» en este tablero: la tarjeta se queda donde estaba.');
      else {
        if (doing.id !== card.idList) await this.call('PUT', `/cards/${card.id}`, { idList: doing.id, pos: 'bottom' });
        out.movedTo = doing.name;
      }
    } catch (err) {
      out.warnings.push(`No se pudo mover la tarjeta a Doing: ${(err as Error).message}`);
    }
    try {
      await this.call('POST', `/cards/${card.id}/actions/comments`, { text: commentText(result) });
      out.commented = true;
    } catch (err) {
      out.warnings.push(`No se pudo comentar en la tarjeta: ${(err as Error).message}`);
    }
    return out;
  }
}
