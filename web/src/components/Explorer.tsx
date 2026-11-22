import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { childPath } from '../../../shared/folders';
import type { DirListing } from '../../../shared/types';
import { api } from '../api';
import { explorerPreviews, type ExplorerPreview, type FileOrigin, type FileScreen } from '../fileViewer';
import { fold } from '../text';
import { FileBody, fileSize, qs, useFile, type Layer } from './Files';
import { FileTypeIcon, IconClose, IconFolder } from './icons';
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
 * `owner` is the layer that holds the explorer (see ExplorerPreview): the back button
 * closes the preview before it.
 */
export function useExplorer(origin: FileOrigin, owner: unknown, start = '~') {
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
  const selectedNow = useRef(selected);
  selectedNow.current = selected;

  /** No file selected, and the focus on the row of the one that was (the ✕ that had it is gone). */
  const closePreview = () => {
    const name = selectedNow.current;
    setSelected(null);
    if (name !== null) listRef.current?.querySelector<HTMLElement>(`[data-file="${CSS.escape(name)}"]`)?.focus();
  };
  /** Tapping a file previews it; tapping the one previewed closes the preview. */
  const toggle = (name: string) => (name === selected ? closePreview() : setSelected(name));

  // A layer of the back button while a file is selected; moving to another file keeps it.
  const previewing = selected !== null;
  useLayoutEffect(() => {
    if (!previewing) return;
    const mine: ExplorerPreview = { owner, close: closePreview };
    explorerPreviews.value = [...explorerPreviews.value, mine];
    return () => void (explorerPreviews.value = explorerPreviews.value.filter((p) => p !== mine));
  }, [previewing, owner]);

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
  return { origin, at, path, setPath, busy, error, go, typed, here, query, setQuery, hidden, setHidden, selected, toggle, closePreview, listRef };
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
  const root = useRef<HTMLDivElement>(null);
  const previewing = !!(at && selected);
  useEffect(() => {
    if (!previewing) return;
    // Escape closes the preview, not the sheet: caught on its way down, before the
    // sheet's own listener, and only in the sheet on top (the one Escape would close).
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const mine = root.current?.closest<HTMLElement>('.sheet-backdrop');
      if (!mine || mine.inert || [...document.querySelectorAll('.sheet-backdrop')].pop() !== mine) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      x.closePreview();
    };
    addEventListener('keydown', onKey, true);
    return () => removeEventListener('keydown', onKey, true);
  }, [previewing]);
  return (
    <div class={`explorer ${fill ? 'fill' : ''} ${previewing ? 'has-preview' : ''}`} ref={root}>
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
              <button class="menu-item" data-file={f.name} aria-pressed={selected === f.name} onClick={() => x.toggle(f.name)}>
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
        {at && selected && <Preview key={childPath(at.path, selected)} origin={x.origin} path={childPath(at.path, selected)} open={open} close={x.closePreview} />}
      </div>
    </div>
  );
}

/** The selected file as the viewer would show it (its first 256 KB of text), with «Abrir» and ✕. */
function Preview({ origin, path, open, close }: { origin: FileOrigin; path: string; open: (path: string) => void; close: () => void }) {
  const f = useFile(origin, path, PREVIEW_MAX);
  return (
    <section class="explorer-preview" aria-label={`Vista previa de ${f.name}`}>
      <div class="explorer-preview-head">
        <span class="project-name">{f.name}</span>
        <button class="btn" onClick={() => open(path)}>
          Abrir
        </button>
        <button class="icon-btn" aria-label="Cerrar la vista previa" title="Cerrar la vista previa" onClick={close}>
          <IconClose />
        </button>
      </div>
      <FileBody f={f} more="«Abrir» lo enseña entero." />
    </section>
  );
}

/** The explorer as a screen of the file viewer (`screen`, which owns its preview): its title is the folder shown. */
export function ExplorerView({ origin, screen, layer, open }: { origin: FileOrigin; screen: Extract<FileScreen, { kind: 'dir' }>; layer: Layer; open: (path: string) => void }) {
  const x = useExplorer(origin, screen, screen.path);
  return (
    <Sheet title={x.at?.path ?? 'Explorador'} {...layer} class="file-sheet explorer-sheet">
      <Explorer x={x} open={open} fill />
    </Sheet>
  );
}
