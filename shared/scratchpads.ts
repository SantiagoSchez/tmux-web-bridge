/**
 * The scratchpads: three coloured lists of short notes to paste into a pane later.
 * Their limits and validation, shared by the hub (which enforces them) and the panel
 * (which shows them).
 */
import type { ScratchpadNote, Scratchpads } from './types.js';

export const SCRATCHPAD_COUNT = 3;
export const SCRATCHPAD_MAX_NOTES = 10;
export const SCRATCHPAD_MAX_CHARS = 4000;

/** A note's text without its trailing whitespace, or why it cannot be one. */
export function noteText(raw: unknown): { ok: true; text: string } | { ok: false; error: string } {
  if (typeof raw !== 'string') return { ok: false, error: 'Falta el texto de la nota' };
  const text = raw.trimEnd();
  if (!text.trim()) return { ok: false, error: 'La nota está vacía' };
  if (text.length > SCRATCHPAD_MAX_CHARS) return { ok: false, error: `Una nota admite como mucho ${SCRATCHPAD_MAX_CHARS} caracteres` };
  return { ok: true, text };
}

/** Scratchpads read from storage: always three, each with at most 10 valid notes, every id once. */
export function sanitizeScratchpads(raw: unknown): Scratchpads {
  const seen = new Set<string>();
  const pad = (i: number): ScratchpadNote[] => {
    const list = Array.isArray(raw) && Array.isArray(raw[i]) ? (raw[i] as unknown[]) : [];
    const notes: ScratchpadNote[] = [];
    for (const n of list) {
      if (!n || typeof n !== 'object') continue;
      const { id, text, pinned } = n as Record<string, unknown>;
      const checked = noteText(text);
      if (typeof id !== 'string' || !id || seen.has(id) || !checked.ok) continue;
      seen.add(id);
      notes.push({ id, text: checked.text, pinned: !!pinned });
      if (notes.length === SCRATCHPAD_MAX_NOTES) break;
    }
    return notes;
  };
  return [pad(0), pad(1), pad(2)];
}
