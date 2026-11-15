# Design

## Context

See `proposal.md` for the motivation and `specs/worktree-base/spec.md` for the required behaviour.

What exists today:

- `launchTask` (`server/src/tasks.ts`) opens or reuses a window in the target (an open space, an added folder or both) and types `claude … --worktree <name> [prompt]` into its shell. It is called by the `launchTask` action (the panel's «Nuevo worktree» in `web/src/components/Dialogs.tsx`), `launchFromRequest` (`POST /api/ext/launch` from the extension and `POST /api/trello/launch` from the panel's Trello drawer) and the automations' `launch` dependency in `server/src/index.ts`.
- Claude Code's own `--worktree` creates `.claude/worktrees/<name>` on a new branch `worktree-<name>` from `origin/<default branch>`. It has no flag, setting or variable for another base: `worktree.baseRef` only takes `fresh` or `head`. A `WorktreeCreate` hook replaces that logic and receives only the worktree's `name`.
- The koalarnes plugin's hook names the branch exactly like the worktree, reuses an existing local or `origin` branch with that name, and otherwise starts from `origin/<git.baseBranch>`; then it copies ignored files and runs the project's setup.
- The extension remembers per board `{ host, destination, space }` in `Memory.boards` (`trello-extension/src/types.ts`, saved by the service worker on launch); the panel's Trello drawer keeps the same per board in `prefs.trelloLaunch` (`web/src/prefs.ts`).
- Shell scripts the hub runs on a machine quote values with `shQuote`/`shPath` (`server/src/exec.ts`) and print tagged lines that a pure function parses, as `listWorktrees` (`server/src/actions.ts`) and `project-refs.ts` do; their tests run the script for real with `/bin/sh` in temporary git repositories.

## Goals / Non-Goals

**Goals:**

- One hub function decides how a base is applied, used by every launch path.
- A launch without `base` behaves exactly as today, so an extension that has not been updated keeps working.
- The scripts that touch git run for real in tests against temporary repositories with a bare `origin`.

**Non-Goals:** see `proposal.md`.

## Flow

```text
Dialog opens / destination changes (panel: «Nuevo worktree», Trello drawer, automation form; extension)
  panel     ── action listBranches { target } ──────────────▶ hub
  extension ── message 'branches' ─▶ service worker ── GET /api/ext/branches?host&… ──▶ hub
  hub  ── branchesScript(folder) ──▶ machine: git fetch --prune origin (timeout); git for-each-ref refs/remotes/origin; base
  hub  ◀── R\t1 / F\t<fetch error> / B\t<branch>… / D\t<project base> ── machine
  web  ◀── BranchList { repo, branches, base?, fetchError? } ── hub
  (dialog preselects: remembered branch if listed, else base)

Launch with a worktree and a base
  web/extension ── launchTask / POST …/launch { …, worktree, base } ──▶ hub
  hub: targetFolder(target), then prepareScript(folder, worktree, base) on the machine, before any window:
       base missing on origin, git fails     → E\t<why>    → error «No existe la rama base …», nothing opened
       branch <worktree> exists, hook        → X           → claude --worktree <name>, notice  (hook reuses it)
       branch <worktree> exists, no hook     → X\t<path>   → cd <path> && claude [prompt], notice
       hook, base == project base            → N           → claude --worktree <name>          (as today)
       hook, other base                      → H           → claude --worktree <name>          (hook reuses the branch made)
       no hook, base == origin's default     → N           → claude --worktree <name>          (as today)
       no hook, other base                   → W\t<path>   → cd <path> && claude [prompt]      (no --worktree)
  then the window is opened as today and the command typed
  web/extension ◀── ExtLaunchResult { …, notice? } ── hub   (notice shown as a toast / in the dialog)
```

## Decisions

### D1. Apply the base on the machine before typing the command

**Context.** Claude Code cannot be told a base. Two paths reach the right branch: a local branch named like the worktree that a hook reuses, or a worktree the hub creates itself.

**Decision.** Before `launchTask` opens anything, it resolves the target's folder (`targetFolder`, D3) and runs one script there, `prepareScript(path, worktree, base)` of a new `server/src/worktree-base.ts`. The script, in order:

1. checks the repository and fetches `origin <base>` (`GIT_TERMINAL_PROMPT=0`, a 20 s `timeout` when the machine has it); answers `E` when `origin/<base>` does not exist;
2. detects a hook (D2) and works out the project's base and `origin`'s default branch (D3);
3. when a local or `origin` branch named like the worktree exists, answers `X`: with a hook, nothing more (the hook reuses it); without one, the worktree already checked out on that branch, else a new one added on it at `.claude/worktrees/<dir>` (`X\t<path>`);
4. with a hook, answers `N` when the base is the project's base, else creates the branch with `git branch --no-track <worktree> origin/<base>` and answers `H`;
5. without a hook, answers `N` when the base is `origin`'s default branch (where Claude Code's own `--worktree` starts), else adds the worktree with `git worktree add --no-track -b <worktree> <top>/.claude/worktrees/<dir> origin/<base>` and answers `W\t<path>`.

`<dir>` is the name with `/` turned into `-`, and `.claude/worktrees/` is added to the repository's `info/exclude` when missing, as Claude Code and the koalarnes hook do. A git failure answers `E` with git's message. A pure `parsePrepare(out)` turns the answer into what `taskCommand` types: `--worktree <name>` for `N`, `H` and a bare `X`; `cd <path> &&` and no `--worktree` for `W` and `X\t<path>`. On `E` nothing is opened and the launch fails with a Spanish message.

**Alternatives.** Typing the git commands into the pane: visible noise, and an error would leave a half-typed shell. Always creating the worktree in the hub: skips a hook's setup (copied `.env` files, installed dependencies), which the owner ruled out.

**Consequences.** One more SSH round trip per launch with a base, and no window to clean up when it fails. The `W` path leaves a worktree Claude Code did not create: it opens it like any folder, and `--resume` lists the session under that folder.

### D2. Detecting a `WorktreeCreate` hook

**Decision.** The script looks for the text `WorktreeCreate` in `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json`, in the repository's `.claude/settings.json` and `.claude/settings.local.json`, and in the `hooks/hooks.json` of every plugin under `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/cache/<marketplace>/<plugin>/<version>/` whose `"<plugin>@<marketplace>": true` appears in one of those settings files. It is a text match, not a JSON parse: the hub runs `/bin/sh` without `jq` guaranteed.

**Consequences.** A hook declared somewhere else (a managed policy file, a config directory the machine's command sets but the SSH shell does not see) is missed: the hub then takes the `W` path, the worktree still starts from the base, and only the hook's setup is skipped. A false positive (the text in a disabled hook) takes the `H` path: Claude Code's native logic then creates `worktree-<name>` from the default branch and leaves the prepared branch unused. Both are recorded as risks.

### D3. The project's base and the branch list

**Decision.** The project's base is worked out on the machine by one shell fragment both scripts share: `git.baseBranch` of the top level's `.claude/koalarnes.json` (a text match on the file joined into one line, used only when `origin` has that branch), else the target of `refs/remotes/origin/HEAD`, else `master` or `main` when `origin` has it. A text match keeps `prepareScript` able to compare without a JSON parser on the machine; both scripts use the same fragment, so the list's base and the launch's never disagree.

`branchesScript(path)` runs `git fetch --prune origin` with the same timeout, lists `refs/remotes/origin/*` without `origin/HEAD` (`B` lines) and prints the project's base (`D`). A failed fetch prints `F` with git's message and still lists what the machine knows; a repository without `origin` says so in `F`. `parseBranches(out): BranchList`. The panel reaches it through a new read-only action `listBranches { target }`; the extension through `GET /api/ext/branches?host=&session=&folder=&sub=` (covered by the extension token like every `/api/ext/*`). Both resolve the target's folder with `targetFolder(host, machine, target)`, which `launchTask` uses too: the added folder (and `sub`) when given, else the folder of the open space's current pane, where a new window of that space starts.

**Consequences.** Opening a dialog costs one fetch per destination; the dialog shows «Cargando ramas…» and keeps the launch button disabled until the list arrives when a worktree is checked.

### D4. What is remembered, and where

- Extension: `Memory.boards[board]` gains `base?: string`, saved by the service worker on launch like the rest.
- Panel's Trello drawer: `prefs.trelloLaunch[board]` gains `base?: string`.
- «Nuevo worktree»: a new per-device pref `worktreeBases: Record<string, string>` keyed by `<host>\t<folder>\t<sub>`.
- Automation: `base?: string` in `Automation`, sanitised in `server/src/automations.ts` (a branch name check), shown as a select in the automation form; empty means the project's base at each run (the hub passes no `base`, and D1's `N` path applies).

The dialogs preselect the remembered branch when it is in the list, else `BranchList.base`. A shared pure `pickBase(remembered, list)` in `shared/worktree.ts` decides it for the panel and the extension.

### D5. Contracts

- `ExtLaunchRequest.base?: string`; the `launchTask` action takes the same field. Checked on the hub with `git check-ref-format`-like rules (`branchNameProblem` in `shared/worktree.ts`) before any script.
- `ExtLaunchResult.notice?: string`: «La rama <name> ya existía: se usa tal cual, sin partir de <base>».
- `BranchList = { repo: false } | { repo: true; branches: string[]; base?: string; fetchError?: string }` in `shared/types.ts`.
- `ActionOp` gains `{ op: 'listBranches'; target: ExtLaunchTarget }`, added to `READ_ONLY_OPS`.
- The extension's `Request` gains `{ type: 'branches'; host: string; target: ExtLaunchTarget }`; `/api/ext/*` changes go with the extension in the same commit (server standards).

No dependency-injection or bootstrap wiring changes: the new route and action sit next to the existing ones in `server/src/index.ts` and `server/src/actions.ts`. A boot smoke test is not required beyond the dev hub used for the manual check.

## Risks / Trade-offs

- [Hook detection misses a hook or sees a disabled one] → D2: the worktree still starts from the base on a miss; a false positive falls back to Claude Code's default base. The manual check covers a machine with the koalarnes hook and one without.
- [`git fetch` is slow or asks for credentials] → `GIT_TERMINAL_PROMPT=0`, a timeout, and the list of known branches with a warning.
- [A launch with a base takes longer] → one script per launch; the dialog already shows «Lanzando…».
- [An automation without a base on a machine without a hook, in a project whose `git.baseBranch` is not `origin`'s default branch, starts from the default branch, as it does today] → Rare (the koalarnes plugin is enabled where koalarnes.json exists); saving the base in the automation avoids it.
- [A machine with `worktree.baseRef: "head"` makes Claude Code's own `--worktree` start from the local HEAD, so the `N` path without a hook may not start at `origin`'s default branch] → The hub does not read that setting; the owner's machines keep the default.
- [The `W` path differs from Claude Code's own layout (branch named like the worktree, not `worktree-<name>`)] → Matches the koalarnes convention the owner uses; documented in the catalogue.

## Migration Plan

None. New optional fields; old automations, old extension versions and old requests keep working. Rolling back is reverting the change; automations saved with a `base` then ignore it.
