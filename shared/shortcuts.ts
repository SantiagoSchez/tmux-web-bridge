/**
 * The panel's keyboard shortcuts: how a combination is written down, which ones are
 * refused, the configurable shortcuts and their defaults, and how a combination is
 * shown. Shared by the hub (which checks the dictation shortcut it keeps) and the panel.
 */

/**
 * A keyboard shortcut as it is kept: the modifiers in this order, then the key's
 * KeyboardEvent.code (where it is on the keyboard, whatever the layout), joined by "+":
 * "ctrl+shift+Space", "alt+KeyD", "F9".
 */
export interface Shortcut {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  code: string;
}

const MODS = ['ctrl', 'alt', 'shift', 'meta'] as const;
const CODE = /^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-2])|Space|Enter|Backspace|Tab|Insert|Delete|Home|End|PageUp|PageDown|Arrow(Up|Down|Left|Right)|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|IntlBackslash)$/;

export function parseShortcut(raw: string): Shortcut | null {
  const parts = raw.split('+');
  const code = parts.pop() ?? '';
  if (!CODE.test(code)) return null;
  const sc: Shortcut = { ctrl: false, alt: false, shift: false, meta: false, code };
  let last = -1;
  for (const p of parts) {
    const i = MODS.indexOf(p as (typeof MODS)[number]);
    if (i <= last) return null; // unknown, repeated or out of order: not one we wrote
    sc[MODS[i]] = true;
    last = i;
  }
  return shortcutProblem(sc) ? null : sc;
}

export function serializeShortcut(sc: Shortcut): string {
  return [...MODS.filter((m) => sc[m]), sc.code].join('+');
}

/**
 * Why a combination cannot be a shortcut, or null when it can. Without Ctrl, Alt or Cmd
 * (F1–F12 aside) it would type into the pane; Ctrl+letter is the terminal's (Ctrl+C,
 * Ctrl+R…); Ctrl(+Shift)(+Alt)+1…9 are the panel's number shortcuts. A clash with another
 * configurable shortcut is `shortcutClash`'s.
 */
export function shortcutProblem(sc: Shortcut): string | null {
  const fn = /^F\d+$/.test(sc.code);
  if (!sc.ctrl && !sc.alt && !sc.meta && !fn) return 'Necesita Ctrl, Alt o Cmd (o una tecla F1–F12): si no, se escribiría en el terminal.';
  if (sc.ctrl && !sc.alt && !sc.shift && !sc.meta && /^Key/.test(sc.code)) return 'Ctrl con una letra es del terminal (Ctrl+C, Ctrl+R…): añade Shift o Alt.';
  if (sc.ctrl && !sc.meta && /^Digit[1-9]$/.test(sc.code)) return 'Ctrl con un número ya es de la app (ir a una ventana, un espacio o una máquina).';
  return null;
}

/** The shortcuts each device can change, kept in its preferences. */
export type PanelShortcutId = 'search' | 'foldList' | 'foldPads' | 'quickNote';

/** Each configurable panel shortcut, in the order the settings list them, with its defaults on a Mac and elsewhere. */
export const PANEL_SHORTCUTS: readonly { id: PanelShortcutId; label: string; mac: string; other: string }[] = [
  { id: 'search', label: 'Buscar una ventana', mac: 'meta+KeyK', other: 'ctrl+shift+KeyK' },
  { id: 'foldList', label: 'Plegar la lista', mac: 'meta+KeyB', other: 'ctrl+shift+KeyB' },
  { id: 'foldPads', label: 'Plegar los scratchpads', mac: 'meta+Period', other: 'ctrl+shift+Period' },
  { id: 'quickNote', label: 'Nota rápida', mac: 'ctrl+alt+KeyN', other: 'ctrl+alt+KeyN' },
];

/** The default combination of a panel shortcut on a Mac or another computer. */
export function panelDefault(id: PanelShortcutId, mac: boolean): string {
  const def = PANEL_SHORTCUTS.find((s) => s.id === id)!;
  return mac ? def.mac : def.other;
}

/** A panel shortcut: the saved combination when it is a valid one, else the default of the device's kind. */
export function panelShortcut(id: PanelShortcutId, saved: string | undefined, mac: boolean): Shortcut {
  return (saved !== undefined && parseShortcut(saved)) || parseShortcut(panelDefault(id, mac))!;
}

/** Whether a key event is this combination: the same key and exactly the same modifiers. */
export function matchesShortcut(e: { code: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }, sc: Shortcut): boolean {
  return e.code === sc.code && e.ctrlKey === sc.ctrl && e.altKey === sc.alt && e.shiftKey === sc.shift && e.metaKey === sc.meta;
}

/** The label of the shortcut in `taken` that already uses this combination, or null. */
export function shortcutClash(sc: Shortcut, taken: readonly { label: string; shortcut: Shortcut }[]): string | null {
  const key = serializeShortcut(sc);
  return taken.find((t) => serializeShortcut(t.shortcut) === key)?.label ?? null;
}

const KEY_NAMES: Record<string, string> = {
  Space: 'Espacio', Enter: 'Enter', Backspace: '⌫', Tab: 'Tab', Insert: 'Insert', Delete: 'Supr', Home: 'Inicio', End: 'Fin', PageUp: 'RePág', PageDown: 'AvPág',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', IntlBackslash: '<',
};

/** A combination as the keyboard names it: «⌃⌥N», «⌘.» on a Mac (its symbols in its order), «Ctrl+Alt+N» elsewhere. */
export function formatShortcut(sc: Shortcut, mac: boolean): string {
  const key = KEY_NAMES[sc.code] ?? sc.code.replace(/^(Key|Digit)/, '');
  if (mac) return [sc.ctrl && '⌃', sc.alt && '⌥', sc.shift && '⇧', sc.meta && '⌘'].filter(Boolean).join('') + key;
  return [sc.ctrl && 'Ctrl', sc.alt && 'Alt', sc.shift && 'Shift', sc.meta && 'Win', key].filter(Boolean).join('+');
}
