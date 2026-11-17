import { signal } from '@preact/signals';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { GitChange, GitChanges, GitDiffMode, GitStat, HostInfo, WindowInfo } from '../../../shared/types';
import { toast } from '../state';
import { Sheet } from './Sheet';
import { fileViewer, fileViewerBack, pushFileScreen, type FileOrigin, type FileScreen } from '../fileViewer';

export { fileViewer, type FileOrigin };
import { IconFileDiff, IconReload } from './icons';

// The file viewer: a path tapped in the terminal (an image, a PDF, Markdown rendered, any
// other text with its lines), the changed files of the window's repo, and their diff.

/** Opened from the terminal, which keeps the focus: Escape would reach Claude (and stop it) instead of closing the viewer. */
function leaveTerminal(): void {
  (document.activeElement as HTMLElement | null)?.blur?.();
}

export function openFile(origin: FileOrigin, path: string, line?: number): void {
  leaveTerminal();
  fileViewer.value = { origin, stack: [{ kind: 'file', path, line }] };
}

/** What «Ficheros cambiados» is filtered by: kept going into a diff and back, cleared when it opens again. */
const changesQuery = signal('');
/** The tab chosen in «Ficheros cambiados» (until then the hub picks one), kept like the filter. */
const changesMode = signal<GitDiffMode | undefined>(undefined);
/** The branch of origin «Toda la rama» compares with ('': the one the branch started from), kept like the filter. */
const changesBase = signal('');
/**
 * What the branch choice offers, from the last answer, kept like the filter: when a picked
 * branch is gone or has no history in common, the choice stays to pick another one.
 */
const changesChoice = signal<Pick<GitChanges, 'defaultBase' | 'branches'> | null>(null);

/** Lower case and without accents, to search. */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export function openChanges(origin: FileOrigin, mode?: GitDiffMode): void {
  leaveTerminal();
  changesQuery.value = '';
  changesMode.value = mode;
  changesBase.value = '';
  changesChoice.value = null;
  fileViewer.value = { origin, stack: [{ kind: 'changes' }] };
}

/**
 * For each screen, by its depth, the element that had the focus when the screen above it
 * opened: it gets the focus back when that screen closes. Read as the screen opens, since
 * the screen below turns inert right after and the browser takes the focus away from it.
 */
const openers: (HTMLElement | null)[] = [];

function push(screen: FileScreen): void {
  const v = fileViewer.value;
  if (!v) return;
  const a = document.activeElement;
  openers[v.stack.length - 1] = a instanceof HTMLElement && a !== document.body ? a : null;
  pushFileScreen(screen);
}
const pop = fileViewerBack;

const IMAGE = /\.(png|jpe?g|gif|webp|avif|bmp|ico|svg)$/i;
const MARKDOWN = /\.(md|markdown|mdx)$/i;
const PDF = /\.pdf$/i;
const VIDEO = /\.(mp4|m4v|mov|webm|mkv|ogv)$/i;
const AUDIO = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac)$/i;

const qs = (o: Record<string, string | undefined>) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join('&');

const fileUrl = (o: FileOrigin, path: string) => `/api/files?${qs({ host: o.host, window: o.window, pane: o.pane, path })}`;

async function fetchText(url: string, signal?: AbortSignal): Promise<{ text: string; path?: string; size?: number }> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Error ${res.status}`);
  const path = res.headers.get('X-File-Path');
  const size = Number(res.headers.get('X-File-Size'));
  return { text: await res.text(), path: path ? decodeURIComponent(path) : undefined, size: Number.isFinite(size) ? size : undefined };
}

/** Whether it is there, and its whole path and size (without reading it). */
export async function probeFile(o: FileOrigin, path: string, signal?: AbortSignal): Promise<{ path: string; size: number }> {
  const res = await fetch(`${fileUrl(o, path)}&probe=1`, { signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
  return data as { path: string; size: number };
}

/** The viewer reads this much of a text file; «Abrir aparte» gets all of it. */
const TEXT_MAX = 2 * 1024 * 1024;

/** «840 KB», «23,4 MB». */
export function fileSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toLocaleString('es-ES', { maximumFractionDigits: n < 100 * 1024 * 1024 ? 1 : 0 })} MB`;
}

export const fileKind = (path: string) =>
  IMAGE.test(path) ? 'image' : PDF.test(path) ? 'pdf' : VIDEO.test(path) ? 'video' : AUDIO.test(path) ? 'audio' : MARKDOWN.test(path) ? 'markdown' : 'text';
/** Whether the browser shows it from its URL (an image, a PDF, a video, sound), instead of the viewer reading its text. */
export const isMedia = (kind: ReturnType<typeof fileKind>) => kind !== 'markdown' && kind !== 'text';
/** Whether what was read as text is not: a NUL byte gives away a binary file (an archive, a program, a video named otherwise). */
export const isBinary = (text: string) => text.includes('\0');
export { fileUrl };

/**
 * Every screen of the stack, each in a sheet over the one it was opened from: the ones
 * below stay mounted (their content, filter and scroll kept, nothing asked again) and
 * inert, and closing the one on top by any means goes back one screen.
 */
export function FileViewerSheet() {
  const v = fileViewer.value;
  const top = (v?.stack.length ?? 0) - 1;
  const was = useRef(top);
  // Back one screen: the focus goes back to what opened the one that closed. After the
  // sheets' own effects, so the one below is no longer inert and can take it.
  useEffect(() => {
    const opener = top >= 0 && top < was.current ? openers[top] : null;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    was.current = top;
  }, [top]);
  if (!v) return null;
  return (
    <>
      {v.stack.map((screen, i) => {
        const layer: Layer = { back: i > 0 ? { label: 'Atrás', onClick: pop } : undefined, stacked: i > 0, inert: i < top, onClose: pop };
        if (screen.kind === 'changes') return <ChangesView key={`${i}:changes`} origin={v.origin} layer={layer} />;
        if (screen.kind === 'diff') return <DiffView key={`${i}:diff:${screen.file.path}`} origin={v.origin} changes={screen.changes} file={screen.file} layer={layer} />;
        return <FileView key={`${i}:file:${screen.path}`} origin={v.origin} path={screen.path} line={screen.line} layer={layer} />;
      })}
    </>
  );
}

/** How a screen's sheet sits in the stack, passed on to its `Sheet` as is. */
interface Layer {
  back?: { label: string; onClick: () => void };
  stacked: boolean;
  inert: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------- a file

function FileView({ origin, path, line, layer }: { origin: FileOrigin; path: string; line?: number; layer: Layer }) {
  const url = fileUrl(origin, path);
  const name = path.split('/').pop() ?? path;
  const kind = fileKind(path);
  const [text, setText] = useState<string | null>(null);
  const [size, setSize] = useState<number | null>(null);
  const [abs, setAbs] = useState<string>(path);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState(false);
  const [found, setFound] = useState(false);
  const binary = text !== null && isBinary(text);

  useEffect(() => {
    // Images, PDFs, videos and sound load from the URL itself; asking first only says whether it is there.
    if (isMedia(kind)) {
      probeFile(origin, path).then(
        (r) => {
          setAbs(r.path);
          setSize(r.size);
          setFound(true);
        },
        (err: Error) => setError(err.message),
      );
      return;
    }
    // A big text file: its beginning (a cut line or character at the end does not matter).
    fetchText(`${url}&max=${TEXT_MAX}`).then(
      (r) => {
        setText(r.text);
        if (r.path) setAbs(r.path);
        if (r.size !== undefined) setSize(r.size);
      },
      (err: Error) => setError(err.message),
    );
  }, [url]);

  return (
    <Sheet title={name} subtitle={size !== null ? `${abs} · ${fileSize(size)}` : abs} {...layer} class="file-sheet">
      <div class="file-actions">
        {kind === 'markdown' && text !== null && !binary && (
          <button class="btn" onClick={() => setRaw(!raw)}>
            {raw ? 'Ver renderizado' : 'Ver el texto'}
          </button>
        )}
        {binary ? (
          <a class="btn" href={url} download={name}>
            Descargar
          </a>
        ) : (
          <a class="btn" href={url} target="_blank" rel="noreferrer">
            Abrir aparte
          </a>
        )}
      </div>
      {text !== null && !binary && size !== null && size > TEXT_MAX && (
        <p class="settings-state small">
          Solo los primeros {fileSize(TEXT_MAX)} de {fileSize(size)}: «Abrir aparte» lo trae entero.
        </p>
      )}
      {error ? (
        <p class="settings-state">{error}</p>
      ) : isMedia(kind) && !found ? (
        <p class="dim pad">Cargando…</p>
      ) : kind === 'image' ? (
        <div class="file-image">
          <img src={url} alt={name} />
        </div>
      ) : kind === 'pdf' ? (
        <iframe class="file-pdf" src={url} title={name} />
      ) : kind === 'video' ? (
        <video class="file-video" src={url} controls playsInline preload="metadata" />
      ) : kind === 'audio' ? (
        <audio class="file-audio" src={url} controls preload="metadata" />
      ) : text === null ? (
        <p class="dim pad">Cargando…</p>
      ) : binary ? (
        <p class="settings-state">No es un fichero de texto{size !== null ? ` (${fileSize(size)})` : ''}: aquí no se puede ver.</p>
      ) : kind === 'markdown' && !raw ? (
        <Markdown text={text} />
      ) : (
        <CodeLines text={text} line={line} />
      )}
    </Sheet>
  );
}

/** Rendered with marked and cleaned up with DOMPurify, both loaded the first time (they are not needed until then). */
export async function renderMarkdown(text: string): Promise<string> {
  const [{ marked }, { default: DOMPurify }] = await Promise.all([import('marked'), import('dompurify')]);
  return DOMPurify.sanitize(marked.parse(text, { async: false, gfm: true }) as string);
}

function Markdown({ text }: { text: string }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    renderMarkdown(text).then(setHtml, () => setHtml(null));
  }, [text]);
  if (html === null) return <p class="dim pad">Cargando…</p>;
  // Links of the document open apart, never inside the panel.
  return (
    <div
      class="markdown"
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest('a');
        if (!a) return;
        e.preventDefault();
        if (/^https?:/.test(a.href)) window.open(a.href, '_blank', 'noopener,noreferrer');
      }}
    />
  );
}

const MAX_LINES = 20_000;

/** Text with its line numbers; `line` scrolled to and marked. */
function CodeLines({ text, line }: { text: string; line?: number }) {
  const lines = useMemo(() => text.replace(/\n$/, '').split('\n'), [text]);
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => target.current?.scrollIntoView({ block: 'center' }), [line, lines]);
  const shown = lines.slice(0, MAX_LINES);
  return (
    <div class="code-view">
      {shown.map((l, i) => (
        <div key={i} ref={line === i + 1 ? target : undefined} class={`code-line ${line === i + 1 ? 'hit' : ''}`}>
          <span class="code-num">{i + 1}</span>
          <span class="code-text">{l || ' '}</span>
        </div>
      ))}
      {lines.length > MAX_LINES && <p class="dim pad">… y {lines.length - MAX_LINES} líneas más: «Abrir aparte» lo enseña entero.</p>}
    </div>
  );
}

// ---------------------------------------------------------------- changed files

const STATUS: Record<GitChange['status'], string> = { M: 'Modificado', A: 'Nuevo', D: 'Borrado', R: 'Renombrado', '?': 'Sin seguimiento', U: 'En conflicto' };

function ChangesView({ origin, layer }: { origin: FileOrigin; layer: Layer }) {
  /** The tab chosen; until then the hub picks one, and the answer says which. */
  const asked = changesMode.value;
  const picked = changesBase.value;
  const choice = changesChoice.value;
  const [changes, setChanges] = useState<GitChanges | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mode = asked ?? changes?.mode ?? 'head';
  /** The request on its way: a newer one aborts it, so a late answer never shows. */
  const inFlight = useRef<AbortController | null>(null);
  const load = () => {
    inFlight.current?.abort();
    const ctl = (inFlight.current = new AbortController());
    setLoading(true);
    setError(null);
    fetch(`/api/git/changes?${qs({ host: origin.host, window: origin.window, pane: origin.pane, mode: asked, base: asked === 'branch' ? picked : undefined })}`, {
      signal: ctl.signal,
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
        if (ctl.signal.aborted) return;
        const c = data as GitChanges;
        setChanges(c);
        changesChoice.value = { defaultBase: c.defaultBase, branches: c.branches };
      })
      .catch((err: Error) => {
        if (ctl.signal.aborted) return;
        setChanges(null);
        setError(err.message);
      })
      .finally(() => !ctl.signal.aborted && setLoading(false));
  };
  useEffect(() => {
    load();
    return () => inFlight.current?.abort();
  }, [asked, picked]);

  // The branches to pick besides the one it started from; a picked one that is gone stays, selected.
  const others = (choice?.branches ?? []).filter((b) => `origin/${b}` !== choice?.defaultBase);
  if (picked && !others.includes(picked)) others.push(picked);
  /** What the list should compare with now: a list of another one is not shown as this one's. */
  const want = picked ? `origin/${picked}` : choice?.defaultBase;
  const stale = !!changes && (changes.mode !== mode || (mode === 'branch' && changes.base?.ref !== want));
  const subtitle = changes ? `${changes.branch}${changes.base && mode === 'branch' ? ` · desde ${changes.base.ref}` : ''} · ${changes.root}` : undefined;
  // Every word has to be in the path (or the old one of a rename), in any order: «comp dial» finds components/Dialogs.tsx.
  const words = fold(changesQuery.value).split(/\s+/).filter(Boolean);
  const files = (changes?.files ?? []).filter((f) => {
    const hay = fold(`${f.path} ${f.from ?? ''}`);
    return words.every((w) => hay.includes(w));
  });
  return (
    <Sheet title="Ficheros cambiados" subtitle={subtitle} {...layer} class="file-sheet">
      <div class="file-actions">
        <div class="seg" role="radiogroup" aria-label="Comparar con">
          {(
            [
              ['head', 'Sin commit'],
              ['branch', 'Toda la rama'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} role="radio" aria-checked={mode === k} class={mode === k ? 'on' : ''} onClick={() => (changesMode.value = k)}>
              {label}
            </button>
          ))}
        </div>
        <button class="icon-btn" aria-label="Volver a mirar" title="Volver a mirar" disabled={loading} onClick={load}>
          <IconReload />
        </button>
      </div>
      {mode === 'branch' && choice?.defaultBase && others.length > 0 && (
        <select
          class="text-input changes-base"
          aria-label="Comparar con la rama"
          value={picked}
          onChange={(e) => {
            // The tab too: «auto» is the whole branch here, and has to stay so when the list comes back.
            changesMode.value = 'branch';
            changesBase.value = e.currentTarget.value;
          }}
        >
          <option value="">{choice.defaultBase}</option>
          {others.map((b) => (
            <option key={b} value={b}>
              origin/{b}
            </option>
          ))}
        </select>
      )}
      {!!changes?.files.length && (
        <input
          class="text-input changes-search"
          type="search"
          value={changesQuery.value}
          placeholder={`Buscar entre los ${changes.files.length} ficheros`}
          aria-label="Buscar un fichero"
          autocomplete="off"
          spellcheck={false}
          onInput={(e) => (changesQuery.value = e.currentTarget.value)}
        />
      )}
      {error ? (
        <p class="settings-state">{error}</p>
      ) : !changes || (loading && stale) ? (
        <p class="dim pad">Cargando…</p>
      ) : !changes.files.length ? (
        <p class="dim pad">{mode === 'head' ? 'Nada sin commit.' : `Esta rama no tiene cambios respecto a ${changes.base?.ref ?? 'la principal'}.`}</p>
      ) : !files.length ? (
        <p class="dim pad">Ningún fichero cambiado coincide.</p>
      ) : (
        <ul class="menu">
          {words.length > 0 && (
            <li class="dim small changes-found">
              {files.length} de {changes.files.length} ficheros
            </li>
          )}
          {files.map((f) => {
            const slash = f.path.lastIndexOf('/');
            return (
              <li key={f.path}>
                <button class="menu-item" onClick={() => push({ kind: 'diff', changes, file: f })}>
                  <span class={`git-badge git-${f.status === '?' ? 'u' : f.status.toLowerCase()}`} title={STATUS[f.status]}>
                    {f.status === '?' ? 'N' : f.status}
                  </span>
                  <span class="project-text">
                    <span class="project-name">{f.path.slice(slash + 1)}</span>
                    <span class="project-hint">
                      {slash > 0 ? f.path.slice(0, slash) : 'En la raíz del repo'}
                      {f.from ? ` · antes ${f.from}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- a diff

interface DiffRow {
  kind: 'hunk' | 'add' | 'del' | 'ctx' | 'meta';
  text: string;
  old?: number;
  new?: number;
}

function parseDiff(diff: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let o = 0;
  let n = 0;
  let inHunk = false;
  for (const l of diff.split('\n')) {
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(l);
    if (h) {
      o = Number(h[1]);
      n = Number(h[2]);
      inHunk = true;
      rows.push({ kind: 'hunk', text: l });
    } else if (!inHunk) {
      if (/^(Binary files|similarity|rename|new file|deleted file)/.test(l)) rows.push({ kind: 'meta', text: l });
    } else if (l.startsWith('+')) rows.push({ kind: 'add', text: l.slice(1), new: n++ });
    else if (l.startsWith('-')) rows.push({ kind: 'del', text: l.slice(1), old: o++ });
    else if (l.startsWith(' ')) rows.push({ kind: 'ctx', text: l.slice(1), old: o++, new: n++ });
    else if (l.startsWith('\\')) rows.push({ kind: 'meta', text: l });
    else if (l.startsWith('diff --git')) inHunk = false;
  }
  return rows;
}

function DiffView({ origin, changes, file, layer }: { origin: FileOrigin; changes: GitChanges; file: GitChange; layer: Layer }) {
  const [rows, setRows] = useState<DiffRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchText(`/api/git/diff?${qs({ host: origin.host, root: changes.root, file: file.path, mode: changes.mode, base: changes.base?.commit })}`).then(
      (r) => setRows(parseDiff(r.text)),
      (err: Error) => setError(err.message),
    );
  }, [file.path, changes.mode]);
  const adds = rows?.filter((r) => r.kind === 'add').length ?? 0;
  const dels = rows?.filter((r) => r.kind === 'del').length ?? 0;
  const full = `${changes.root}/${file.path}`;
  return (
    <Sheet title={file.path.split('/').pop() ?? file.path} subtitle={`${file.path} · ${STATUS[file.status]}${rows ? ` · +${adds} −${dels}` : ''}`} {...layer} class="file-sheet">
      <div class="file-actions">
        {file.status !== 'D' && (
          <button class="btn" onClick={() => push({ kind: 'file', path: full })}>
            Ver el fichero
          </button>
        )}
        <button
          class="btn"
          onClick={() =>
            navigator.clipboard.writeText(full).then(
              () => toast('Ruta copiada'),
              () => toast('No se pudo copiar', 'error'),
            )
          }
        >
          Copiar la ruta
        </button>
      </div>
      {error ? (
        <p class="settings-state">{error}</p>
      ) : !rows ? (
        <p class="dim pad">Cargando…</p>
      ) : !rows.length ? (
        <p class="dim pad">Sin diferencias de texto.</p>
      ) : (
        <div class="code-view diff-view">
          {rows.map((r, i) =>
            r.kind === 'hunk' || r.kind === 'meta' ? (
              <div key={i} class={`diff-${r.kind}`}>
                {r.text}
              </div>
            ) : (
              <div key={i} class={`code-line diff-${r.kind}`}>
                <span class="code-num">{r.old ?? ''}</span>
                <span class="code-num">{r.new ?? ''}</span>
                <span class="diff-sign">{r.kind === 'add' ? '+' : r.kind === 'del' ? '−' : ' '}</span>
                <span class="code-text">{r.text || ' '}</span>
              </div>
            ),
          )}
        </div>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- the window's ± button

/** «12», «1,2k». */
function count(n: number): string {
  return n < 1000 ? String(n) : `${(n / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })}k`;
}

/**
 * Next to the window's ··· : the lines added and removed in its repo since HEAD, read
 * when the window opens, every 15 s while it is on screen and when its Claude changes
 * state. Opens «Ficheros cambiados». Not shown outside a repo.
 */
export function ChangesButton({ host, window, paneId }: { host: HostInfo; window: WindowInfo; paneId?: string }) {
  const [stat, setStat] = useState<GitStat | null>(null);
  const origin: FileOrigin = { host: host.id, window: window.id, pane: paneId };
  useEffect(() => {
    let alive = true;
    const ctl = new AbortController();
    const load = () => {
      if (document.hidden) return;
      fetch(`/api/git/stat?${qs({ host: origin.host, window: origin.window, pane: origin.pane })}`, { signal: ctl.signal })
        .then((res) => (res.ok ? res.json() : null))
        .then((s: GitStat | null) => alive && setStat(s), () => {});
    };
    load();
    const t = setInterval(load, 15_000);
    document.addEventListener('visibilitychange', load);
    return () => {
      alive = false;
      ctl.abort();
      clearInterval(t);
      document.removeEventListener('visibilitychange', load);
    };
  }, [host.id, window.id, paneId, window.state, host.status]);
  if (!stat) return null;
  const clean = !stat.added && !stat.removed && !stat.files;
  const since = stat.mode === 'branch' ? `desde ${stat.base ?? 'su rama base'}` : 'sin commit';
  const label = clean ? `Ficheros cambiados (${since}): ninguno` : `Ficheros cambiados (${since}): ${stat.files}, +${stat.added} −${stat.removed} líneas`;
  return (
    <button class={`changes-btn ${clean ? 'clean' : ''}`} aria-label={label} title={label} onClick={() => openChanges(origin, stat.mode)}>
      {clean ? (
        <IconFileDiff />
      ) : (
        <>
          <span class="changes-add">+{count(stat.added)}</span>
          <span class="changes-del">−{count(stat.removed)}</span>
        </>
      )}
    </button>
  );
}
