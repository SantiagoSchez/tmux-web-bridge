/** The choices for HubSettings.dictationTimeout, in seconds. */
export const DICTATION_TIMEOUTS = [5, 10, 15, 20, 30] as const;

/** What the 🎤 button does: record while held (release sends, slide off discards), or tap to start and tap to send. */
export type DictationButton = 'hold' | 'toggle';

/** The dictation shortcut until the owner changes it (Ajustes › Atajos), in the form of `serializeShortcut` (shared/shortcuts.ts). */
export const DEFAULT_DICTATION_SHORTCUT = 'ctrl+shift+Space';
