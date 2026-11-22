import { useEffect, useRef, useState } from 'preact/hooks';
import { childPath } from '../../../shared/folders';
import type { DirListing } from '../../../shared/types';
import { api } from '../api';
import type { FileOrigin } from '../fileViewer';
import { fold } from '../text';
import { FileBody, fileSize, qs, useFile, type Layer } from './Files';
import { FileTypeIcon, IconFolder } from './icons';
import { Sheet } from './Sheet';

// The file explorer: the folders and files of a machine, moving freely up to /, with a
// filter, the hidden entries on demand and the selected file's preview. A screen of the
// file viewer (a folder link, the window's folder button, a folder opened as a file) and
// the browser of the folder pickers (Ajustes › Carpetas, «Nueva carpeta»).

/** How much of a text file the preview reads; «Abrir» shows more. */
const PREVIEW_MAX = 256 * 1024;

/**
 * Where an explorer is and what it shows: the folder listed, the path typed, the filter,
 * the hidden entries, the selected file. Moving to another folder clears the filter and
 * the selection. `start` may be relative to the origin's panes (`.` is the pane's own).
 */
export function useExplorer(origin: FileOrigin, start = '~') {
  const [at, setAt] = useState<DirListing | null>(null);
  const [path, setPath] = useState(start);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hidden, setHidden] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  /** The last folder asked for: an older answer that arrives later is dropped. */
  const last = useRef(0);

  const go = async (to: string): Promise<DirListing | null> => {
    const mine = ++last.current;
    setBusy(true);
    try {
      const l = await api<DirListing>(`/api/dir?${qs({ host: origin.host, window: origin.window, pane: origin.pane, path: to.trim() })}`);
      if (mine !== last.current) return null;
      setAt(l);
      setPath(l.path);
      setQuery('');
      setSelected(null);
      setError(null);
      listRef.current?.scrollTo(0, 0);
      return l;
    } catch (err) {
      if (mine === last.current) setError((err as Error).message);
      return null;
    } finally {
      if (mine === last.current) setBusy(false);
    }
  };
  useEffect(() => void go(start), []);

  /** A path typed but not opened yet. */
  const typed = path.trim() !== at?.path;
  /** Where it is, opening first a path typed by hand: so only folders that exist are used. */
  const here = () => (typed ? go(path) : Promise.resolve(at));
  return { origin, at, path, setPath, busy, error, go, typed, here, query, setQuery, hidden, setHidden, selected, setSelected, listRef };
}

export type ExplorerState = ReturnType<typeof useExplorer>;

/** The path field, the filter, the folder's entries and the selected file's preview; `open` shows a file whole. */
export function Explorer({ x, open, fill }: { x: ExplorerState; open: (path: string) => void; fill?: boolean }) {
  const { at, busy, go, query, hidden, selected } = x;
  const words = fold(query).split(/\s+/).filter(Boolean);
  const shown = (name: string) => (hidden || !name.startsWith('.')) && words.every((w) => fold(name).includes(w));
  const dirs = at ? at.dirs.filter(shown) : [];
  const files = at ? at.files.filter((f) => shown(f.name)) : [];
  const empty = !at ? '' : query ? 'Nada coincide.' : at.dirs.length || at.files.length ? 'Solo hay carpetas y ficheros ocultos.' : 'La carpeta está vacía.';
  return (
    <div class={`explorer ${fill ? 'fill' : ''} ${at && selected ? 'has-preview' : ''}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) void go(x.path);
        }}
      >
        <input
          class="text-input"
          value={x.path}
          placeholder="~/carpeta o /ruta/absoluta"
          aria-label="Ruta de la carpeta"
          autocapitalize="off"
          autocomplete="off"
          spellcheck={false}
          onInput={(e) => x.setPath(e.currentTarget.value)}
        />
      </form>
      <div class="explorer-tools">
        <input
          class="text-input"
          type="search"
          value={query}
          placeholder="Filtrar por nombre"
          aria-label="Filtrar por nombre"
          autocapitalize="off"
          autocomplete="off"
          spellcheck={false}
          onInput={(e) => x.setQuery(e.currentTarget.value)}
        />
        <label class="kb-check">
          <input type="checkbox" checked={hidden} onChange={(e) => x.setHidden(e.currentTarget.checked)} />
          Mostrar ocultos
        </label>
      </div>
      {x.error && <p class="settings-state">{x.error}</p>}
      <div class="explorer-main">
        <ul class="menu explorer-list" ref={x.listRef} aria-busy={busy}>
          {!at && !x.error && <li class="dim pad">Cargando…</li>}
          {at?.parent && (
            <li>
              <button class="menu-item" disabled={busy} onClick={() => void go(at.parent!)}>
                <span class="menu-icon" aria-hidden="true">
                  ↑
                </span>
                <span class="project-name">..</span>
              </button>
            </li>
          )}
          {dirs.map((d) => (
            <li key={`d:${d}`}>
              <button class="menu-item" disabled={busy} onClick={() => void go(childPath(at!.path, d))}>
                <span class="menu-icon" aria-hidden="true">
                  <IconFolder />
                </span>
                <span class="project-name">{d}</span>
              </button>
            </li>
          ))}
          {files.map((f) => (
            <li key={`f:${f.name}`}>
              <button class="menu-item" aria-pressed={selected === f.name} onClick={() => x.setSelected(f.name)}>
                <span class="menu-icon" aria-hidden="true">
                  <FileTypeIcon name={f.name} />
                </span>
                <span class="project-name">{f.name}</span>
                <span class="explorer-size dim small">{fileSize(f.size)}</span>
              </button>
            </li>
          ))}
          {at && !dirs.length && !files.length && <li class="dim pad">{empty}</li>}
          {!!at?.left && (
            <li class="dim pad small">
              {at.left.toLocaleString('es')} {at.left === 1 ? 'entrada más que no se lista' : 'entradas más que no se listan'}: solo salen las 2000 primeras carpetas y los 2000 primeros ficheros, por nombre.
            </li>
          )}
        </ul>
        {at && selected && <Preview key={childPath(at.path, selected)} origin={x.origin} path={childPath(at.path, selected)} open={open} />}
      </div>
    </div>
  );
}

/** The selected file as the viewer would show it (its first 256 KB of text), with «Abrir». */
function Preview({ origin, path, open }: { origin: FileOrigin; path: string; open: (path: string) => void }) {
  const f = useFile(origin, path, PREVIEW_MAX);
  return (
    <section class="explorer-preview" aria-label={`Vista previa de ${f.name}`}>
      <div class="explorer-preview-head">
        <span class="project-name">{f.name}</span>
        <button class="btn" onClick={() => open(path)}>
          Abrir
        </button>
      </div>
      <FileBody f={f} more="«Abrir» lo enseña entero." />
    </section>
  );
}

/** The explorer as a screen of the file viewer: its title is the folder shown. */
export function ExplorerView({ origin, path, layer, open }: { origin: FileOrigin; path: string; layer: Layer; open: (path: string) => void }) {
  const x = useExplorer(origin, path);
  return (
    <Sheet title={x.at?.path ?? 'Explorador'} {...layer} class="file-sheet explorer-sheet">
      <Explorer x={x} open={open} fill />
    </Sheet>
  );
}
