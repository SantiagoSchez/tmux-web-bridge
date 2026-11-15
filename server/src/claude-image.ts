// The image behind a Claude Code placeholder ([Image #N]) in a pane, to open it in the
// panel's viewer. Claude Code saves every pasted image, sent or not, as
// <tmp>/claude-<uid>/<encoded cwd>/<session>/images/<N>.<ext>: its own layout, not an API
// (checked with Claude Code 2.1.325). The numbering can start again in a session, and the
// file then holds the latest image with that number.

import { shQuote } from './exec.js';

const SESSION = /^[0-9a-f-]{36}$/;

/** Whether a Claude Code session id and an image number can go into imageScript. */
export function isImageRef(session: string, n: number): boolean {
  return SESSION.test(session) && Number.isInteger(n) && n >= 1 && n <= 9999;
}

/**
 * One shell script: every <N>.* of the session under claude-<uid> of each temporary folder
 * Claude Code may use ($TMPDIR, /tmp, macOS's per-user one), and I and the newest of them.
 * Call only with what isImageRef accepts.
 */
export function imageScript(session: string, n: number): string {
  return (
    `s=${shQuote(session)}; u=$(id -u); set --; ` +
    `for b in "\${TMPDIR:-}" /tmp "$(getconf DARWIN_USER_TEMP_DIR 2>/dev/null)"; do ` +
    `[ -n "$b" ] || continue; for f in "\${b%/}/claude-$u"/*/"$s"/images/${n}.*; do [ -f "$f" ] && set -- "$@" "$f"; done; done; ` +
    `[ $# -gt 0 ] && printf 'I\\t%s\\n' "$(ls -t "$@" | head -n 1)"; true`
  );
}

/** The path imageScript printed, if any. */
export function parseImage(out: string): string | undefined {
  const line = out.split('\n').find((l) => l.startsWith('I\t'));
  return line ? line.slice(2) || undefined : undefined;
}
