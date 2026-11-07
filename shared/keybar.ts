/**
 * The key bar under the terminal on a phone: a hub setting, the same on every device.
 * Each button has a label ("" for the default one) and what it does: a key (one of
 * KEYS or a single character, with Ctrl and/or Alt), a text (with or without Enter
 * after it), or one of the bar's own buttons.
 */

/** Keys a button can send besides a plain character. */
export const KEYS = {
  up: { label: '↑', name: 'Flecha arriba', seq: '\x1b[A', csi: 'A' },
  down: { label: '↓', name: 'Flecha abajo', seq: '\x1b[B', csi: 'B' },
  left: { label: '←', name: 'Flecha izquierda', seq: '\x1b[D', csi: 'D' },
  right: { label: '→', name: 'Flecha derecha', seq: '\x1b[C', csi: 'C' },
  enter: { label: 'Enter', name: 'Enter', seq: '\r' },
  esc: { label: 'Esc', name: 'Escape', seq: '\x1b' },
  newline: { label: '⏎ línea', name: 'Salto de línea sin enviar (como Shift+Enter)', seq: '\n' },
  tab: { label: 'Tab', name: 'Tab', seq: '\t' },
  shiftTab: { label: '⇧Tab', name: 'Shift+Tab (modo de Claude)', seq: '\x1b[Z' },
  pgUp: { label: 'PgUp', name: 'Página arriba', seq: '\x1b[5~', tilde: '5' },
  pgDn: { label: 'PgDn', name: 'Página abajo', seq: '\x1b[6~', tilde: '6' },
  home: { label: 'Inicio', name: 'Inicio', seq: '\x1b[H', csi: 'H' },
  end: { label: 'Fin', name: 'Fin', seq: '\x1b[F', csi: 'F' },
  del: { label: 'Supr', name: 'Suprimir', seq: '\x1b[3~', tilde: '3' },
  backspace: { label: '⌫', name: 'Retroceso', seq: '\x7f' },
} as const satisfies Record<string, { label: string; name: string; seq: string; csi?: string; tilde?: string }>;
export type KeyName = keyof typeof KEYS;

/** The bar's own buttons: they do something other than send keys. */
export const SPECIALS = {
  attach: { label: '📎', name: 'Adjuntar ficheros' },
  mic: { label: '🎤', name: 'Dictado (solo con el dictado activado)' },
  ctrl: { label: 'Ctrl', name: 'Ctrl para la siguiente tecla' },
  alt: { label: 'Alt', name: 'Alt para la siguiente tecla' },
  prefix: { label: '', name: 'Prefijo de tmux de la máquina' },
} as const;
export type SpecialKind = keyof typeof SPECIALS;

export type KeybarButton =
  /** key: a KeyName or one character. */
  | { kind: 'key'; label: string; key: string; ctrl?: boolean; alt?: boolean }
  | { kind: 'text'; label: string; text: string; enter?: boolean }
  | { kind: SpecialKind; label: string };

export const LABEL_MAX = 16;
export const TEXT_MAX = 1000;
export const KEYBAR_MAX = 60;

/** The bar's buttons, in % of their usual size: from KEYBAR_SCALE_MIN to KEYBAR_SCALE_MAX, in steps of KEYBAR_SCALE_STEP. */
export const KEYBAR_SCALE_DEFAULT = 100;
export const KEYBAR_SCALE_MIN = 70;
export const KEYBAR_SCALE_MAX = 150;
export const KEYBAR_SCALE_STEP = 10;

/** A scale the bar can have, or null. */
export function sanitizeKeybarScale(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return null;
  if (raw < KEYBAR_SCALE_MIN || raw > KEYBAR_SCALE_MAX || (raw - KEYBAR_SCALE_MIN) % KEYBAR_SCALE_STEP) return null;
  return raw;
}

const key = (k: string, label = '', mods: { ctrl?: boolean; alt?: boolean } = {}): KeybarButton => ({ kind: 'key', label, key: k, ...mods });
const special = (kind: SpecialKind): KeybarButton => ({ kind, label: '' });

/** The bar as it always was. */
export const DEFAULT_KEYBAR: KeybarButton[] = [
  special('attach'),
  special('mic'),
  key('up'),
  key('down'),
  key('left'),
  key('right'),
  key('enter'),
  special('ctrl'),
  special('alt'),
  special('prefix'),
  key('esc'),
  key('newline'),
  key('shiftTab'),
  key('c', '', { ctrl: true }),
  ...['1', '2', '3'].map((c) => key(c)),
  key('tab'),
  key('pgUp'),
  key('pgDn'),
  ...['|', '~', '/', '-'].map((c) => key(c)),
];

export function isKeyName(k: string): k is KeyName {
  return Object.hasOwn(KEYS, k);
}

/** One printable character (a single code point, not a control one). */
export function isKeyChar(k: string): boolean {
  return [...k].length === 1 && !/[\x00-\x1f\x7f]/.test(k);
}

/** What a button shows when its label is empty. `prefix` depends on the host. */
export function defaultLabel(b: KeybarButton): string {
  if (b.kind === 'key') {
    const base = isKeyName(b.key) ? KEYS[b.key].label : b.ctrl ? b.key.toUpperCase() : b.key;
    return `${b.alt ? '⌥' : ''}${b.ctrl ? '^' : ''}${base}`;
  }
  if (b.kind === 'text') return b.text.length > LABEL_MAX ? `${b.text.slice(0, LABEL_MAX - 1)}…` : b.text;
  return SPECIALS[b.kind].label;
}

/** What it does, in words: the tooltip in the bar and the summary in the settings. */
export function describe(b: KeybarButton): string {
  if (b.kind === 'key') {
    const base = isKeyName(b.key) ? KEYS[b.key].name : b.key === ' ' ? 'Espacio' : b.ctrl ? b.key.toUpperCase() : b.key;
    if (!isKeyName(b.key) && !b.ctrl && !b.alt) return `Tecla «${base}»`;
    return [b.ctrl && 'Ctrl', b.alt && 'Alt', base].filter(Boolean).join('+');
  }
  if (b.kind === 'text') return `Escribe «${b.text}»${b.enter ? ' y pulsa Enter' : ''}`;
  return SPECIALS[b.kind].name;
}

/** Sticky Ctrl/Alt on one character, as a terminal sends it. */
export function applyMods(data: string, ctrl: boolean, alt: boolean): string {
  let out = data;
  if (ctrl && out.length === 1) {
    const c = out.toLowerCase().charCodeAt(0);
    if (c >= 0x61 && c <= 0x7a) out = String.fromCharCode(c & 0x1f);
    else if (out === ' ' || out === '@') out = '\x00';
    else if ('[\\]^_'.includes(out)) out = String.fromCharCode(out.charCodeAt(0) & 0x1f);
  }
  if (alt) out = `\x1b${out}`;
  return out;
}

/** The bytes of a key with modifiers (xterm's encoding for arrows and the like: 3 Alt, 5 Ctrl, 7 both). */
export function keySeq(k: string, ctrl = false, alt = false): string {
  if (!isKeyName(k)) return applyMods(k, ctrl, alt);
  const def: { seq: string; csi?: string; tilde?: string } = KEYS[k];
  if (!ctrl && !alt) return def.seq;
  const m = 1 + (alt ? 2 : 0) + (ctrl ? 4 : 0);
  if (def.csi) return `\x1b[1;${m}${def.csi}`;
  if (def.tilde) return `\x1b[${def.tilde};${m}~`;
  return applyMods(def.seq, ctrl, alt);
}

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

/** Only well-formed buttons, trimmed to the limits; null when it is not a list at all. */
export function sanitizeKeybar(raw: unknown): KeybarButton[] | null {
  if (!Array.isArray(raw)) return null;
  const out: KeybarButton[] = [];
  for (const b of raw) {
    if (out.length >= KEYBAR_MAX) break;
    if (!b || typeof b !== 'object') continue;
    const label = [...str(b.label, 200).trim()].slice(0, LABEL_MAX).join('');
    if (b.kind === 'key') {
      const k = str(b.key, 20);
      if (!isKeyName(k) && !isKeyChar(k)) continue;
      const btn: KeybarButton = { kind: 'key', label, key: k };
      if (b.ctrl === true) btn.ctrl = true;
      if (b.alt === true) btn.alt = true;
      out.push(btn);
    } else if (b.kind === 'text') {
      const text = str(b.text, TEXT_MAX);
      if (!text) continue;
      out.push(b.enter === true ? { kind: 'text', label, text, enter: true } : { kind: 'text', label, text });
    } else if (typeof b.kind === 'string' && Object.hasOwn(SPECIALS, b.kind)) {
      out.push({ kind: b.kind as SpecialKind, label });
    }
  }
  return out;
}
