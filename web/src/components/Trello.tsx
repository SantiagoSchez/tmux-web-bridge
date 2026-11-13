import { signal } from '@preact/signals';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DEFAULT_TEMPLATE, folderGroups, launchTarget, rememberedChoice, renderTemplate, spaceChoices } from '../../../shared/trello';
import type { ExtHostTargets, ExtLaunchRequest, ExtLaunchResult, ExtTargets, TrelloBoard, TrelloInfo, TrelloList } from '../../../shared/types';
import { cardWorktreeName, worktreeNameProblem } from '../../../shared/worktree';
import { openWindowWhenReady } from '../menus';
import { prefs, setPref } from '../prefs';
import { hubSettings, sheet, toast } from '../state';
import { hub } from '../ws';
import { Sheet, SkipPermissions } from './Dialogs';
import { IconReload } from './icons';
import { api } from '../api';

/** Lower case and without accents, to search. */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

// Trello in the panel: the hub's account (Settings › Trello), and a drawer with a board's
// lists and cards that launches a Claude on one, as the browser extension does.

/** The hub's Trello account, as last read: the drawer's button shows with one. */
export const trelloInfo = signal<TrelloInfo | null>(null);

export function loadTrelloInfo(fresh = false): Promise<void> {
  return api<TrelloInfo>(`/api/trello${fresh ? '?fresh=1' : ''}`).then(
    (i) => void (trelloInfo.value = i),
    () => {},
  );
}

// ---------------------------------------------------------------- Settings › Trello

/** The hub's Trello account and the prompt template, for the panel and the extension. */
export function TrelloAccountSettings() {
  const info = trelloInfo.value;
  const [key, setKey] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const saved = hubSettings.value?.trelloPromptTemplate ?? DEFAULT_TEMPLATE;
  const [template, setTemplate] = useState(saved);
  useEffect(() => setTemplate(saved), [saved]);
  useEffect(() => void loadTrelloInfo(true), []);

  const save = async () => {
    setBusy(true);
    try {
      trelloInfo.value = await api<TrelloInfo>('/api/trello', { key, token });
      setKey('');
      setToken('');
      setEditing(false);
      toast('Cuenta de Trello guardada');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const forget = async () => {
    trelloInfo.value = await api<TrelloInfo>('/api/trello/forget', {});
    toast('Cuenta de Trello olvidada');
  };

  const form = !info?.configured || editing;
  return (
    <>
      <section class="setting">
        <h3>Cuenta de Trello</h3>
        <p class="dim small">
          Con ella, el panel enseña tus tableros (botón <strong>Trello</strong> de la cabecera) y, al lanzar una tarea sobre una tarjeta (desde el panel o desde la
          extensión), la mueve a Doing y la comenta. La API key y el token son los de un Power-Up tuyo, en{' '}
          <a href="https://trello.com/power-ups/admin" target="_blank" rel="noreferrer">
            trello.com/power-ups/admin
          </a>
          .
        </p>
        {info?.configured && (
          <p class="settings-state">{info.error ? `Trello no contesta: ${info.error}` : `Conectado como ${info.member}.`}</p>
        )}
        {form ? (
          <form
            class="folder-picker"
            onSubmit={(e) => {
              e.preventDefault();
              if (key.trim() && token.trim()) void save();
            }}
          >
            <label class="folder-name">
              <span class="dim small">API key</span>
              <input class="text-input mono" value={key} autocomplete="off" spellcheck={false} onInput={(e) => setKey(e.currentTarget.value)} />
            </label>
            <label class="folder-name">
              <span class="dim small">Token</span>
              <input class="text-input mono" type="password" value={token} autocomplete="off" spellcheck={false} onInput={(e) => setToken(e.currentTarget.value)} />
            </label>
            <div class="row-btns">
              {editing && (
                <button type="button" class="btn" onClick={() => setEditing(false)}>
                  Cancelar
                </button>
              )}
              <button type="submit" class="btn btn-primary" disabled={busy || !key.trim() || !token.trim()}>
                {busy ? 'Probando…' : 'Guardar y probar'}
              </button>
            </div>
          </form>
        ) : (
          <div class="row-btns">
            <button class="btn" onClick={() => void forget()}>
              Olvidar
            </button>
            <button class="btn" onClick={() => setEditing(true)}>
              Cambiar
            </button>
          </div>
        )}
      </section>
      <section class="setting">
        <h3>Prompt de las tareas</h3>
        <p class="dim small">
          Lo que se le pide a Claude con una tarjeta, desde el panel o desde la extensión: <code>{'{url}'}</code>, <code>{'{name}'}</code>,{' '}
          <code>{'{shortLink}'}</code> y <code>{'{board}'}</code> de la tarjeta. Se puede retocar antes de lanzar.
        </p>
        <textarea class="text-input mono" rows={3} value={template} spellcheck={false} onInput={(e) => setTemplate(e.currentTarget.value)} />
        <div class="row-btns">
          <button class="btn btn-primary" disabled={template.trim() === saved} onClick={() => hub.send({ t: 'settings', settings: { trelloPromptTemplate: template } })}>
            Guardar
          </button>
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------- the drawer

type Card = TrelloList['cards'][number];

/** The Trello drawer: a board's lists and cards; a card opens the launch form. */
export function TrelloSheet() {
  if (sheet.value !== 'trello') return null;
  return <TrelloDrawer close={() => (sheet.value = null)} />;
}

function TrelloDrawer({ close }: { close: () => void }) {
  const [boards, setBoards] = useState<TrelloBoard[] | null>(null);
  const [lists, setLists] = useState<TrelloList[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [query, setQuery] = useState('');
  const boardId = prefs.value.trelloBoard;
  const board = boards?.find((b) => b.id === boardId) ?? null;

  useEffect(() => {
    api<TrelloBoard[]>('/api/trello/boards').then(
      (list) => {
        setBoards(list);
        if (!list.some((b) => b.id === prefs.value.trelloBoard) && list[0]) setPref('trelloBoard', list[0].id);
      },
      (err: Error) => setError(err.message),
    );
  }, []);

  const loadLists = () => {
    if (!board) return;
    setLists(null);
    api<TrelloList[]>(`/api/trello/boards/${board.id}`).then(setLists, (err: Error) => setError(err.message));
  };
  useEffect(loadLists, [board?.id]);

  const listId = (board && prefs.value.trelloLists[board.id]) || '';
  const list = lists?.find((l) => l.id === listId) ?? lists?.find((l) => l.cards.length) ?? lists?.[0] ?? null;
  const pickList = (id: string) => board && setPref('trelloLists', { ...prefs.value.trelloLists, [board.id]: id });
  // A search looks through every list of the board: by title (accents aside) or number (#140, 140).
  const q = fold(query.trim());
  const found = useMemo(() => {
    if (!q || !lists) return null;
    const num = /^#?\d+$/.test(q) ? Number(q.replace('#', '')) : null;
    return lists.flatMap((l) => l.cards.filter((c) => (num !== null && c.idShort === num) || fold(c.name).includes(q)).map((c) => ({ card: c, list: l.name })));
  }, [q, lists]);
  const shown = found ?? (list?.cards ?? []).map((c) => ({ card: c, list: '' }));

  if (card && board) return <LaunchCard board={board} card={card} close={close} back={() => setCard(null)} />;

  return (
    <Sheet title="Trello" class="trello-sheet" onClose={close}>
      {error ? (
        <p class="settings-state">{error}</p>
      ) : !boards ? (
        <p class="dim pad">Cargando tableros…</p>
      ) : (
        <>
          <div class="trello-top">
            <select class="text-input" aria-label="Tablero" value={boardId} onChange={(e) => setPref('trelloBoard', e.currentTarget.value)}>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <button class="icon-btn" aria-label="Volver a leer el tablero" title="Volver a leer el tablero" onClick={loadLists}>
              <IconReload />
            </button>
          </div>
          <input
            class="text-input trello-search"
            type="search"
            value={query}
            placeholder="Buscar una tarjeta (título o número)"
            aria-label="Buscar una tarjeta"
            autocomplete="off"
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
          {lists && !found && (
            <div class="trello-lists" role="tablist" aria-label="Listas">
              {lists.map((l) => (
                <button key={l.id} role="tab" aria-selected={l.id === list?.id} class={`pchip ${l.id === list?.id ? 'on' : ''}`} onClick={() => pickList(l.id)}>
                  {l.name} <span class="dim">{l.cards.length}</span>
                </button>
              ))}
            </div>
          )}
          {!lists ? (
            <p class="dim pad">Cargando tarjetas…</p>
          ) : !shown.length ? (
            <p class="dim pad">{found ? 'Ninguna tarjeta del tablero coincide.' : 'Esta lista no tiene tarjetas.'}</p>
          ) : (
            <ul class="menu trello-cards">
              {found && (
                <li class="dim small trello-found">
                  {found.length} tarjeta{found.length === 1 ? '' : 's'} en todo el tablero
                </li>
              )}
              {shown.map(({ card: c, list: inList }) => (
                <li key={c.id}>
                  <button class="menu-item" onClick={() => setCard(c)}>
                    <span class="trello-num">#{c.idShort}</span>
                    <span class="project-text">
                      <span class="project-name">{c.name}</span>
                      {inList && <span class="project-hint">{inList}</span>}
                      {c.labels.length > 0 && (
                        <span class="trello-labels">
                          {c.labels.map((x, i) => (
                            <span key={i} class={`trello-label tl-${x.color ?? 'none'}`}>
                              {x.name || ' '}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Sheet>
  );
}

/** A card's https://trello.com/c/<shortLink>: its short link is the last part. */
const shortLink = (url: string) => url.replace(/\/+$/, '').split('/').pop() ?? '';

/** The launch form for a card: machine, destination, prompt, worktree and permissions. */
function LaunchCard({ board, card, close, back }: { board: TrelloBoard; card: Card; close: () => void; back: () => void }) {
  const [targets, setTargets] = useState<ExtHostTargets[] | null>(null);
  const remembered = prefs.value.trelloLaunch[board.id];
  const [hostId, setHostId] = useState('');
  const [spaceKey, setSpaceKey] = useState('');
  const [destKey, setDestKey] = useState('');
  const template = hubSettings.value?.trelloPromptTemplate ?? DEFAULT_TEMPLATE;
  const [prompt, setPrompt] = useState(renderTemplate(template, { url: card.url, name: card.name, shortLink: shortLink(card.url), board }));
  const [inWorktree, setInWorktree] = useState(prefs.value.trelloWorktree);
  const [wtName, setWtName] = useState(cardWorktreeName(card.idShort, card.name));
  const [busy, setBusy] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api<ExtTargets>('/api/targets').then(
      ({ hosts }) => {
        setTargets(hosts);
        const first = hosts.find((h) => h.id === remembered?.host && h.status === 'ok') ?? hosts.find((h) => h.status === 'ok');
        if (first) {
          setHostId(first.id);
          if (first.id === remembered?.host) {
            const r = rememberedChoice(remembered);
            setSpaceKey(r.space);
            setDestKey(r.folder);
          }
        }
      },
      (err: Error) => toast(err.message, 'error'),
    );
  }, []);

  const host = targets?.find((h) => h.id === hostId);
  const spaces = useMemo(() => (host ? spaceChoices(host) : []), [host]);
  // A space picked that is gone (closed since it was remembered): back to the folder's.
  const space = spaces.some((s) => s.key === spaceKey) ? spaceKey : '';
  const groups = useMemo(() => (host ? folderGroups(host, !space) : []), [host, space]);
  const folder = groups.some((g) => g.items.some((d) => d.key === destKey)) ? destKey : '';
  const dest = host && launchTarget(host, space, folder);
  const problem = inWorktree ? worktreeNameProblem(wtName.trim()) : null;
  const ready = !!dest && (!!prompt.trim() || inWorktree) && !problem;

  const launch = async () => {
    if (!ready || busy || !dest) return;
    setBusy(true);
    const worktree = inWorktree ? wtName.trim() : undefined;
    const req: ExtLaunchRequest = { host: hostId, target: dest, prompt: prompt.trim(), name: worktree ?? card.name, skipPermissions: prefs.value.skipPermissions, worktree, card: card.id };
    try {
      const r = await api<ExtLaunchResult>('/api/trello/launch', req);
      setPref('trelloLaunch', { ...prefs.value.trelloLaunch, [board.id]: { host: hostId, destination: folder, space } });
      setPref('trelloWorktree', inWorktree);
      close();
      toast(`Lanzada en ${r.hostName} › ${r.space}${r.trello?.movedTo ? ` · movida a ${r.trello.movedTo}` : ''}`);
      for (const w of r.trello?.warnings ?? []) toast(w, 'error');
      openWindowWhenReady(r.host, r.session, r.window);
    } catch (err) {
      toast((err as Error).message, 'error');
      setBusy(false);
    }
  };

  return (
    <Sheet title={`#${card.idShort} ${card.name}`} subtitle={board.name} back={{ label: 'Tarjetas', onClick: back }} onClose={close}>
      <form
        class="folder-picker"
        onSubmit={(e) => {
          e.preventDefault();
          void launch();
        }}
      >
        {!targets ? (
          <p class="dim pad">Cargando máquinas…</p>
        ) : (
          <>
            <label class="folder-name">
              <span class="dim small">Máquina</span>
              <select
                class="text-input"
                value={hostId}
                onChange={(e) => {
                  setHostId(e.currentTarget.value);
                  setSpaceKey('');
                  setDestKey('');
                }}
              >
                {targets.map((h) => (
                  <option key={h.id} value={h.id} disabled={h.status !== 'ok'}>
                    {h.status === 'ok' ? h.name : `${h.name} (sin conexión)`}
                  </option>
                ))}
              </select>
            </label>
            <label class="folder-name">
              <span class="dim small">Espacio</span>
              <select class="text-input" value={space} onChange={(e) => setSpaceKey(e.currentTarget.value)}>
                <option value="">El de la carpeta (nuevo o abierto)</option>
                {spaces.length > 0 && (
                  <optgroup label="Espacios abiertos (ventana nueva)">
                    {spaces.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
            <label class="folder-name">
              <span class="dim small">Carpeta</span>
              <select class="text-input" value={folder} onChange={(e) => setDestKey(e.currentTarget.value)}>
                <option value="" disabled={!space}>
                  {space ? 'La del espacio (donde esté)' : 'Elige una carpeta…'}
                </option>
                {groups.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.items.map((d) => (
                      <option key={d.key} value={d.key}>
                        {d.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            {host?.foldersError && <p class="settings-state small">No se han podido leer las carpetas: {host.foldersError}</p>}
            {host && !spaces.length && !groups.length && <p class="settings-state small">Esta máquina no tiene espacios abiertos ni carpetas en Ajustes › Carpetas.</p>}
          </>
        )}
        <label class="folder-name">
          <span class="dim small">Prompt</span>
          <textarea ref={promptRef} class="text-input" rows={3} value={prompt} onInput={(e) => setPrompt(e.currentTarget.value)} />
        </label>
        <label class="kb-check">
          <input type="checkbox" checked={inWorktree} onChange={(e) => setInWorktree(e.currentTarget.checked)} />
          En un worktree nuevo
        </label>
        {inWorktree && (
          <label class="folder-name">
            <span class="dim small">Worktree (y rama)</span>
            <input class="text-input mono" value={wtName} autocapitalize="off" autocomplete="off" spellcheck={false} onInput={(e) => setWtName(e.currentTarget.value)} />
          </label>
        )}
        {problem && <p class="settings-state small">{problem}</p>}
        <div class="sheet-actions">
          <SkipPermissions />
          <a class="btn" href={card.url} target="_blank" rel="noreferrer">
            Abrir en Trello
          </a>
          <button type="submit" class="btn btn-primary" disabled={!ready || busy}>
            {busy ? 'Lanzando…' : 'Lanzar'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
