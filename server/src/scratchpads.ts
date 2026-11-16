// The scratchpads: five coloured lists of up to 20 short notes the owner jots down
// to tell Claude later, kept by the hub so every device shows the same notes. A note
// is pasted into a pane by index.ts; here it is only marked while that happens, so two
// devices pressing at once paste it once, and removed afterwards unless pinned.
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { noteText, sanitizeScratchpads, SCRATCHPAD_COUNT, SCRATCHPAD_MAX_NOTES } from '../../shared/scratchpads.js';
import type { ScratchpadNote, Scratchpads } from '../../shared/types.js';

/** A refused change, with the HTTP status its route answers (400 bad input, 404 gone, 409 full or already being pasted, 502 the machine failed the paste). */
export class ScratchpadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const GONE = 'La nota ya no existe';

/**
 * The notes of the five scratchpads, in dataDir/scratchpads.json.
 * Events: 'change' (Scratchpads).
 */
export class ScratchpadStore extends EventEmitter {
  private readonly file: string;
  private data: Scratchpads = [[], [], [], [], []];
  /** Notes being pasted right now: a second paste of one of them is refused. */
  private readonly pasting = new Set<string>();

  constructor(dataDir: string) {
    super();
    this.file = join(dataDir, 'scratchpads.json');
    if (existsSync(this.file)) {
      try {
        this.data = sanitizeScratchpads(JSON.parse(readFileSync(this.file, 'utf8')));
      } catch {
        console.warn('[scratchpads] scratchpads.json ilegible: scratchpads vacíos');
      }
    }
  }

  get pads(): Scratchpads {
    return this.data;
  }

  /** Adds a note at the end of scratchpad `pad` (0..4) and returns its id. */
  add(pad: number, text: unknown): string {
    if (!Number.isInteger(pad) || pad < 0 || pad >= SCRATCHPAD_COUNT) throw new ScratchpadError('Ese scratchpad no existe', 400);
    const checked = noteText(text);
    if (!checked.ok) throw new ScratchpadError(checked.error, 400);
    if (this.data[pad].length >= SCRATCHPAD_MAX_NOTES) throw new ScratchpadError(`El scratchpad está lleno: admite ${SCRATCHPAD_MAX_NOTES} notas`, 409);
    const id = randomUUID();
    this.change(pad, [...this.data[pad], { id, text: checked.text, pinned: false }]);
    return id;
  }

  /** Changes a note's text (an empty one removes it) and/or whether it is pinned. */
  edit(id: string, patch: { text?: unknown; pinned?: boolean }): void {
    const [pad, note] = this.find(id);
    let next: ScratchpadNote = note;
    if (patch.text !== undefined) {
      const checked = noteText(patch.text);
      if (!checked.ok) {
        if (typeof patch.text === 'string' && !patch.text.trim()) return this.remove(id);
        throw new ScratchpadError(checked.error, 400);
      }
      next = { ...next, text: checked.text };
    }
    if (patch.pinned !== undefined) next = { ...next, pinned: patch.pinned };
    this.change(pad, this.data[pad].map((n) => (n.id === id ? next : n)));
  }

  remove(id: string): void {
    const [pad] = this.find(id);
    this.change(pad, this.data[pad].filter((n) => n.id !== id));
  }

  /**
   * Pastes a note with `send(text)` (the route's paste into a pane). The note is marked
   * while `send` runs, so a second paste of it gets 409 instead of typing it twice. When
   * `send` resolves the note goes, unless it is pinned; when it rejects the note stays
   * and the error goes up.
   */
  async paste(id: string, send: (text: string) => Promise<void>): Promise<void> {
    if (this.pasting.has(id)) throw new ScratchpadError('Esa nota ya se está pegando', 409);
    const [, note] = this.find(id);
    this.pasting.add(id);
    try {
      await send(note.text);
    } finally {
      this.pasting.delete(id);
    }
    const found = this.data.findIndex((notes) => notes.some((n) => n.id === id && !n.pinned));
    if (found >= 0) this.change(found, this.data[found].filter((n) => n.id !== id));
  }

  private find(id: string): [number, ScratchpadNote] {
    for (let pad = 0; pad < SCRATCHPAD_COUNT; pad++) {
      const note = this.data[pad].find((n) => n.id === id);
      if (note) return [pad, note];
    }
    throw new ScratchpadError(GONE, 404);
  }

  private change(pad: number, notes: ScratchpadNote[]): void {
    const next: Scratchpads = [...this.data];
    next[pad] = notes;
    this.data = next;
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    renameSync(tmp, this.file);
    this.emit('change', this.data);
  }
}
