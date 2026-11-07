import { ClipboardAddon, type ClipboardSelectionType, type IClipboardProvider } from '@xterm/addon-clipboard';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { type ILink, type ILinkProvider, Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { HostInfo, PaneInfo, SessionInfo, WindowInfo } from '../../../shared/types';
import { cleanCopy } from '../../../shared/copy';
import { applyMods, DEFAULT_KEYBAR, defaultLabel, describe, KEYBAR_SCALE_DEFAULT, keySeq, type KeybarButton } from '../../../shared/keybar';
import { SENTINEL, typedDiff } from '../../../shared/typing';
import { isTouch, prefs } from '../prefs';
import { dictationEnded } from '../dictation';
import { clientId, hubSettings, toast } from '../state';
import { appearance, TERM_THEMES } from '../theme';
import { hub, PROBE_MS } from '../ws';
import { AttachButton } from './Attach';
import { MicButton } from './Mic';
import { IconClose, IconEnd, IconPageUp } from './icons';

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
/** Text and its Enter in one write would read as a paste in Claude Code: the Enter goes a moment later. */
const ENTER_DELAY_MS = 80;
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

async function copyText(text: string, asIs?: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    // Cleaned up: the notice offers what was on screen.
    const action = asIs === undefined || asIs === text ? undefined : { label: 'Copiar tal cual', run: () => void copyText(asIs) };
    toast(`Copiado al portapapeles (${text.length} caracteres)`, 'info', action);
  } catch {
    toast('El navegador no ha dejado copiar al portapapeles', 'error');
  }
}

/**
 * Copies what was selected in the terminal, without the line breaks Claude Code puts at its
 * width nor its quote bars and indent (cleanCopy).
 * @param firstCol the column where the selection starts, when it is known.
 */
function copyFromTerminal(term: Terminal, text: string, firstCol?: number): Promise<void> {
  return copyText(cleanCopy(text, term.cols, firstCol), text);
}

/**
 * OSC 52: tmux (set-clipboard on) sends what you copy in it to the terminal; this
 * puts it on the browser's clipboard. Reading the clipboard from the pane is denied.
 */
let lastCopy = { text: '', at: 0 };
function clipboardProvider(term: Terminal): IClipboardProvider {
  return {
    readText: () => '',
    writeText: async (_sel: ClipboardSelectionType, text: string) => {
      if (!text) return;
      // One copy in tmux can emit OSC 52 more than once (set-clipboard + tmux-yank): act once.
      if (text === lastCopy.text && Date.now() - lastCopy.at < 1500) return;
      lastCopy = { text, at: Date.now() };
      await copyFromTerminal(term, text);
    },
  };
}

/** Applies sticky Ctrl/Alt to what the soft keyboard typed. */
function withMods(data: string, mods: Set<Mod>): string {
  return applyMods(data, mods.has('ctrl'), mods.has('alt'));
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

/** How long a deletion waits for the keyboard's replacement word (see bindInputProxy). */
const REPLACE_WAIT_MS = 60;

/**
 * Typing on a phone. Android keyboards (Gboard...) compose each word and xterm.js
 * only receives it when the word is committed: letters show up late and some get
 * lost when the keyboard corrects or predicts. Instead, a plain textarea takes the
 * keyboard and every change is sent at once as a diff (typedDiff) against what was
 * sent before. The zero-width sentinel keeps the field non-empty, so the keyboard's
 * backspace always produces an event.
 */
function bindInputProxy(el: HTMLTextAreaElement, send: (d: string) => void, mods: () => Set<Mod>, clearMods: () => void): () => void {
  /** The field as the terminal has it (typedDiff may keep a letter's case). */
  let sent = SENTINEL;
  /** The field's last value seen. */
  let field = SENTINEL;
  let composing = false;
  /** A deletion held back in case the keyboard is replacing the word (see onInput). */
  let pending: ReturnType<typeof setTimeout> | undefined;
  const reset = () => {
    clearTimeout(pending);
    pending = undefined;
    el.value = SENTINEL;
    sent = field = SENTINEL;
    el.setSelectionRange(1, 1);
  };
  reset();

  /** Sends what changed from `sent` to the field's current value. */
  const flush = () => {
    clearTimeout(pending);
    pending = undefined;
    const v = el.value;
    const diff = typedDiff(sent, v);
    let added = diff.added;
    const m = mods();
    if (m.size && added.length === 1) {
      added = withMods(added, m);
      clearMods();
    }
    const out = '\x7f'.repeat(diff.removed) + added;
    if (out) send(out);
    sent = diff.sent;
    field = v;
    // Start over between words (never mid-composition): keeps the field short and the sentinel in place.
    if (!composing && (!v.startsWith(SENTINEL) || v.length > 40 || /[\s\r\n]$/.test(v))) reset();
  };

  const onInput = () => {
    const v = el.value;
    field = v;
    // When Gboard autocorrects a word ("claude" into "Claude") it may delete it first
    // and then insert the new one, as two inputs. Held back a moment, the deletion and
    // the insertion become a single diff, and typedDiff keeps the lowercase typed.
    // Erasing the sentinel (backspace on an empty field) is never a replacement.
    const diff = typedDiff(sent, v);
    if (!diff.added && diff.removed && v.startsWith(SENTINEL)) {
      clearTimeout(pending);
      pending = setTimeout(flush, REPLACE_WAIT_MS);
      return;
    }
    flush();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (composing || e.isComposing) return;
    if (e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1) {
      e.preventDefault();
      if (pending) flush();
      send(withMods(e.key, new Set<Mod>(['ctrl'])));
      return;
    }
    const seq = SPECIAL_KEYS[e.key];
    if (!seq) return;
    e.preventDefault();
    if (pending) flush();
    send(e.key === 'Enter' && e.shiftKey ? NEWLINE : e.altKey ? `\x1b${seq}` : seq);
    reset();
  };
  const onStart = () => (composing = true);
  const onEnd = () => {
    composing = false;
    // Some keyboards fire the final input before compositionend: re-check now.
    setTimeout(() => {
      if (!composing && !pending && el.value === field && (field.length > 40 || /[\s\r\n]$/.test(field))) reset();
    }, 0);
  };
  el.addEventListener('input', onInput);
  el.addEventListener('keydown', onKeyDown);
  el.addEventListener('compositionstart', onStart);
  el.addEventListener('compositionend', onEnd);
  return () => {
    clearTimeout(pending);
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

/**
 * The keyboard was put away while the input proxy kept the focus (Android's back
 * gesture): seen as the visible viewport growing back at the same width (a rotation
 * changes the width). Only then do the key buttons let go of the focus. Guessing it
 * from the height alone (keyboardShown) went wrong at times, and every key closed the
 * keyboard.
 */
let keyboardDismissed = false;
{
  const vv = window.visualViewport;
  let base = { w: vv?.width ?? 0, low: vv?.height ?? 0 };
  vv?.addEventListener('resize', () => {
    const { width: w, height: h } = vv;
    if (w !== base.w) {
      base = { w, low: h };
      keyboardDismissed = false;
    } else if (h < base.low) {
      base.low = h;
      keyboardDismissed = false;
    } else if (h > base.low + 120) {
      base.low = h;
      if (document.activeElement?.classList.contains('term-input')) keyboardDismissed = true;
    }
  });
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

/** A link of the terminal (a URL in the text or an OSC 8 one) opens in a new tab. */
function openLink(uri: string): void {
  window.open(uri, '_blank', 'noopener,noreferrer');
}

/**
 * The link at a cell, for a tap: xterm only looks for links under the mouse. Asks its
 * providers directly (the web links addon and its own OSC 8 one, not in the public
 * API); both answer at once, so the link still opens inside the tap's gesture.
 */
function linkAt(term: Terminal, col: number, row: number): ILink | undefined {
  const providers = (term as unknown as { _core?: { _linkProviderService?: { linkProviders?: ILinkProvider[] } } })._core?._linkProviderService?.linkProviders ?? [];
  const p = row * term.cols + col;
  let found: ILink | undefined;
  for (const provider of providers) {
    provider.provideLinks(row + 1, (links) => {
      found ??= links?.find((link) => {
        const [from, to] = linkRange(term, link);
        return from <= p && p <= to;
      });
    });
    if (found) return found;
  }
  return undefined;
}

/** The cells of a link, as a touch selection (its range is 1-based and includes both ends). */
function linkRange(term: Terminal, { range: { start, end } }: ILink): Range {
  return [(start.y - 1) * term.cols + start.x - 1, (end.y - 1) * term.cols + end.x - 1];
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
 * A long press selects instead: it takes the word (or the whole link) under the
 * finger and dragging extends the selection from it. A tap or a scroll drops the
 * selection.
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
      const link = linkAt(term, col, row);
      const [a, b] = wordAt(term, col, row);
      anchor = link ? linkRange(term, link) : [row * term.cols + a, row * term.cols + b];
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
  // Android opens the context menu on a long press. Caught on the way down: xterm takes
  // it as a right click and focuses its textarea, the phone keyboard goes away and the
  // terminal resizes, which drops the selection just made.
  const noMenu = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };
  // Moving, even sideways, is not a long press. Watched from the window, ahead of the
  // drawer's edge swipe, which keeps its touches from ever reaching the terminal.
  const watch = (e: TouchEvent) => {
    const t = e.touches[0];
    if (press && t && Math.hypot(t.clientX - startAt.x, t.clientY - startAt.y) > 10) cancelPress();
  };
  // Chrome on Android takes a long press released without moving as a tap, even with
  // its touchend cancelled, and sends mouse events: xterm would send tmux a click,
  // which counts as input and drops the selection. Right after a touch they are dropped.
  let touchedAt = 0;
  const touched = () => (touchedAt = performance.now());
  const noMouse = (e: Event) => {
    if (performance.now() - touchedAt > 800) return;
    e.preventDefault();
    e.stopPropagation();
  };
  const MOUSE = ['mousemove', 'mousedown', 'mouseup', 'click', 'dblclick'] as const;
  for (const t of MOUSE) el.addEventListener(t, noMouse, true);
  el.addEventListener('touchstart', touched, { capture: true, passive: true });
  el.addEventListener('touchend', touched, { capture: true, passive: true });
  const opts = { capture: true, passive: true } as const;
  addEventListener('touchmove', watch, opts);
  addEventListener('touchend', cancelPress, opts);
  addEventListener('touchcancel', cancelPress, opts);
  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchmove', move, { passive: false });
  el.addEventListener('touchend', end, { passive: false });
  el.addEventListener('touchcancel', cancel);
  el.addEventListener('contextmenu', noMenu, true);
  return () => {
    cancelPress();
    el.removeEventListener('touchstart', start);
    el.removeEventListener('touchmove', move);
    el.removeEventListener('touchend', end);
    el.removeEventListener('touchcancel', cancel);
    el.removeEventListener('contextmenu', noMenu, true);
    for (const t of MOUSE) el.removeEventListener(t, noMouse, true);
    el.removeEventListener('touchstart', touched, true);
    el.removeEventListener('touchend', touched, true);
    removeEventListener('touchmove', watch, opts);
    removeEventListener('touchend', cancelPress, opts);
    removeEventListener('touchcancel', cancelPress, opts);
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
  /** lost: the socket dropped on its own (the phone suspends the app in the background), it reconnects by itself. */
  const [state, setState] = useState<'connecting' | 'open' | 'lost' | 'closed'>('connecting');
  const [attempt, setAttempt] = useState(0);
  /** Automatic reconnections in a row without the socket opening. */
  const retries = useRef(0);
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
  const theme = appearance.value;

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
      if (keyboardShown() && !keyboardDismissed) return;
      el.blur();
    }
    keyboardDismissed = false;
    el.focus({ preventScroll: true });
  };
  /** Scrolling to read: the keyboard goes away (what was typed is already sent). */
  const hideKeyboard = () => {
    keyboardDismissed = false;
    input.current?.blur();
  };

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

  // A dropped socket comes back by itself: with backoff while the app is in front, and
  // right away when it comes back from the background (the timer does not run there).
  useEffect(() => {
    if (state !== 'lost') return;
    const retry = () => {
      if (document.visibilityState !== 'visible') return;
      retries.current++;
      setAttempt((a) => a + 1);
    };
    const onVisible = () => {
      retries.current = 0;
      retry();
    };
    const t = setTimeout(retry, Math.min(5000, 400 * 2 ** retries.current));
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [state]);

  function start(): () => void {
    // xterm opens a link when the mouse goes down and up on it, even after a drag: a
    // drag selects it instead (tmux copies what is dragged over).
    let downAt = { x: 0, y: 0 };
    const onMouseDown = (e: MouseEvent) => (downAt = { x: e.clientX, y: e.clientY });
    box.current!.addEventListener('mousedown', onMouseDown, true);
    const activate = (e: MouseEvent, uri: string) => {
      if (e.type === 'mouseup' && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 3) return;
      openLink(uri);
    };
    const term = new Terminal({
      fontFamily: FONT_FAMILY,
      fontSize,
      theme: TERM_THEMES[theme].xterm,
      minimumContrastRatio: TERM_THEMES[theme].minContrast,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 2000,
      // Like Ghostty here (macos-option-as-alt = false): Option types characters.
      macOptionIsMeta: false,
      // Option+drag selects text even while tmux has the mouse; Cmd+C copies it.
      macOptionClickForcesSelection: true,
      // OSC 8 links open like the others, without xterm's confirm().
      linkHandler: { activate },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon(activate));
    term.loadAddon(new ClipboardAddon(undefined, clipboardProvider(term)));
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
    /** The pty ended (the space was closed, tmux could not start...): reconnecting would not bring it back. */
    let exited = false;
    let disposed = false;
    ws.onopen = () => {
      retries.current = 0;
      setState('open');
      // The layout may have settled while connecting (the pending strip, the pane tabs, the key bar):
      // resizes then were not sent, and tmux would keep the size of the moment the socket was opened.
      fit.fit();
      ws.send(JSON.stringify({ t: 'r', cols: term.cols, rows: term.rows }));
    };
    /** A ping without answer yet (see probe). */
    let probeTimer: ReturnType<typeof setTimeout> | undefined;
    ws.onmessage = (ev) => {
      // Anything arriving proves the socket alive.
      clearTimeout(probeTimer);
      probeTimer = undefined;
      if (typeof ev.data === 'string') {
        // Control message: {t:'exit'} when the pty ended, {t:'pong'}.
        if ((JSON.parse(ev.data) as { t: string }).t === 'exit') exited = true;
        return;
      }
      term.write(new Uint8Array(ev.data as ArrayBuffer));
    };
    ws.onclose = () => {
      clearTimeout(probeTimer);
      if (disposed) return;
      setState(exited || retries.current >= 5 ? 'closed' : 'lost');
    };
    /**
     * Back to the front, or on another network: the socket may have died without closing
     * (the screen would stay as it was and what is typed would go nowhere). Without an
     * answer in time it is dropped, and the 'lost' state reconnects.
     */
    const probe = () => {
      if (document.visibilityState !== 'visible' || ws.readyState !== WebSocket.OPEN || probeTimer) return;
      probeTimer = setTimeout(() => {
        if (disposed) return;
        ws.onclose = null; // a dead socket may take minutes to report its close
        ws.close();
        retries.current = 0;
        setState('lost');
      }, PROBE_MS);
      ws.send(JSON.stringify({ t: 'ping' }));
    };
    document.addEventListener('visibilitychange', probe);
    globalThis.addEventListener('online', probe);

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      // Cmd+C with text selected in the terminal (Option+drag): copied cleaned up.
      if (e.metaKey && e.key === 'c' && term.hasSelection()) {
        e.preventDefault();
        void copyFromTerminal(term, term.getSelection(), term.getSelectionPosition()?.start.x);
        return false;
      }
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
            const { col, row } = cellAt(box.current!, term, x, y);
            const link = linkAt(term, col, row);
            if (link) return link.activate(new MouseEvent('click'), link.text);
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
      box.current?.removeEventListener('mousedown', onMouseDown, true);
      ro.disconnect();
      unbindTouch();
      unbindInput();
      clearTimeout(t);
      dataSub.dispose();
      selectionSub.dispose();
      resizeSub.dispose();
      document.removeEventListener('visibilitychange', probe);
      globalThis.removeEventListener('online', probe);
      clearTimeout(probeTimer);
      disposed = true;
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
  const pageUp = () => {
    hideKeyboard();
    // A full-screen program does not report it scrolled: the count keeps the buttons up.
    setScrolledUp((up) => up + (termRef.current?.rows ?? 1));
    void hub.action(host.id, { op: 'pageUp', pane: pane.id }).catch(() => {});
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
    if (!term || !range) return;
    // Just a link selected: its URL (an OSC 8 link shows other text, a long URL wraps).
    const link = linkAt(term, range[0] % term.cols, Math.floor(range[0] / term.cols));
    const whole = link && linkRange(term, link);
    const text = term.getSelection();
    term.clearSelection();
    if (whole && whole[0] === range[0] && whole[1] === range[1]) void copyText(link.text);
    else if (text) void copyFromTerminal(term, text, range[0] % term.cols);
  };

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = fontSize;
    fitRef.current?.fit();
  }, [fontSize]);

  // A dictation on this pane ended: on a computer the terminal takes the keyboard back (the 🎤 had it),
  // ready for Enter. On a phone the keyboard stays as it was, like with the key buttons.
  const ended = dictationEnded.value;
  useEffect(() => {
    if (ended?.pane === pane.id && !isTouch) termRef.current?.focus();
  }, [ended]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = TERM_THEMES[theme].xterm;
    term.options.minimumContrastRatio = TERM_THEMES[theme].minContrast;
  }, [theme]);

  const toggle = (m: Mod) => {
    const next = new Set(mods);
    if (next.has(m)) next.delete(m);
    else next.add(m);
    setMods(next);
  };

  /** A key or text button of the bar, with the sticky Ctrl/Alt (used up by it). */
  const press = (b: KeybarButton) => {
    const ctrl = mods.has('ctrl');
    const alt = mods.has('alt');
    if (mods.size) setMods(new Set());
    if (b.kind === 'key') return sendRaw(keySeq(b.key, ctrl || !!b.ctrl, alt || !!b.alt));
    if (b.kind !== 'text') return;
    sendRaw(b.text.length === 1 ? applyMods(b.text, ctrl, alt) : b.text);
    if (b.enter) setTimeout(() => sendRaw('\r'), ENTER_DELAY_MS);
  };

  /**
   * A button over the terminal keeps the keyboard as it is. Up, the input proxy keeps the
   * focus. Put away with Android's back gesture, the proxy is still focused and Chrome
   * would bring the keyboard back on the tap: it lets go of the focus instead.
   */
  const keepFocus = (e: Event) => {
    e.preventDefault();
    if (document.activeElement === input.current && keyboardDismissed) hideKeyboard();
  };
  const keybarButton = (b: KeybarButton, i: number) => {
    const label = b.label || defaultLabel(b);
    switch (b.kind) {
      case 'attach':
        return <AttachButton key={i} hostId={host.id} paneId={pane.id} class="key" label={b.label} />;
      case 'mic':
        return <MicButton key={i} hostId={host.id} paneId={pane.id} class="key" label={b.label} onPointerDown={keepFocus} />;
      case 'ctrl':
      case 'alt':
        return (
          <button key={i} class={`key mod ${mods.has(b.kind) ? 'on' : ''}`} onPointerDown={keepFocus} onClick={() => toggle(b.kind as Mod)} aria-pressed={mods.has(b.kind)}>
            {label}
          </button>
        );
      case 'prefix':
        return (
          <button key={i} class="key key-prefix" onPointerDown={keepFocus} onClick={() => sendRaw(prefixBytes(host.prefix))} title={`Prefijo de tmux (${host.prefix ?? 'C-b'})`}>
            {b.label || (host.prefix ?? 'C-b').replace('C-', '^')}
          </button>
        );
      default:
        return (
          <button key={i} class="key" title={describe(b)} onPointerDown={keepFocus} onClick={() => press(b)}>
            {label}
          </button>
        );
    }
  };
  const keybar = hubSettings.value?.keybar ?? DEFAULT_KEYBAR;
  const keyScale = (hubSettings.value?.keybarScale ?? KEYBAR_SCALE_DEFAULT) / 100;

  return (
    <div class="term">
      <div class="term-main" ref={main}>
        <div class="term-box" ref={box} />
        {(pane.inMode || scrolledUp > 0) && (
          <div class="fabs">
            <button class="fab" aria-label="Página anterior" title="Página anterior" onPointerDown={keepFocus} onClick={pageUp}>
              <IconPageUp />
            </button>
            <button class="fab" aria-label="Ir al final" title="Ir al final" onPointerDown={keepFocus} onClick={scrollToEnd}>
              <IconEnd />
            </button>
          </div>
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
          {state === 'connecting' || state === 'lost' ? (
            <span class="dim">{attempt > 0 ? 'Reconectando…' : 'Abriendo terminal…'}</span>
          ) : (
            <>
              <span>Terminal desconectada</span>
              <button
                class="btn"
                onClick={() => {
                  retries.current = 0;
                  setAttempt(attempt + 1);
                }}
              >
                Reconectar
              </button>
            </>
          )}
        </div>
      )}
      {above && <div class="term-above">{above}</div>}
      {isTouch && keybar.length > 0 && <div class="keybar scroll-x" style={{ '--key-scale': keyScale }}>{keybar.map(keybarButton)}</div>}
    </div>
  );
}
