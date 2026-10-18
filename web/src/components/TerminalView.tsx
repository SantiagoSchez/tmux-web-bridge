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
import { IconDown } from './icons';

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
    try {
      await navigator.clipboard.writeText(text);
      toast(`Copiado al portapapeles (${text.length} caracteres)`);
    } catch {
      toast('El navegador no ha dejado copiar al portapapeles', 'error');
    }
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

/**
 * Touch scrolling. xterm.js ignores finger drags, and with tmux (mouse on) or a
 * full-screen TUI the terminal has no scrollback of its own: the drag becomes
 * wheel events, which tmux or the app (Claude Code) turn into scrolling. A tap
 * (no drag) calls onTap; a drag calls onScroll once, as it starts, and onLine for
 * every line it scrolls (1 down, -1 up).
 */
function bindTouch(el: HTMLElement, term: Terminal, onTap: () => void, onScroll: () => void, onLine: (dir: 1 | -1) => void): () => void {
  let lastY = 0;
  let acc = 0;
  let dragging = false;
  const lineHeight = () => Math.max(8, (el.querySelector('.xterm-screen') as HTMLElement | null)?.clientHeight ?? 0) / term.rows || 16;
  const start = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    lastY = e.touches[0].clientY;
    acc = 0;
    dragging = false;
  };
  const move = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    acc += lastY - t.clientY;
    lastY = t.clientY;
    if (!dragging && Math.abs(acc) < 10) return;
    if (!dragging) onScroll();
    dragging = true;
    e.preventDefault();
    const step = lineHeight();
    const target = el.querySelector('.xterm-screen') ?? el;
    while (Math.abs(acc) >= step) {
      const dir = acc > 0 ? 1 : -1;
      acc -= dir * step;
      onLine(dir);
      target.dispatchEvent(
        new WheelEvent('wheel', { deltaY: dir, deltaMode: WheelEvent.DOM_DELTA_LINE, clientX: t.clientX, clientY: t.clientY, bubbles: true, cancelable: true }),
      );
    }
  };
  const end = (e: TouchEvent) => {
    e.preventDefault(); // no synthetic mouse events: xterm must not grab the focus
    if (!dragging) onTap();
  };
  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchmove', move, { passive: false });
  el.addEventListener('touchend', end, { passive: false });
  return () => {
    el.removeEventListener('touchstart', start);
    el.removeEventListener('touchmove', move);
    el.removeEventListener('touchend', end);
  };
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
    const resizeSub = term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'r', cols, rows }));
    });
    let t: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => fit.fit(), 60);
    });
    ro.observe(box.current!);
    const unbindTouch = isTouch ? bindTouch(box.current!, term, focusInput, hideKeyboard, (dir) => setScrolledUp((up) => Math.max(0, up - dir))) : () => {};
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
      <div class="term-main">
        <div class="term-box" ref={box} />
        {(pane.inMode || scrolledUp > 0) && (
          <button class="fab" aria-label="Ir al final" title="Ir al final" onPointerDown={keepFocus} onClick={scrollToEnd}>
            <IconDown />
          </button>
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
