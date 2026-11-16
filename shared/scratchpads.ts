/**
 * The scratchpads: five coloured lists of short notes to paste into a pane later.
 * Their limits and validation, shared by the hub (which enforces them) and the panel
 * (which shows them).
 */
import type { ScratchpadNote, ScratchpadNoteOrigin, Scratchpads } from './types.js';

/** How many scratchpads there are, by storage position: blue, green, orange, yellow, purple. */
export const SCRATCHPAD_COUNT = 5 satisfies Scratchpads['length'];
export const SCRATCHPAD_MAX_NOTES = 20;
export const SCRATCHPAD_MAX_CHARS = 4000;
/** From how many characters the panel shows a note's length against `SCRATCHPAD_MAX_CHARS`. */
export const SCRATCHPAD_COUNTER_FROM = 3500;

/** A note's length as the hub stores it: without its trailing whitespace. The panel's counter shows it. */
export function noteLength(raw: string): number {
  return raw.trimEnd().length;
}

/** A note's text without its trailing whitespace, or why it cannot be one. */
export function noteText(raw: unknown): { ok: true; text: string } | { ok: false; error: string } {
  if (typeof raw !== 'string') return { ok: false, error: 'Falta el texto de la nota' };
  const text = raw.slice(0, noteLength(raw));
  if (!text.trim()) return { ok: false, error: 'La nota está vacía' };
  if (text.length > SCRATCHPAD_MAX_CHARS) return { ok: false, error: `Una nota admite como mucho ${SCRATCHPAD_MAX_CHARS} caracteres` };
  return { ok: true, text };
}

/** The longest id or name a note's window origin keeps. */
export const ORIGIN_MAX_CHARS = 200;

/** A note's window origin read from storage, or undefined when any field is missing or malformed. */
export function noteOrigin(raw: unknown): ScratchpadNoteOrigin | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const { host, window, hostName, session, sessionId, sessionCreated, index, name } = raw as Record<string, unknown>;
  const text = (v: unknown): v is string => typeof v === 'string' && v.length <= ORIGIN_MAX_CHARS;
  const count = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
  if (!text(host) || !text(window) || !text(hostName) || !text(session) || !text(sessionId) || !text(name)) return undefined;
  if (!count(index) || !count(sessionCreated)) return undefined;
  return { host, window, hostName, session, sessionId, sessionCreated, index, name };
}

/**
 * Scratchpads read from storage: always `SCRATCHPAD_COUNT`, each with at most
 * `SCRATCHPAD_MAX_NOTES` valid notes, every id once; a malformed window origin is
 * dropped and its note kept. A missing position reads as empty,
 * so a file saved with three scratchpads keeps its notes in place.
 */
export function sanitizeScratchpads(raw: unknown): Scratchpads {
  const seen = new Set<string>();
  const pad = (i: number): ScratchpadNote[] => {
    const list = Array.isArray(raw) && Array.isArray(raw[i]) ? (raw[i] as unknown[]) : [];
    const notes: ScratchpadNote[] = [];
    for (const n of list) {
      if (!n || typeof n !== 'object') continue;
      const { id, text, pinned, origin } = n as Record<string, unknown>;
      const checked = noteText(text);
      if (typeof id !== 'string' || !id || seen.has(id) || !checked.ok) continue;
      seen.add(id);
      const from = noteOrigin(origin);
      notes.push(from ? { id, text: checked.text, pinned: !!pinned, origin: from } : { id, text: checked.text, pinned: !!pinned });
      if (notes.length === SCRATCHPAD_MAX_NOTES) break;
    }
    return notes;
  };
  return [pad(0), pad(1), pad(2), pad(3), pad(4)];
}
