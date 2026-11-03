/**
 * Typing on a phone goes through a plain textarea (see TerminalView): each change of
 * its value is sent to the terminal as a diff against what was sent before. New
 * characters are typed and removed ones become backspaces, so when the keyboard
 * corrects a word it is simply rewritten.
 */

/** Zero-width sentinel that keeps the field non-empty, so backspace always fires. */
export const SENTINEL = '​';

export interface TypedDiff {
  /** Characters to erase (backspaces) before typing `added`. */
  removed: number;
  /** What to type: without the sentinel, newlines as Enter. */
  added: string;
  /** What the terminal holds now: the field's value with the typed case kept. */
  sent: string;
}

/**
 * Diff from `sent` (the field as the terminal has it) to the field's new `value`.
 * Gboard's autocorrect at times capitalizes the word just typed when it commits it
 * ("claude" becomes "Claude"): in a terminal the lowercase letter typed is kept, and
 * only what really changed is sent.
 */
export function typedDiff(sent: string, value: string): TypedDiff {
  let seen = value;
  let p = 0;
  for (;;) {
    while (p < sent.length && p < seen.length && sent[p] === seen[p]) p++;
    const typed = sent[p];
    if (!typed || typed === typed.toUpperCase() || seen[p] !== typed.toUpperCase()) break;
    seen = seen.slice(0, p) + typed + seen.slice(p + 1);
  }
  return {
    removed: sent.length - p,
    added: seen.slice(p).replaceAll(SENTINEL, '').replace(/\n/g, '\r'),
    sent: seen,
  };
}
