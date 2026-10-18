// Detects the numbered choice menus Claude Code draws (permission prompts,
// AskUserQuestion, plan approval) at the bottom of a pane:
//
//    Do you want to proceed?
//    ❯ 1. Yes
//      2. Yes, and don't ask again for this command
//      3. No, and tell Claude what to do differently (esc)
//
// Shared by the web app (answer buttons) and the hub (notification actions).
// Plain functions: imported at runtime by both sides.

export interface Choice {
  key: string; // the digit that selects it
  label: string;
  selected: boolean;
}

export interface ChoicePrompt {
  question?: string;
  choices: Choice[];
  /** Identifies this exact prompt, so a stale answer is never typed into something else. */
  fingerprint: string;
}

const ANSI = /\x1b\[[0-9;:?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][A-Z0-9]|\x1b[=>]/g;
const BOX = /^[\s│┃|╭╮╰╯─━]+|[\s│┃|╭╮╰╯─━]+$/g;
const OPTION = /^(❯|›|>)?\s*(\d{1,2})[.)]\s+(.+)$/;

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

/** The choice menu at the bottom of a pane's screen, or null if there is none. */
export function parseChoices(screen: string, bottomLines = 24): ChoicePrompt | null {
  const lines = screen.replace(ANSI, '').split('\n').map((l) => l.replace(BOX, ''));
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  const start = Math.max(0, lines.length - bottomLines);

  const found: { line: number; n: number; label: string; selected: boolean }[] = [];
  for (let i = start; i < lines.length; i++) {
    const m = OPTION.exec(lines[i]);
    if (m) found.push({ line: i, n: Number(m[2]), label: m[3].trim(), selected: !!m[1] });
  }

  // The last run 1, 2, 3... with at most 3 lines between options (room for descriptions).
  let best: typeof found = [];
  for (let i = 0; i < found.length; i++) {
    if (found[i].n !== 1) continue;
    const run = [found[i]];
    for (let j = i + 1; j < found.length; j++) {
      const prev = run[run.length - 1];
      if (found[j].n === prev.n + 1 && found[j].line - prev.line <= 4) run.push(found[j]);
      else if (found[j].line - prev.line > 4) break;
    }
    if (run.length >= 2) best = run;
  }
  // A menu has a cursor; a numbered list in Claude's prose does not.
  if (best.length < 2 || !best.some((o) => o.selected)) return null;

  let question: string | undefined;
  for (let i = best[0].line - 1; i >= Math.max(0, best[0].line - 5); i--) {
    const l = lines[i].trim();
    if (l && !OPTION.test(l)) {
      question = l;
      break;
    }
  }
  const choices = best.map((o) => ({ key: String(o.n), label: o.label.replace(/\s{2,}/g, ' ').slice(0, 90), selected: o.selected }));
  return { question, choices, fingerprint: hash(`${question ?? ''}\n${choices.map((c) => `${c.key}.${c.label}`).join('\n')}`) };
}
