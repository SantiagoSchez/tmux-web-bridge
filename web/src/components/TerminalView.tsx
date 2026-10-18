import { ClipboardAddon, type ClipboardSelectionType, type IClipboardProvider } from '@xterm/addon-clipboard';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { HostInfo, PaneInfo, SessionInfo, WindowInfo } from '../../../shared/types';
import { isTouch, prefs } from '../prefs';
import { clientId, toast } from '../state';
import { XTERM_THEME } from '../theme';
import { hub } from '../ws';
import { AttachButton } from './Attach';
import { IconClose, IconDown } from './icons';

interface Props {
  above?: ComponentChildren;
  host: HostInfo;
  session: SessionInfo;
  window: WindowInfo;
  pane: PaneInfo;
}

const FONT_FAMILY = '"TWB Mono", "TWB Symbols", ui-monospace, Menlo, "Roboto Mono", monospace';

/**
 * xterm measures its cells when it opens: with the web font still loading it would
 * size them for the fallback font. Wait for both weights (at most 3 s).
 */
const fontsReady: Promise<unknown> = Promise.race([
  Promise.all([document.fonts.load('16px "TWB Mono"'), document.fonts.load('bold 16px "TWB Mono"')]),
  new Promise((r) => setTimeout(r, 3000)),
]).catch(() => {});

/** Bytes of the tmux prefix key (C-a → 0x01). */
function prefixBytes(prefix: string | undefined): string {
  const m = /^C-(.)$/.exec(prefix ?? '');
  if (m) return String.fromCharCode(m[1].toLowerCase().charCodeAt(0) & 0x1f);
  if (prefix === 'C-Space') return '\x00';
  return '\x02';
}

type Mod = 'ctrl' | 'alt';
const ARROWS: Record<string, string> = { '↑': 'A', '↓': 'B', '→': 'C', '←': 'D' };
/** A new line without sending (Ctrl+J), what Ghostty's shift+enter sends: Claude Code breaks the line. */
const NEWLINE = '\n';

/**
 * Desktop shortcuts, as Ghostty sends them on the Mac. Cmd+← is Home and not Ctrl+A,
 * which is the tmux prefix; Option keeps typing macOS characters ({ } [ ] \ | @ #
 * on a Spanish keyboard), so only its word motions are mapped.
 */
function macShortcut(e: KeyboardEvent): string | null {
  if (e.metaKey && !e.ctrlKey && !e.altKey) {
    if (e.key === 'ArrowLeft') return '\x1b[H';
    if (e.key === 'ArrowRight') return '\x05';
    if (e.key === 'Backspace') return '\x15';
  }
  if (e.altKey && !e.metaKey && !e.ctrlKey) {
    if (e.key === 'ArrowLeft') return '\x1bb';
    if (e.key === 'ArrowRight') return '\x1bf';
    if (e.key === 'Backspace') return '\x1b\x7f';
  }
  if (e.key === 'Enter' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) return NEWLINE;
  return null;
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(`Copiado al portapapeles (${text.length} caracteres)`);
  } catch {
    toast('El navegador no ha dejado copiar al portapapeles', 'error');
  }
}

/**
 * OSC 52: tmux (set-clipboard on) sends what you copy in it to the terminal; this
 * puts it on the browser's clipboard. Reading the clipboard from the pane is denied.
 */
let lastCopy = { text: '', at: 0 };
const clipboardProvider: IClipboardProvider = {
  readText: () => '',
  writeText: async (_sel: ClipboardSelectionType, text: string) => {
    if (!text) return;
    // One copy in tmux can emit OSC 52 more than once (set-clipboard + tmux-yank): act once.
    if (text === lastCopy.text && Date.now() - lastCopy.at < 1500) return;
    lastCopy = { text, at: Date.now() };
    await copyText(text);
  },
};

/** Applies sticky Ctrl/Alt to what the soft keyboard typed. */
function withMods(data: string, mods: Set<Mod>): string {
  let out = data;
  if (mods.has('ctrl') && out.length === 1) {
    const c = out.toLowerCase().charCodeAt(0);
    if (c >= 0x61 && c <= 0x7a) out = String.fromCharCode(c & 0x1f);
    else if (out === ' ' || out === '@') out = '\x00';
    else if ('[\\]^_'.includes(out)) out = String.fromCharCode(out.charCodeAt(0) & 0x1f);
  }
  if (mods.has('alt')) out = `\x1b${out}`;
  return out;
}

/** Keys of a hardware keyboard (tablet, Bluetooth) that the input proxy forwards as escape sequences. */
const SPECIAL_KEYS: Record<string, string> = {
  Enter: '\r',
  Tab: '\t',
  Escape: '\x1b',
  ArrowUp: '\x1b[A',
  ArrowDown: '\x1b[B',
  ArrowRight: '\x1b[C',
  ArrowLeft: '\x1b[D',
  Home: '\x1b[H',
  End: '\x1b[F',
  PageUp: '\x1b[5~',
  PageDown: '\x1b[6~',
  Delete: '\x1b[3~',
};

/**
 * Typing on a phone. Android keyboards (Gboard...) compose each word and xterm.js
 * only receives it when the word is committed: letters show up late and some get
 * lost when the keyboard corrects or predicts. Instead, a plain textarea takes the
 * keyboard and every change is sent at once as a diff against the previous value:
 * new characters are typed, removed ones become backspaces (so autocorrect simply
 * rewrites the word). A zero-width sentinel keeps the field non-empty, so the
 * keyboard's backspace always produces an event.
 */
const SENTINEL = '​';

function bindInputProxy(el: HTMLTextAreaElement, send: (d: string) => void, mods: () => Set<Mod>, clearMods: () => void): () => void {
  let prev = SENTINEL;
  let composing = false;
  const reset = () => {
    el.value = SENTINEL;
    prev = SENTINEL;
    el.setSelectionRange(1, 1);
  };
  reset();

  const onInput = () => {
    const v = el.value;
    let p = 0;
    while (p < prev.length && p < v.length && prev[p] === v[p]) p++;
    const removed = prev.length - p;
    let added = v.slice(p).replace(/​/g, '').replace(/\n/g, '\r');
    const m = mods();
    if (m.size && added.length === 1) {
      added = withMods(added, m);
      clearMods();
    }
    const out = '\x7f'.repeat(removed) + added;
    if (out) send(out);
    prev = v;
    // Start over between words (never mid-composition): keeps the field short and the sentinel in place.
    if (!composing && (!v.startsWith(SENTINEL) || v.length > 40 || /[\s\r\n]$/.test(v))) reset();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (composing || e.isComposing) return;
    if (e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1) {
      e.preventDefault();
      send(withMods(e.key, new Set<Mod>(['ctrl'])));
      return;
    }
    const seq = SPECIAL_KEYS[e.key];
    if (!seq) return;
    e.preventDefault();
    send(e.key === 'Enter' && e.shiftKey ? NEWLINE : e.altKey ? `\x1b${seq}` : seq);
    reset();
  };
  const onStart = () => (composing = true);
  const onEnd = () => {
    composing = false;
    // Some keyboards fire the final input before compositionend: re-check now.
    setTimeout(() => {
      if (!composing && el.value === prev && (prev.length > 40 || /[\s\r\n]$/.test(prev))) reset();
    }, 0);
  };
  el.addEventListener('input', onInput);
  el.addEventListener('keydown', onKeyDown);
  el.addEventListener('compositionstart', onStart);
  el.addEventListener('compositionend', onEnd);
  return () => {
    el.removeEventListener('input', onInput);
    el.removeEventListener('keydown', onKeyDown);
    el.removeEventListener('compositionstart', onStart);
    el.removeEventListener('compositionend', onEnd);
  };
}

/**
 * Whether the phone keyboard is up: the visible viewport is clearly shorter than the
 * tallest it has been (reset when the screen rotates).
 */
let fullHeight = 0;
screen.orientation?.addEventListener('change', () => (fullHeight = 0));
function keyboardShown(): boolean {
  const h = window.visualViewport?.height ?? window.innerHeight;
  fullHeight = Math.max(fullHeight, h);
  return h < fullHeight - 120;
}

const LONG_PRESS_MS = 450;
/** What ends a word for a long press: xterm's own separators plus the tmux pane border. */
const WORD_SEPARATORS = ' ()[]{}\'"`,│';

/** A touch selection, as linear buffer offsets (row * cols + col), both ends included. */
type Range = [number, number];

function screenRect(el: HTMLElement): DOMRect {
  return ((el.querySelector('.xterm-screen') as HTMLElement | null) ?? el).getBoundingClientRect();
}

/** Buffer cell under a point of the screen, clamped to the visible rows. */
function cellAt(el: HTMLElement, term: Terminal, x: number, y: number): { col: number; row: number } {
  const r = screenRect(el);
  const col = Math.min(term.cols - 1, Math.max(0, Math.floor(((x - r.left) * term.cols) / r.width)));
  const row = Math.min(term.rows - 1, Math.max(0, Math.floor(((y - r.top) * term.rows) / r.height)));
  return { col, row: term.buffer.active.viewportY + row };
}

function offsetAt(el: HTMLElement, term: Terminal, x: number, y: number): number {
  const { col, row } = cellAt(el, term, x, y);
  return row * term.cols + col;
}

/** Where a buffer offset sits on the screen, in client coordinates. */
function cellBox(el: HTMLElement, term: Terminal, p: number): { left: number; top: number; width: number; height: number } {
  const r = screenRect(el);
  const width = r.width / term.cols;
  const height = r.height / term.rows;
  const row = Math.floor(p / term.cols) - term.buffer.active.viewportY;
  return { left: r.left + (p % term.cols) * width, top: r.top + row * height, width, height };
}

function selectRange(term: Terminal, [from, to]: Range): void {
  term.select(from % term.cols, Math.floor(from / term.cols), to - from + 1);
}

/** How far from the cursor's row a tap still moves it (the line being typed, wrapped). */
const CURSOR_ROWS = 8;

/** Resolves once the cursor stops moving (true) or if it never moved (false). */
function cursorSettled(term: Terminal): Promise<boolean> {
  return new Promise((resolve) => {
    let moved = false;
    const done = () => {
      sub.dispose();
      clearTimeout(quiet);
      clearTimeout(cap);
      resolve(moved);
    };
    const sub = term.onCursorMove(() => {
      moved = true;
      clearTimeout(quiet);
      quiet = setTimeout(done, 120);
    });
    let quiet = setTimeout(done, 400);
    const cap = setTimeout(done, 1500);
  });
}

/**
 * Moves the cursor of the line being typed to the cell at a point, with ← and →. Never
 * ↑ ↓: on the first line of Claude Code's prompt they browse its history instead. Across
 * wrapped lines the distance is a guess (indents, wide characters), so it looks where
 * the cursor landed and corrects, while that gets it closer.
 */
async function moveCursorTo(el: HTMLElement, term: Terminal, x: number, y: number, send: (d: string) => void): Promise<void> {
  const b = term.buffer.active;
  const { col, row } = cellAt(el, term, x, y);
  const goal = (row - b.viewportY) * term.cols + col;
  const at = () => b.cursorY * term.cols + b.cursorX;
  if (Math.abs(row - b.viewportY - b.cursorY) > CURSOR_ROWS) return;
  let best = Math.abs(goal - at());
  for (let i = 0; i < 4 && best > 0; i++) {
    const d = goal - at();
    send((d > 0 ? '\x1b[C' : '\x1b[D').repeat(Math.min(Math.abs(d), 300)));
    // Not moving at all: the cursor is already at the start or end of what can be edited.
    if (!(await cursorSettled(term))) return;
    const now = Math.abs(goal - at());
    if (now >= best) return;
    best = now;
  }
}

/** First and last column of the word at a cell (just the cell when it is a space or a separator). */
function wordAt(term: Terminal, col: number, row: number): [number, number] {
  const line = term.buffer.active.getLine(row);
  const inWord = (c: number) => {
    const cell = line?.getCell(c);
    if (!cell) return false;
    // The second half of a wide character goes with the first.
    if (cell.getWidth() === 0) return true;
    const ch = cell.getChars();
    return ch !== '' && !WORD_SEPARATORS.includes(ch);
  };
  if (!inWord(col)) return [col, col];
  let a = col;
  let b = col;
  while (a > 0 && inWord(a - 1)) a--;
  while (b < term.cols - 1 && inWord(b + 1)) b++;
  return [a, b];
}

interface TouchHandlers {
  /** A tap (no drag), where the finger touched. */
  tap: (x: number, y: number) => void;
  /** A scroll drag starts. */
  scroll: () => void;
  /** The drag scrolled one line (1 down, -1 up). */
  line: (dir: 1 | -1) => void;
  /** A long press selected, or its drag changed the selection. */
  select: (range: Range) => void;
  /** The finger while it selects (for the loupe); null once it lifts. */
  finger: (at: { x: number; y: number; p: number } | null) => void;
}

/**
 * Touch scrolling. xterm.js ignores finger drags, and with tmux (mouse on) or a
 * full-screen TUI the terminal has no scrollback of its own: the drag becomes
 * wheel events, which tmux or the app (Claude Code) turn into scrolling.
 *
 * A long press selects instead: it takes the word under the finger and dragging
 * extends the selection from it. A tap or a scroll drops the selection.
 */
function bindTouch(el: HTMLElement, term: Terminal, h: TouchHandlers): () => void {
  let lastY = 0;
  let acc = 0;
  let dragging = false;
  let selecting = false;
  let startAt = { x: 0, y: 0 };
  let press: ReturnType<typeof setTimeout> | undefined;
  /** The long-pressed word. */
  let anchor: Range = [0, 0];
  const lineHeight = () => Math.max(8, (el.querySelector('.xterm-screen') as HTMLElement | null)?.clientHeight ?? 0) / term.rows || 16;
  const selectTo = (x: number, y: number) => {
    const p = offsetAt(el, term, x, y);
    h.select([Math.min(anchor[0], p), Math.max(anchor[1], p)]);
    h.finger({ x, y, p });
  };
  const cancelPress = () => {
    clearTimeout(press);
    press = undefined;
  };
  const stopSelecting = () => {
    if (selecting) h.finger(null);
    selecting = false;
    el.classList.remove('selecting');
  };
  const start = (e: TouchEvent) => {
    cancelPress();
    stopSelecting();
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    lastY = t.clientY;
    acc = 0;
    dragging = false;
    const { clientX: x, clientY: y } = t;
    startAt = { x, y };
    press = setTimeout(() => {
      press = undefined;
      selecting = true;
      el.classList.add('selecting');
      const { col, row } = cellAt(el, term, x, y);
      const [a, b] = wordAt(term, col, row);
      anchor = [row * term.cols + a, row * term.cols + b];
      selectTo(x, y);
      navigator.vibrate?.(10);
    }, LONG_PRESS_MS);
  };
  const move = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    if (selecting) {
      e.preventDefault();
      selectTo(t.clientX, t.clientY);
      return;
    }
    // Moving, even sideways, is not a long press.
    if (press && Math.hypot(t.clientX - startAt.x, t.clientY - startAt.y) > 10) cancelPress();
    acc += lastY - t.clientY;
    lastY = t.clientY;
    if (!dragging && Math.abs(acc) < 10) return;
    if (!dragging) {
      cancelPress();
      // What was selected scrolls away under tmux: the selection would point at other text.
      term.clearSelection();
      h.scroll();
    }
    dragging = true;
    e.preventDefault();
    const step = lineHeight();
    const target = el.querySelector('.xterm-screen') ?? el;
    while (Math.abs(acc) >= step) {
      const dir = acc > 0 ? 1 : -1;
      acc -= dir * step;
      h.line(dir);
      target.dispatchEvent(
        new WheelEvent('wheel', { deltaY: dir, deltaMode: WheelEvent.DOM_DELTA_LINE, clientX: t.clientX, clientY: t.clientY, bubbles: true, cancelable: true }),
      );
    }
  };
  const end = (e: TouchEvent) => {
    e.preventDefault(); // no synthetic mouse events: xterm must not grab the focus
    cancelPress();
    if (selecting) {
      stopSelecting();
      return;
    }
    if (dragging) return;
    // A tap with something selected just drops the selection.
    if (term.hasSelection()) term.clearSelection();
    else h.tap(startAt.x, startAt.y);
  };
  const cancel = () => {
    cancelPress();
    stopSelecting();
  };
  // Android opens the context menu on a long press.
  const noMenu = (e: Event) => e.preventDefault();
  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchmove', move, { passive: false });
  el.addEventListener('touchend', end, { passive: false });
  el.addEventListener('touchcancel', cancel);
  el.addEventListener('contextmenu', noMenu);
  return () => {
    cancelPress();
    el.removeEventListener('touchstart', start);
    el.removeEventListener('touchmove', move);
    el.removeEventListener('touchend', end);
    el.removeEventListener('touchcancel', cancel);
    el.removeEventListener('contextmenu', noMenu);
  };
}

/** Cells the loupe shows around the finger. */
const LOUPE_CELLS = 21;

/**
 * The line under the finger, enlarged above it (the finger hides what it selects):
 * the selected cells shaded and the one under the finger outlined.
 */
function Loupe({ term, el, main, range, at }: { term: Terminal; el: HTMLElement; main: HTMLElement; range: Range; at: { x: number; y: number; p: number } }) {
  const row = Math.floor(at.p / term.cols);
  const col = at.p % term.cols;
  const first = Math.max(0, Math.min(col - (LOUPE_CELLS >> 1), term.cols - LOUPE_CELLS));
  const line = term.buffer.active.getLine(row);
  const cells: ComponentChildren[] = [];
  for (let c = first; c < Math.min(term.cols, first + LOUPE_CELLS); c++) {
    const cell = line?.getCell(c);
    const w = cell?.getWidth() ?? 1;
    if (w === 0) continue;
    const p = row * term.cols + c;
    const cls = `${p >= range[0] && p <= range[1] ? 'sel' : ''} ${c === col || (w === 2 && c + 1 === col) ? 'cur' : ''}`;
    cells.push(
      <span key={c} class={cls} style={w === 2 ? { width: '2ch' } : undefined}>
        {cell?.getChars() || ' '}
      </span>,
    );
  }
  const m = main.getBoundingClientRect();
  const { height } = cellBox(el, term, at.p);
  const fontSize = Math.round(term.options.fontSize! * 1.6);
  const width = (LOUPE_CELLS + 1) * fontSize * 0.6;
  const left = Math.max(4, Math.min(at.x - m.left - width / 2, m.width - width - 4));
  const above = at.y - m.top - height * 2 - fontSize * 2.4;
  const top = above >= 4 ? above : at.y - m.top + height * 2;
  return (
    <div class="loupe" style={{ left: `${left}px`, top: `${top}px`, fontSize: `${fontSize}px`, fontFamily: FONT_FAMILY }} aria-hidden="true">
      {cells}
    </div>
  );
}

/**
 * Full terminal: xterm.js on a pty running a tmux client of a session grouped
 * with this one (see server/src/terminal.ts). Changing window or pane inside
 * the same space just retargets that client.
 */
export function TerminalView({ host, session, window, pane, above }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const target = useRef({ window: window.id, pane: pane.id });
  const [mods, setMods] = useState<Set<Mod>>(new Set());
  const modsRef = useRef(mods);
  modsRef.current = mods;
  const [state, setState] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const [attempt, setAttempt] = useState(0);
  /**
   * Lines scrolled up with the finger. tmux reports its copy mode (pane.inMode), but a
   * full-screen program (Claude Code) scrolls inside itself: only this count knows.
   */
  const [scrolledUp, setScrolledUp] = useState(0);
  /** For the touch handlers, bound once per terminal: whether the pane shows its live end. */
  const atEnd = useRef(true);
  atEnd.current = !pane.inMode && scrolledUp === 0;
  const movingCursor = useRef(false);
  const main = useRef<HTMLDivElement>(null);
  /** What a long press selected (touch only): shows the handles and the copy button. */
  const [range, setRange] = useState<Range | null>(null);
  /** The finger while it selects or drags a handle: shows the loupe. */
  const [finger, setFinger] = useState<{ x: number; y: number; p: number } | null>(null);
  /** A handle being dragged: the other end of the selection, and from the finger to the dragged end. */
  const handleDrag = useRef<{ fixed: number; dx: number; dy: number } | null>(null);
  const fontSize = prefs.value.termFontSize;

  const sendRaw = (d: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ t: 'i', d }));
  };
  /**
   * Opens the phone keyboard on our input proxy (never on xterm's own textarea). Still
   * focused after the keyboard was put away, focus() alone would not bring it back.
   */
  const focusInput = () => {
    const el = input.current;
    if (!el) return;
    if (document.activeElement === el) {
      if (keyboardShown()) return;
      el.blur();
    }
    el.focus({ preventScroll: true });
  };
  /** Scrolling to read: the keyboard goes away (what was typed is already sent). */
  const hideKeyboard = () => input.current?.blur();

  // Terminal + socket lifetime: one per space (the component is keyed by session).
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    void fontsReady.then(() => {
      if (disposed) return;
      cleanup = start();
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, [attempt]);

  function start(): () => void {
    const term = new Terminal({
      fontFamily: FONT_FAMILY,
      fontSize,
      theme: XTERM_THEME,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 2000,
      // Like Ghostty here (macos-option-as-alt = false): Option types characters.
      macOptionIsMeta: false,
      // Option+drag selects text even while tmux has the mouse; Cmd+C copies it.
      macOptionClickForcesSelection: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.loadAddon(new ClipboardAddon(undefined, clipboardProvider));
    const unicode = new Unicode11Addon();
    term.loadAddon(unicode);
    term.unicode.activeVersion = '11';
    term.open(box.current!);
    // On touch devices the keyboard goes to the input proxy, never to xterm's textarea
    // (xterm keeps emitting mouse wheel reports and pastes through onData).
    if (isTouch && term.textarea) {
      term.textarea.readOnly = true;
      term.textarea.tabIndex = -1;
    }
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const q = new URLSearchParams({
      host: host.id,
      session: session.id,
      window: target.current.window,
      pane: target.current.pane,
      cols: String(term.cols),
      rows: String(term.rows),
      client: clientId.value ?? '',
    });
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/term?${q}`);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;
    setState('connecting');
    ws.onopen = () => setState('open');
    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') return; // control message ({t:'exit'})
      term.write(new Uint8Array(ev.data as ArrayBuffer));
    };
    ws.onclose = () => setState('closed');

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      // Cmd+C with text selected in the terminal: let the browser copy it.
      if (e.metaKey && e.key === 'c' && term.hasSelection()) return false;
      const seq = macShortcut(e);
      if (seq === null) return true;
      e.preventDefault();
      sendRaw(seq);
      return false;
    });
    const dataSub = term.onData((d) => {
      const m = modsRef.current;
      if (m.size) {
        d = withMods(d, m);
        setMods(new Set());
      }
      sendRaw(d);
    });
    const selectionSub = term.onSelectionChange(() => {
      if (!term.hasSelection()) setRange(null);
    });
    const resizeSub = term.onResize(({ cols, rows }) => {
      // The selection is kept as offsets for the old width.
      term.clearSelection();
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'r', cols, rows }));
    });
    let t: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => fit.fit(), 60);
    });
    ro.observe(box.current!);
    const unbindTouch = isTouch
      ? bindTouch(box.current!, term, {
          tap: (x, y) => {
            // Typing (keyboard up, at the live end): a tap moves the cursor there.
            const typing = document.activeElement === input.current && keyboardShown() && atEnd.current;
            if (!typing) return focusInput();
            if (movingCursor.current) return;
            movingCursor.current = true;
            void moveCursorTo(box.current!, term, x, y, sendRaw).finally(() => (movingCursor.current = false));
          },
          scroll: hideKeyboard,
          line: (dir) => setScrolledUp((up) => Math.max(0, up - dir)),
          select: (r) => {
            selectRange(term, r);
            setRange(r);
          },
          finger: setFinger,
        })
      : () => {};
    const unbindInput = isTouch
      ? bindInputProxy(input.current!, sendRaw, () => modsRef.current, () => setMods(new Set()))
      : () => {};
    if (!isTouch) term.focus();

    return () => {
      ro.disconnect();
      unbindTouch();
      unbindInput();
      clearTimeout(t);
      dataSub.dispose();
      selectionSub.dispose();
      resizeSub.dispose();
      ws.close();
      term.dispose();
      termRef.current = null;
      wsRef.current = null;
    };
  }

  // Another window or pane of the same space: retarget the tmux client.
  useEffect(() => {
    const prev = target.current;
    if (prev.window === window.id && prev.pane === pane.id) return;
    setScrolledUp(0);
    target.current = { window: window.id, pane: pane.id };
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ t: 'sel', window: window.id, pane: pane.id }));
  }, [window.id, pane.id]);

  // Out of copy mode (scrolled back to the end, q...): the count no longer means anything.
  useEffect(() => {
    if (!pane.inMode) setScrolledUp(0);
  }, [pane.inMode]);

  const scrollToEnd = () => {
    // Back to read the end, not to type: the keyboard stays away.
    hideKeyboard();
    setScrolledUp(0);
    void hub.action(host.id, { op: 'scrollToEnd', pane: pane.id }).catch(() => {});
  };

  /**
   * Selection handles: each one moves its end of the selection and the other end stays.
   * The end keeps its distance to the finger, so grabbing the handle does not jump it.
   */
  const handleEvents = (end: 0 | 1) => ({
    onTouchStart: (e: TouchEvent) => {
      const term = termRef.current;
      if (!term || !range || e.touches.length !== 1) return;
      const t = e.touches[0];
      const c = cellBox(box.current!, term, range[end]);
      handleDrag.current = { fixed: range[1 - end], dx: c.left + c.width / 2 - t.clientX, dy: c.top + c.height / 2 - t.clientY };
    },
    onTouchMove: (e: TouchEvent) => {
      const term = termRef.current;
      const d = handleDrag.current;
      if (!term || !d || e.touches.length !== 1) return;
      e.preventDefault();
      const t = e.touches[0];
      const p = offsetAt(box.current!, term, t.clientX + d.dx, t.clientY + d.dy);
      const r: Range = [Math.min(d.fixed, p), Math.max(d.fixed, p)];
      selectRange(term, r);
      setRange(r);
      setFinger({ x: t.clientX, y: t.clientY, p });
    },
    onTouchEnd: (e: TouchEvent) => {
      e.preventDefault();
      handleDrag.current = null;
      setFinger(null);
    },
    onTouchCancel: () => {
      handleDrag.current = null;
      setFinger(null);
    },
  });

  /** A handle hangs from the bottom-left corner of the first cell, or the bottom-right one of the last. */
  const handle = (end: 0 | 1) => {
    const term = termRef.current;
    if (!term || !range || !box.current || !main.current) return null;
    const c = cellBox(box.current, term, range[end]);
    const m = main.current.getBoundingClientRect();
    const left = c.left - m.left + (end ? c.width : 0);
    const top = c.top - m.top + c.height;
    if (top < 0 || top > m.height) return null;
    return <div class={`sel-handle ${end ? 'end' : 'start'}`} style={{ left: `${left}px`, top: `${top}px` }} aria-hidden="true" {...handleEvents(end)} />;
  };

  const copySelection = () => {
    const term = termRef.current;
    const text = term?.getSelection() ?? '';
    term?.clearSelection();
    if (text) void copyText(text);
  };

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = fontSize;
    fitRef.current?.fit();
  }, [fontSize]);

  const toggle = (m: Mod) => {
    const next = new Set(mods);
    if (next.has(m)) next.delete(m);
    else next.add(m);
    setMods(next);
  };

  const key = (label: string, seq: string) => {
    if (ARROWS[label] && mods.size) {
      // Ctrl/Alt + arrow: xterm modifier encoding (5 = Ctrl, 3 = Alt).
      seq = `\x1b[1;${mods.has('ctrl') ? 5 : 3}${ARROWS[label]}`;
      setMods(new Set());
    } else if (mods.size && seq.length === 1) {
      seq = withMods(seq, mods);
      setMods(new Set());
    }
    sendRaw(seq);
  };

  const keepFocus = (e: Event) => e.preventDefault();
  /** Right after attach: the arrows and Enter, the most used ones. */
  const FIRST_KEYS: [string, string, string?][] = [
    ['↑', '\x1b[A'],
    ['↓', '\x1b[B'],
    ['←', '\x1b[D'],
    ['→', '\x1b[C'],
    ['Enter', '\r'],
  ];
  const KEYS: [string, string, string?][] = [
    ['Esc', '\x1b'],
    ['⏎ línea', NEWLINE, 'Salto de línea sin enviar (como Shift+Enter)'],
    ['⇧Tab', '\x1b[Z', 'Shift+Tab (modo de Claude)'],
    ['^C', '\x03'],
    ['1', '1'],
    ['2', '2'],
    ['3', '3'],
    ['Tab', '\t'],
    ['PgUp', '\x1b[5~'],
    ['PgDn', '\x1b[6~'],
    ['|', '|'],
    ['~', '~'],
    ['/', '/'],
    ['-', '-'],
  ];

  const keyButton = ([label, seq, title]: [string, string, string?]) => (
    <button key={label} class="key" title={title} onPointerDown={keepFocus} onClick={() => key(label, seq)}>
      {label}
    </button>
  );

  return (
    <div class="term">
      <div class="term-main" ref={main}>
        <div class="term-box" ref={box} />
        {(pane.inMode || scrolledUp > 0) && (
          <button class="fab" aria-label="Ir al final" title="Ir al final" onPointerDown={keepFocus} onClick={scrollToEnd}>
            <IconDown />
          </button>
        )}
        {range && handle(0)}
        {range && handle(1)}
        {range && finger && termRef.current && box.current && main.current && (
          <Loupe term={termRef.current} el={box.current} main={main.current} range={range} at={finger} />
        )}
        {range && (
          <div class="term-copy">
            <button class="btn btn-primary" onPointerDown={keepFocus} onClick={copySelection}>
              Copiar
            </button>
            <button class="btn" aria-label="Quitar la selección" title="Quitar la selección" onPointerDown={keepFocus} onClick={() => termRef.current?.clearSelection()}>
              <IconClose />
            </button>
          </div>
        )}
      </div>
      {isTouch && (
        <textarea
          ref={input}
          class="term-input"
          aria-label="Entrada de la terminal"
          autocapitalize="off"
          autocomplete="off"
          spellcheck={false}
          enterkeyhint="enter"
          rows={1}
        />
      )}
      {state !== 'open' && (
        <div class="term-overlay">
          {state === 'connecting' ? (
            <span class="dim">Abriendo terminal…</span>
          ) : (
            <>
              <span>Terminal desconectada</span>
              <button class="btn" onClick={() => setAttempt(attempt + 1)}>
                Reconectar
              </button>
            </>
          )}
        </div>
      )}
      {above && <div class="term-above">{above}</div>}
      {isTouch && (
        <div class="keybar scroll-x">
          <AttachButton hostId={host.id} paneId={pane.id} class="key" />
          {FIRST_KEYS.map(keyButton)}
          <button class={`key mod ${mods.has('ctrl') ? 'on' : ''}`} onPointerDown={keepFocus} onClick={() => toggle('ctrl')} aria-pressed={mods.has('ctrl')}>
            Ctrl
          </button>
          <button class={`key mod ${mods.has('alt') ? 'on' : ''}`} onPointerDown={keepFocus} onClick={() => toggle('alt')} aria-pressed={mods.has('alt')}>
            Alt
          </button>
          <button class="key key-prefix" onPointerDown={keepFocus} onClick={() => sendRaw(prefixBytes(host.prefix))} title={`Prefijo de tmux (${host.prefix ?? 'C-b'})`}>
            {(host.prefix ?? 'C-b').replace('C-', '^')}
          </button>
          {KEYS.map(keyButton)}
        </div>
      )}
    </div>
  );
}
