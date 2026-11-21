# Design

## Context

See proposal.md for the motivation and specs/ for the behaviour.

- `HostMonitor` (`server/src/host.ts`) polls each machine's tmux every second and pushes the tree (`HostInfo` → `SessionInfo` → `WindowInfo` → `PaneInfo`) to the browsers in the `tree` and `host` messages.
- `GitScanner` (`server/src/git.ts`) runs one shell script per machine over the panes' folders, apart from the poll: when a folder shows up and every 15 s. It prints one tagged line per folder (`H`, `N`, `G` with the top folder, the git dir and the branch), `parseGit` turns them into `PaneGit`, and `apply()` copies what it knows into each `PaneInfo.git` on every poll.
- `harness-config.ts` holds the shell fragment `CONFIG_FILE` that picks `.claude/ka.json`, else `.claude/koalarnes.json`, under `$top`; `project-refs.ts` and `worktree-base.ts` use it.
- The file viewer (`openFile(origin, path)` in `web/src/components/Files.tsx`) takes an absolute path on the pane's machine and renders Markdown.
- The hover tooltip (`HoverTip.tsx`) lays out `windowDetails()` of `shared/window-details.ts`, which is pure and tested from `server/src/window-details.test.ts`; `web` has no test runner.
- The koalarnes harness writes `review.json` version 1 with `pr`, `budget.{maxRounds, extensions[].afterRound, resets[].afterRound}`, `rounds[].{n, counted}` and `findings[].{severity, state}`. Its own budget count is `budgetOf` in the plugin's `review-rounds.mjs`.

## Goals / Non-Goals

**Goals:**

- One reading of the changes per machine feeds the four places (row, card, tooltip, header) and the menu.
- The browser receives a summary, never the raw files.
- The rules of what is shown (the line's text) live in pure, tested code shared by the hub and the panel.

**Non-Goals:**

- Caching file contents between scans by modification time.
- A REST endpoint for the changes.

## Decisions

### D1. The git scanner reads the changes, not an on-demand endpoint

**Context.** The prompt allowed an on-demand read like `/api/refs/context` or the scanner. The row and the pending card need the changes of every window at once, and the header needs the same data for one.

**Decision.** `gitScript` also prints, once per repository top folder that has a harness configuration, the changes of that top folder; `parseGit` resolves them to each folder through its top folder, `GitScanner` keeps them per folder and `apply()` copies them into `PaneInfo.changes` next to `PaneInfo.git`. The header and the menu read `PaneInfo.changes` from the tree like the row does.

**Alternatives.** An endpoint per window, as `ChangesButton` does with `/api/git/stat`: the row and the card would need one request per window and per device, every few seconds. Rejected.

**Consequences.** The data reaches every device with the tree, and is at most 15 s old (D5 shortens it after a state change). `PaneInfo` grows one optional field.

### D2. The shell counts the checkboxes, the hub parses review.json

**Decision.** For each change folder the script prints one line `S <top> <name> <ticked> <unticked> <flags>`, where `ticked` and `unticked` come from `grep -c` on `tasks.md` (`^[[:space:]]*- \[[xX]\]` and `^[[:space:]]*- \[ \]`; the hub adds them up for the total) and `flags` say whether `tasks.md` and `proposal.md` exist. A change folder whose name holds a tab or a line break is skipped before anything is printed: such a name would break the tagged lines (a line break would start a forged `H` or `G` line). When `review.json` exists and is at most 64 KB, it prints `R <top> <name> <json>` with the file on one line (line breaks and tabs, only whitespace in valid JSON, become spaces, as `contextScript` does). The hub parses that JSON with a pure function.

**Alternatives.** Sending `tasks.md` whole and counting in Node: more bytes every 15 s for no gain. Parsing `review.json` in shell: no JSON tool can be assumed on a machine (no `jq` on a stock Mac).

**Consequences.** Each scan carries the active changes' `review.json` (real ones weigh 4 to 8 KB). A registry over 64 KB shows no review state. At most 20 changes per top folder are read, in name order. The cap keeps a top folder's worst case (20 × 64 KB) well under the 4 MB `maxBuffer` of `exec.shell`, which the whole scan shares with the worktree and branch lines.

### D3. The review summary follows ka's budget count, version 1 only

**Decision.** A pure `reviewState(json)` in `server/src/change-progress.ts` returns `{ pr?, round?, blockers }` or nothing. It returns nothing unless the value is an object with `version === 1`; every field it reads is narrowed (`typeof`, `Array.isArray`), and a malformed field is dropped. The round follows `budgetOf`: `since` is the last `budget.resets[].afterRound` (0 without one); `n` is the count of `rounds` with `counted` true and `n > since`; `of` is `budget.maxRounds` plus the `budget.extensions` with `afterRound >= since`. `round` is set only when `n > 0`. `blockers` counts the findings with severity `CRITICAL` or `REQUIRED` and state `open`.

**Alternatives.** Running `ka review-rounds status --json` on the machine: needs the plugin installed there and git, and the prompt rules it out.

**Consequences.** A new `review.json` version hides the review state (the task progress still shows) until this function learns it. The count is a copy of ka's rule; a change to `budgetOf` in ka without a version bump would drift silently. That risk is accepted: the prompt names `version` as the guard.

### D4. `ChangeProgress` is the contract, `changeLine` the shared text

**Decision.** `shared/types.ts` gains:

```ts
/** An active OpenSpec change of a pane's repository (read by the hub with the worktree and branch). */
export interface ChangeProgress {
  name: string;
  /** Its folder on the machine, absolute. */
  path: string;
  /** Ticked checkboxes over all of them in its tasks.md; missing without tasks.md or without checkboxes. */
  tasks?: { done: number; total: number };
  /** Whether it has a proposal.md. */
  proposal: boolean;
  /** From its review.json, version 1 only. */
  review?: { pr?: number; round?: { n: number; of: number }; blockers: number };
}
```

and `PaneInfo.changes?: ChangeProgress[]` (missing when there is none). Two pure functions in `shared/change-progress.ts`: `changeFacts(change)` returns the parts known of a change («7/23», «PR #74», «ronda 2/3», «1 bloqueante»), and `changeLine(change)` joins them into the row's text («☑ 7/23 · PR #74 · ronda 2/3 · 1 bloqueante», or «☑ <name>» when there is no progress and no review state). The row and the card use `changeLine`; `windowDetails()` adds each pane's changes to `PaneDetails` as `{ name, facts }`, which the tooltip lays out.

**Consequences.** The text rules are tested once, from `server/src/change-progress.test.ts`; the components only lay them out.

### D5. The scanner reads again when it sees a pane change state

**Decision.** `GitScanner.apply()` already receives every pane on each poll; it remembers each pane's state, and when a pane it saw before comes with another state, it marks a reading as due. The next `apply()` scans even before the 15 s, and a due reading noticed during a scan runs once that scan ends. The poll runs every second, so the reading starts at most a second after the ✅ shows. `HostMonitor` needs no call of its own.

**Alternatives.** A public `rescan()` called from `HostMonitor.detectTransitions`: the call itself had no test, because `HostMonitor` builds its own `TmuxExec` and no test creates one, so deleting it would leave every test green (adversarial review, M2). Scanning only the folder of the pane that changed: a second script and its parser for a gain of a few milliseconds. Both rejected.

**Consequences.** The whole behaviour, from the state change to the new reading, is tested through `GitScanner` with a fake `shell`. A machine where many panes change state often scans more often, never two scans at once.

### D6. Where each place reads the changes

**Decision.** The row uses the window's active pane (as its worktree line does), the card the pane it is about, the header and the ··· menu the pane the window works on (`paneOf` in the header; the menu's `target` pane), and the tooltip each pane. The row's lines go in a small `ChangeLines` component in `Tree.tsx`, under `WhereLine`, and follow its rule for the compact list; the card shows them always. The header's buttons sit before `ChangesButton` in `WindowView.tsx`; each calls `openFile({ host, window, pane }, `${change.path}/tasks.md`)`. The menu's entries call `openFile` with `${change.path}/proposal.md`.

### D7. The tooltip waits 0.2 s

**Decision.** `TIP_DELAY` in `HoverTip.tsx` goes from 1000 to 200 ms.

**Consequences.** Moving the mouse down the list shows a tooltip on any row it rests on for 0.2 s; the tooltip still closes when the mouse leaves.

## Data flow

1. `HostMonitor.poll()` (every second) reads tmux and calls `GitScanner.apply(sessions)`.
2. When the reading is due (a new folder, 15 s, or a pane's state changed), `GitScanner` runs `gitScript(paths)` on the machine (`host.exec.shell`): `G` lines per folder, then, per top folder with a harness configuration, `S` and `R` lines per change.
3. `parseGit` returns the `PaneGit` per folder, the top folder per folder and the `ChangeProgress[]` per top folder (with `reviewState` applied to each `R` line).
4. On the next `apply()`, each pane gets `git` and `changes`; `HostMonitor.update()` emits `change`, and `index.ts` broadcasts `{ t: 'host', host }`.
5. `web/src/ws.ts` stores it in `hosts`; `Tree.tsx`, `HoverTip.tsx`, `WindowView.tsx` and `menus.ts` read `pane.changes`.

## Risks / Trade-offs

- [The task count lags a file edit by up to 15 s when no state changes] → D5 covers the moment that matters, the end of a turn.
- [`review.json` grows with findings and travels every scan] → 64 KB cap per file and 20 changes per top folder (D2).
- [ka changes its budget rule without a version bump] → accepted (D3); the version check catches format changes.
- [A folder name with a tab or a line break breaks the tagged lines, and a line break can forge the machine's home line] → the script skips such names (D2); such a change does not show.
- [Several changes with tasks put several buttons in the header, which do not shrink, and on a phone the title gets narrower] → accepted: two buttons fit at 390 px next to «+43 −0»; more active changes in one worktree are rare. The tooltip and the row still list them all.
- [The harness may keep its changes elsewhere (`features.specsDir`)] → out of scope (proposal, Non-goals): only `openspec/changes/` is read.
- [Folder names are machine data rendered in the panel] → Preact escapes text; the path goes to the file viewer, which already validates paths (`resolvePath`).

## Migration Plan

No data to migrate. The new field is optional: an older panel ignores it. Rollback is reverting the commit.
