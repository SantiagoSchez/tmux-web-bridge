/** The choices for HubSettings.dictationTimeout, in seconds. */
export const DICTATION_TIMEOUTS = [5, 10, 15, 20, 30] as const;

/** What the 🎤 button does: record while held (release sends, slide off discards), or tap to start and tap to send. */
export type DictationButton = 'hold' | 'toggle';

/**
 * A keyboard shortcut as HubSettings keeps it: the modifiers in this order, then the
 * key's KeyboardEvent.code (where it is on the keyboard, whatever the layout), joined
 * by "+": "ctrl+shift+Space", "alt+KeyD", "F9".
 */
export const DEFAULT_DICTATION_SHORTCUT = 'ctrl+shift+Space';

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
 * Why a combination cannot dictate, or null when it can. Without Ctrl, Alt or Cmd
 * (F1–F12 aside) it would type into the pane; Ctrl+letter is the terminal's (Ctrl+C,
 * Ctrl+R…); Ctrl(+Shift)(+Alt)+1…9 and Cmd+K are already the app's.
 */
export function shortcutProblem(sc: Shortcut): string | null {
  const fn = /^F\d+$/.test(sc.code);
  if (!sc.ctrl && !sc.alt && !sc.meta && !fn) return 'Necesita Ctrl, Alt o Cmd (o una tecla F1–F12): si no, se escribiría en el terminal.';
  if (sc.ctrl && !sc.alt && !sc.shift && !sc.meta && /^Key/.test(sc.code)) return 'Ctrl con una letra es del terminal (Ctrl+C, Ctrl+R…): añade Shift o Alt.';
  if (sc.ctrl && !sc.meta && /^Digit[1-9]$/.test(sc.code)) return 'Ctrl con un número ya es de la app (ir a una ventana, un espacio o una máquina).';
  if (sc.meta && !sc.ctrl && !sc.alt && !sc.shift && sc.code === 'KeyK') return 'Cmd+K ya abre la búsqueda.';
  return null;
}
