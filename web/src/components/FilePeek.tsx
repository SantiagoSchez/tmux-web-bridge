import { signal } from '@preact/signals';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { fileKind, fileSize, fileUrl, probeFile, renderMarkdown, type FileOrigin } from './Files';

// A preview of a file path under the mouse in the terminal, as a floating thumbnail next
// to it: the image, the first lines (or those around the line given), or the Markdown
// rendered. Only with a mouse; a click still opens the viewer.

interface Peek {
  origin: FileOrigin;
  path: string;
  line?: number;
  x: number;
  y: number;
}

const peek = signal<Peek | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;

/** Only devices with a real hover (a mouse or a trackpad). */
const canHover = matchMedia('(any-hover: hover)');

/** Shown after a moment on the path, so moving the mouse across the terminal does not flash previews. */
export function peekFile(origin: FileOrigin, path: string, line: number | undefined, e: MouseEvent): void {
  if (!canHover.matches) return;
  clearTimeout(timer);
  const at = { x: e.clientX, y: e.clientY };
  timer = setTimeout(() => (peek.value = { origin, path, line, ...at }), 350);
}

export function hidePeek(): void {
  clearTimeout(timer);
  peek.value = null;
}

interface PeekData {
  path: string;
  size: number;
  text?: string;
}

/** What a preview read, for a minute: going back over the same path shows it at once. */
const cache = new Map<string, { at: number; data: Promise<PeekData> }>();
/** Previews of images bigger than this only say so: loading one would be slow. */
const IMAGE_MAX = 15 * 1024 * 1024;
const LINES = 14;

function load(o: FileOrigin, path: string, line?: number): Promise<PeekData> {
  const key = `${o.host}\n${o.window ?? ''}\n${path}\n${line ?? ''}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.data;
  const data = (async () => {
    const info = await probeFile(o, path);
    const kind = fileKind(path);
    if (kind === 'image' || kind === 'pdf') return info;
    // Enough of it to reach the line asked for (at most 512 KB in).
    const want = line ? Math.min(512 * 1024, 200 * (line + LINES)) : 16 * 1024;
    const res = await fetch(`${fileUrl(o, path)}&max=${Math.max(want, 16 * 1024)}`);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Error ${res.status}`);
    return { ...info, text: await res.text() };
  })();
  cache.set(key, { at: Date.now(), data });
  data.catch(() => cache.delete(key));
  return data;
}

export function FilePeek() {
  const p = peek.value;
  // Anything else the mouse or the keyboard does closes it.
  useEffect(() => {
    if (!p) return;
    const off = () => hidePeek();
    addEventListener('mousedown', off, true);
    addEventListener('keydown', off, true);
    addEventListener('wheel', off, { capture: true, passive: true });
    addEventListener('blur', off);
    return () => {
      removeEventListener('mousedown', off, true);
      removeEventListener('keydown', off, true);
      removeEventListener('wheel', off, true);
      removeEventListener('blur', off);
    };
  }, [p]);
  if (!p) return null;
  return <PeekCard key={`${p.path}:${p.line ?? ''}`} p={p} />;
}

function PeekCard({ p }: { p: Peek }) {
  const [data, setData] = useState<PeekData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: p.x + 14, top: p.y + 18 });
  const kind = fileKind(p.path);

  useEffect(() => {
    load(p.origin, p.path, p.line).then(
      (d) => {
        setData(d);
        if (kind === 'markdown' && d.text !== undefined && !p.line) renderMarkdown(d.text.slice(0, 6000)).then(setHtml, () => {});
      },
      (err: Error) => setError(err.message),
    );
  }, []);

  // Next to the mouse, flipped to the other side when it would go off the screen.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = p.x + 14 + width > innerWidth - 8 ? Math.max(8, p.x - 14 - width) : p.x + 14;
    const top = p.y + 18 + height > innerHeight - 8 ? Math.max(8, p.y - 12 - height) : p.y + 18;
    if (left !== pos.left || top !== pos.top) setPos({ left, top });
  });

  const name = p.path.split('/').pop() ?? p.path;
  let body;
  if (error) body = <p class="peek-note">{error}</p>;
  else if (!data) body = <p class="peek-note">Cargando…</p>;
  else if (kind === 'image')
    body = data.size > IMAGE_MAX ? <p class="peek-note">Imagen de {fileSize(data.size)}: clic para verla.</p> : <img class="peek-image" src={fileUrl(p.origin, p.path)} alt={name} />;
  else if (kind === 'pdf') body = <p class="peek-note">PDF de {fileSize(data.size)}: clic para abrirlo.</p>;
  else if (html !== null) body = <div class="markdown peek-md" dangerouslySetInnerHTML={{ __html: html }} />;
  else {
    const lines = (data.text ?? '').split('\n');
    const from = p.line ? Math.max(0, p.line - 4) : 0;
    const shown = lines.slice(from, from + LINES);
    body =
      p.line && p.line > lines.length ? (
        <p class="peek-note">La línea {p.line} queda más abajo: clic para abrirlo.</p>
      ) : (
        <div class="code-view peek-code">
          {shown.map((l, i) => (
            <div key={i} class={`code-line ${p.line === from + i + 1 ? 'hit' : ''}`}>
              <span class="code-num">{from + i + 1}</span>
              <span class="code-text">{l || ' '}</span>
            </div>
          ))}
        </div>
      );
  }

  return (
    <div class="file-peek" ref={box} style={{ left: `${pos.left}px`, top: `${pos.top}px` }} role="tooltip">
      <div class="peek-head">
        <span class="peek-name">{name}</span>
        {data && <span class="peek-size">{fileSize(data.size)}</span>}
      </div>
      {body}
    </div>
  );
}
