import { useEffect, useRef, useState } from 'preact/hooks';
import {
  DEFAULT_KEYBAR,
  defaultLabel,
  describe,
  isKeyChar,
  isKeyName,
  KEYBAR_MAX,
  KEYBAR_SCALE_DEFAULT,
  KEYBAR_SCALE_MAX,
  KEYBAR_SCALE_MIN,
  KEYBAR_SCALE_STEP,
  KEYS,
  LABEL_MAX,
  SPECIALS,
  TEXT_MAX,
  type KeybarButton,
  type KeyName,
} from '../../../shared/keybar';
import { hubSettings } from '../state';
import { IconClose, IconGrip } from './icons';
import { hub } from '../ws';

/** Saved for the whole hub; shown here at once, before the hub sends it back to every device. */
function save(keybar: KeybarButton[]): void {
  const s = hubSettings.value;
  if (s) hubSettings.value = { ...s, keybar };
  hub.send({ t: 'settings', settings: { keybar } });
}

function saveScale(keybarScale: number): void {
  const s = hubSettings.value;
  if (s) hubSettings.value = { ...s, keybarScale };
  hub.send({ t: 'settings', settings: { keybarScale } });
}

function moved<T>(list: T[], from: number, to: number): T[] {
  const out = [...list];
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}

function chipLabel(b: KeybarButton): string {
  return b.label || defaultLabel(b) || '^B';
}

function valid(b: KeybarButton): boolean {
  if (b.kind === 'key') return isKeyName(b.key) || isKeyChar(b.key);
  if (b.kind === 'text') return b.text.length > 0;
  return true;
}

/** Ready-made buttons to add: the default bar's, and the other keys. */
const PRESETS: KeybarButton[] = [
  ...DEFAULT_KEYBAR,
  ...(Object.keys(KEYS) as KeyName[])
    .filter((k) => !DEFAULT_KEYBAR.some((b) => b.kind === 'key' && b.key === k))
    .map((k): KeybarButton => ({ kind: 'key', label: '', key: k })),
];

/** How close to the sheet's edge a dragged row scrolls it. */
const EDGE = 56;
/** The gap between rows (.kb-list). */
const GAP = 6;

interface Drag {
  pointer: number;
  from: number;
  to: number;
  /** Where the finger started, on screen and in the sheet's scrolled content. */
  downY: number;
  startY: number;
  y: number;
  /** The rows' middles and the dragged one's height, measured once it is down. */
  mids: number[] | null;
  height: number;
  frame: number;
}

/** The phone's key bar, for the whole hub: reordered by dragging, each button editable. */
export function KeybarSettings() {
  const s = hubSettings.value;
  const list = s?.keybar ?? DEFAULT_KEYBAR;
  const [open, setOpen] = useState<number | 'new' | null>(null);
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState(false);
  /** The rows stay where they are in the DOM while dragging: they only slide (transform). */
  const [drag, setDrag] = useState<{ from: number; to: number; dy: number; height: number } | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const dragRef = useRef<Drag | null>(null);

  useEffect(() => () => cancelAnimationFrame(dragRef.current?.frame ?? 0), []);
  if (!s) return null;

  const scroller = () => listRef.current?.closest('.sheet') ?? null;
  const follow = () => {
    const d = dragRef.current;
    const rows = listRef.current?.children;
    if (!d || !rows) return;
    const sc = scroller();
    const top = sc?.scrollTop ?? 0;
    if (!d.mids) {
      // After the render that closed any open editor: the rows as they are now.
      const boxes = [...rows].map((r) => r.getBoundingClientRect());
      d.mids = boxes.map((b) => b.top + top + b.height / 2);
      d.height = boxes[d.from]?.height ?? 0;
    }
    // Near an edge, scrolls towards where the finger is heading (grabbing a row by the edge does not).
    if (sc) {
      const b = sc.getBoundingClientRect();
      if (d.y < b.top + EDGE && d.y < d.downY - 12) sc.scrollTop -= 8;
      else if (d.y > b.bottom - EDGE && d.y > d.downY + 12) sc.scrollTop += 8;
    }
    const dy = d.y + (sc?.scrollTop ?? 0) - d.startY;
    const centre = d.mids[d.from] + dy;
    const to = d.mids.filter((m, j) => j !== d.from && m < centre).length;
    d.to = to;
    setDrag({ from: d.from, to, dy, height: d.height });
    d.frame = requestAnimationFrame(follow);
  };
  const grab = (e: PointerEvent, i: number) => {
    if (e.button !== 0 || dragRef.current) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setOpen(null);
    setAdding(false);
    dragRef.current = { pointer: e.pointerId, from: i, to: i, downY: e.clientY, startY: e.clientY + (scroller()?.scrollTop ?? 0), y: e.clientY, mids: null, height: 0, frame: 0 };
    setDrag({ from: i, to: i, dy: 0, height: 0 });
    dragRef.current.frame = requestAnimationFrame(follow);
  };
  const moveDrag = (e: PointerEvent) => {
    const d = dragRef.current;
    if (d && e.pointerId === d.pointer) d.y = e.clientY;
  };
  const drop = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointer) return;
    cancelAnimationFrame(d.frame);
    dragRef.current = null;
    setDrag(null);
    if (e.type !== 'pointercancel' && d.to !== d.from) save(moved(list, d.from, d.to));
  };
  /** How far a row slides to make room for the dragged one. */
  const slide = (i: number): number => {
    if (!drag) return 0;
    if (i === drag.from) return drag.dy;
    const pitch = drag.height + GAP;
    if (drag.from < i && i <= drag.to) return -pitch;
    if (drag.to <= i && i < drag.from) return pitch;
    return 0;
  };
  const shown = drag ? moved(list, drag.from, drag.to) : list;

  const update = (i: number, b: KeybarButton) => {
    save(list.map((x, j) => (j === i ? b : x)));
    setOpen(null);
  };
  const remove = (i: number) => {
    save(list.filter((_, j) => j !== i));
    setOpen(null);
  };
  const add = (b: KeybarButton) => {
    save([...list, b]);
    setAdding(false);
    setOpen(null);
  };
  const full = list.length >= KEYBAR_MAX;
  const scale = s.keybarScale ?? KEYBAR_SCALE_DEFAULT;

  return (
    <>
      <p class="settings-scope dim small">Valen para todas las máquinas y todos los dispositivos. La barra sale bajo la terminal en las pantallas táctiles.</p>
      <div class="kb-size">
        <span class="kb-size-label">Tamaño de los botones</span>
        <div class="view-tools">
          {scale !== KEYBAR_SCALE_DEFAULT && (
            <button onClick={() => saveScale(KEYBAR_SCALE_DEFAULT)} title="Volver al tamaño normal">
              {KEYBAR_SCALE_DEFAULT} %
            </button>
          )}
          <button onClick={() => saveScale(scale - KEYBAR_SCALE_STEP)} disabled={scale <= KEYBAR_SCALE_MIN} aria-label="Botones más pequeños">
            −
          </button>
          <span class="font-size-value kb-size-value" aria-live="polite">
            {scale} %
          </span>
          <button onClick={() => saveScale(scale + KEYBAR_SCALE_STEP)} disabled={scale >= KEYBAR_SCALE_MAX} aria-label="Botones más grandes">
            +
          </button>
        </div>
      </div>
      <div class="kb-preview scroll-x" aria-label="Vista previa de la barra" style={{ '--key-scale': scale / 100 }}>
        {shown.length ? (
          shown.map((b, i) => (
            <span key={i} class={`key ${b.kind === 'prefix' ? 'key-prefix' : ''} ${drag && drag.to === i ? 'kb-lift' : ''}`}>
              {chipLabel(b)}
            </span>
          ))
        ) : (
          <span class="dim small">Sin botones: la barra no se muestra.</span>
        )}
      </div>
      <ol class={`kb-list ${drag ? 'sorting' : ''}`} ref={listRef}>
        {list.map((b, i) => {
          const y = slide(i);
          return (
            <li key={i} class={`kb-row ${drag?.from === i ? 'dragging' : ''} ${open === i ? 'open' : ''}`} style={y ? { transform: `translateY(${y}px)` } : undefined}>
              <div class="kb-line">
                <span
                  class="kb-grip"
                  role="button"
                  aria-label={`Mover ${chipLabel(b)}`}
                  title="Arrastra para mover"
                  onPointerDown={(e) => grab(e, i)}
                  onPointerMove={moveDrag}
                  onPointerUp={drop}
                  onPointerCancel={drop}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <IconGrip />
                </span>
                <button class="kb-main" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                  <span class={`key kb-chip ${b.kind === 'prefix' ? 'key-prefix' : ''}`}>{chipLabel(b)}</span>
                  <span class="kb-desc small">{describe(b)}</span>
                </button>
                <button class="kb-del" aria-label={`Quitar ${chipLabel(b)}`} title="Quitar" onClick={() => remove(i)}>
                  <IconClose />
                </button>
              </div>
              {open === i && <ButtonEditor value={b} onSave={(nb) => update(i, nb)} onCancel={() => setOpen(null)} />}
            </li>
          );
        })}
      </ol>
      {open === 'new' && (
        <div class="kb-new">
          <h3>Botón nuevo</h3>
          <ButtonEditor value={{ kind: 'text', label: '', text: '' }} saveLabel="Añadir" onSave={add} onCancel={() => setOpen(null)} />
        </div>
      )}
      {adding && (
        <section class="setting kb-presets">
          <h3>Añadir un botón</h3>
          <p class="dim small">Uno de la lista, o uno propio con la tecla o el texto que quieras.</p>
          <div class="kb-preset-grid">
            <button class="btn btn-primary" onClick={() => (setAdding(false), setOpen('new'))}>
              Botón propio…
            </button>
            {PRESETS.map((b, i) => (
              <button key={i} class={`key ${b.kind === 'prefix' ? 'key-prefix' : ''}`} title={describe(b)} onClick={() => add(b)}>
                {chipLabel(b)}
              </button>
            ))}
          </div>
        </section>
      )}
      <div class="row-btns kb-actions">
        {!adding && open !== 'new' && (
          <button class="btn" disabled={full} title={full ? `Como mucho ${KEYBAR_MAX} botones` : undefined} onClick={() => (setAdding(true), setOpen(null))}>
            Añadir botón
          </button>
        )}
        {adding && (
          <button class="btn" onClick={() => setAdding(false)}>
            Cerrar
          </button>
        )}
        {resetting ? (
          <>
            <button class="btn btn-danger" onClick={() => (save(DEFAULT_KEYBAR), setResetting(false), setOpen(null))}>
              Sí, restablecer
            </button>
            <button class="btn" onClick={() => setResetting(false)}>
              No
            </button>
          </>
        ) : (
          <button class="btn" onClick={() => setResetting(true)}>
            Restablecer
          </button>
        )}
      </div>
    </>
  );
}

const CHAR = '__char';

/** One button: its label and what it does. Nothing is saved until «Guardar». */
function ButtonEditor({ value, saveLabel = 'Guardar', onSave, onCancel }: { value: KeybarButton; saveLabel?: string; onSave: (b: KeybarButton) => void; onCancel: () => void }) {
  const [b, setB] = useState<KeybarButton>(value);
  /** Merged into the latest state: two changes in a row don't undo each other. */
  const patch = (p: Partial<{ label: string; key: string; ctrl: boolean; alt: boolean; text: string; enter: boolean }>) =>
    setB((prev) => ({ ...prev, ...p }) as KeybarButton);
  const sends = b.kind === 'key' || b.kind === 'text';
  const placeholder = b.kind === 'prefix' ? 'El de la máquina (^B…)' : defaultLabel(b) || 'Etiqueta';
  return (
    <form
      class="kb-editor"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid(b)) onSave({ ...b, label: b.label.trim() });
      }}
    >
      <label class="kb-field">
        <span class="small dim">Etiqueta</span>
        <input type="text" value={b.label} maxLength={LABEL_MAX} placeholder={placeholder} autocapitalize="off" spellcheck={false} onInput={(e) => patch({ label: e.currentTarget.value })} />
      </label>
      {!sends && <p class="dim small">{SPECIALS[b.kind as keyof typeof SPECIALS].name}. Vacía, la de siempre.</p>}
      {sends && (
        <>
          <div class="seg" role="radiogroup" aria-label="Qué envía">
            <button type="button" role="radio" aria-checked={b.kind === 'key'} class={b.kind === 'key' ? 'on' : ''} onClick={() => b.kind !== 'key' && setB((prev) => ({ kind: 'key', label: prev.label, key: 'esc' }))}>
              Tecla
            </button>
            <button type="button" role="radio" aria-checked={b.kind === 'text'} class={b.kind === 'text' ? 'on' : ''} onClick={() => b.kind !== 'text' && setB((prev) => ({ kind: 'text', label: prev.label, text: '' }))}>
              Texto
            </button>
          </div>
          {b.kind === 'key' && <KeyFields b={b} patch={patch} />}
          {b.kind === 'text' && (
            <>
              <label class="kb-field">
                <span class="small dim">Texto</span>
                <input
                  type="text"
                  value={b.text}
                  maxLength={TEXT_MAX}
                  placeholder="/clear"
                  autocapitalize="off"
                  autocomplete="off"
                  spellcheck={false}
                  onInput={(e) => patch({ text: e.currentTarget.value })}
                />
              </label>
              <label class="kb-check">
                <input type="checkbox" checked={!!b.enter} onChange={(e) => patch({ enter: e.currentTarget.checked || undefined })} />
                Pulsar Enter después
              </label>
            </>
          )}
        </>
      )}
      <div class="row-btns">
        <button type="submit" class="btn btn-primary" disabled={!valid(b)}>
          {saveLabel}
        </button>
        <button type="button" class="btn" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function KeyFields({ b, patch }: { b: Extract<KeybarButton, { kind: 'key' }>; patch: (p: { key?: string; ctrl?: boolean; alt?: boolean }) => void }) {
  const named = isKeyName(b.key);
  return (
    <div class="kb-keyfields">
      <label class="kb-field">
        <span class="small dim">Tecla</span>
        <select value={named ? b.key : CHAR} onChange={(e) => patch({ key: e.currentTarget.value === CHAR ? '' : e.currentTarget.value })}>
          {(Object.keys(KEYS) as KeyName[]).map((k) => (
            <option key={k} value={k}>
              {KEYS[k].label} · {KEYS[k].name}
            </option>
          ))}
          <option value={CHAR}>Un carácter…</option>
        </select>
      </label>
      {!named && (
        <label class="kb-field kb-char">
          <span class="small dim">Carácter</span>
          <input
            type="text"
            value={b.key}
            placeholder="d"
            autocapitalize="off"
            autocomplete="off"
            spellcheck={false}
            onInput={(e) => patch({ key: [...e.currentTarget.value].slice(-1).join('') })}
          />
        </label>
      )}
      <label class="kb-check">
        <input type="checkbox" checked={!!b.ctrl} onChange={(e) => patch({ ctrl: e.currentTarget.checked || undefined })} />
        Ctrl
      </label>
      <label class="kb-check">
        <input type="checkbox" checked={!!b.alt} onChange={(e) => patch({ alt: e.currentTarget.checked || undefined })} />
        Alt
      </label>
    </div>
  );
}
