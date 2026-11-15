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
- A launch without `base` keeps working, so an extension that has not been updated still launches: with a hook exactly as today, without one from the project's base.
- The scripts that touch git run for real in tests against temporary repositories with a bare `origin`.

**Non-Goals:** see `proposal.md`.

## Flow

```text
Dialog opens / destination changes (panel: «Nuevo worktree», Trello drawer, automation form; extension)
  panel     ── action listBranches { target } ──────────────▶ hub
  extension ── message 'branches' ─▶ service worker ── GET /api/ext/branches?host&… ──▶ hub
  hub  ── branchesScript(folder) ──▶ machine: git fetch --prune origin (bounded); git for-each-ref refs/remotes/origin; base
  hub  ◀── R\t1 / F\t<fetch error> / B\t<branch>… / D\t<project base> ── machine
  web  ◀── BranchList { repo, branches, base?, fetchError? } ── hub
  (dialog preselects: remembered branch if listed, else base; with no branches, or when the list
   cannot be read, the task can still be launched without a base, and the list can be read again)

Launch with a worktree (with or without a base)
  web/extension ── launchTask / POST …/launch { …, worktree, base? } ──▶ hub
  hub: targetFolder(target), then prepareScript(folder, worktree, base) on the machine, before any window:
       folder outside git, base missing on origin, branch checked out elsewhere, git fails
                                             → E\t<why>          → error, nothing opened
       branch <worktree> exists, hook        → X                 → claude --worktree <name>      (hook reuses it; notice with a base)
       branch <worktree> exists, no hook     → X\t<path>         → cd <path> && claude [prompt]  (its worktree, or one added on it; notice with a base)
       hook, no base                         → N                 → claude --worktree <name>      (the hook decides, as before)
       hook, a base                          → H                 → claude --worktree <name>      (hook reuses the branch made from origin/<base>)
       no hook                               → W\t<path>         → cd <path> && claude [prompt]  (worktree made from origin/<base or project base>, else HEAD)
       origin could not be reached           → S\t<why> first    → goes on from the known origin/<base>, notice
  then the window is opened as today and the command typed
  web/extension ◀── ExtLaunchResult { …, notice? } ── hub   (notice shown as a toast / in the dialog)
```

## Decisions

### D1. Apply the base on the machine before typing the command

**Context.** Claude Code cannot be told a base. Two paths reach the right branch: a local branch named like the worktree that a hook reuses, or a worktree the hub creates itself.

**Decision.** Before `launchTask` opens anything, every launch with a worktree resolves the target's folder (`targetFolder`, D3) and runs one script there, `prepareScript(path, worktree, base)` of a new `server/src/worktree-base.ts`; `base` may be empty (an automation saved with the project's base, an extension not yet updated, a repository with no remote branches). The script, in order:

1. checks the repository (`E repo` outside git) and finds its main checkout, the first entry of `git worktree list --porcelain`: new worktrees always go in `<main>/.claude/worktrees/<dir>`, never inside a linked worktree the target may be in;
2. detects a hook (D2) and works out the project's base and `origin`'s default branch (D3); without a hook and without a base, the base is the project's base;
3. with a base, fetches `origin <base>` (`GIT_TERMINAL_PROMPT=0`, bounded by a portable watchdog, D3). When the fetch fails, `git ls-remote --exit-code` tells a branch the remote does not have (`E base`) from a remote that cannot be reached: then the known `origin/<base>` is used, if there is one, and `S\t<why>` is printed first so the launch says so;
4. looks for a branch named like the worktree: local, in `origin` as the clone knows it, or, when neither has it and `origin` answered in step 3 (or there was no fetch), on the remote itself (`git ls-remote`, 4 s), fetching it then (6 s) so a branch pushed from another machine is reused, not shadowed by a new one from the base; when the remote has it and the fetch fails, the launch fails (`E git`) rather than shadow it. When one exists, answers `X`: with a hook, nothing more (the hook reuses it); without one (and once a registration of `<main>/.claude/worktrees/<dir>` whose folder was deleted by hand is dropped with `git worktree remove --force --force`, also when it is locked, leaving every other worktree alone), the worktree at `<main>/.claude/worktrees/<dir>` when it is already checked out there, `E inuse\t<path>` when it is checked out anywhere else (the project's folder, another session's worktree), else a new worktree added on it (`X\t<path>`). `X` carries a third field, `1`, when the existing branch is exactly at `origin/<base>`, so a retry after a failed launch does not warn;
5. with a hook, answers `N` when there is no base (the hook decides, as before), else creates the branch with `git branch --no-track -- <worktree> origin/<base>` and answers `H`. It does not try to predict which base the hook would pick: the hook's own default (`main` in koalarnes, `hotfixBaseBranch` for hotfixes) may differ from the project's base the hub sees;
6. without a hook, always adds the worktree itself: `git worktree add --no-track -b <worktree> <main>/.claude/worktrees/<dir> origin/<base>`, or from `HEAD` when there is no base at all (no remote branches); copies into it the ignored files that the main checkout's `.worktreeinclude` selects, as Claude Code's own worktrees do; answers `W\t<path>`.

Worktree names never start with `-` (`worktreeNameProblem` refuses them, and `--` keeps git from reading one as an option). `<dir>` is the name with `/` turned into `-`, and `.claude/worktrees/` is added to the repository's `info/exclude` when missing, as Claude Code and the koalarnes hook do. A git failure answers `E` with git's message. A pure `parsePrepare(out, base)` turns the answer into what `taskCommand` types: `--worktree <name>` for `N`, `H` and a bare `X`; `cd <path> &&` and no `--worktree` for `W` and `X\t<path>`. On `E` nothing is opened and the launch fails with a Spanish message.

**Alternatives.** Typing the git commands into the pane: visible noise, and an error would leave a half-typed shell. Always creating the worktree in the hub, also with a hook: skips a hook's setup (copied `.env` files, installed dependencies), which the owner ruled out. Keeping Claude Code's own `--worktree` without a hook when the base is `origin`'s default: its branch is `worktree-<name>`, not the worktree's name, and it ignores `git.baseBranch`; the owner chose the hub's worktree for every launch without a hook.

**Consequences.** One more SSH round trip per launch with a worktree, and no window to clean up when it fails. Without a hook, Claude Code never creates the worktree: it opens it like any folder, `--resume` lists the session under that folder, and Claude Code does not offer to remove it on exit.

### D2. Detecting a `WorktreeCreate` hook

**Decision.** The script looks for the text `WorktreeCreate` in `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json`, in the repository's `.claude/settings.json` and `.claude/settings.local.json`, and in the `hooks/hooks.json` or `.claude-plugin/plugin.json` of every plugin under `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/cache/<marketplace>/<plugin>/<version>/` whose `"<plugin>@<marketplace>": true` appears in one of those settings files. It is a text match, not a JSON parse: the hub runs `/bin/sh` without `jq` guaranteed.

**Consequences.** A hook declared somewhere else (a managed policy file, a config directory the machine's command sets but the SSH shell does not see) is missed: the hub then takes the `W` path, the worktree still starts from the base, and only the hook's setup is skipped. A false positive (the text in a disabled hook) takes the `H` path: Claude Code's native logic then creates `worktree-<name>` from the default branch and leaves the prepared branch unused. Both are recorded as risks. The `H` and `X` paths also assume the hook reuses an existing local branch named like the worktree, as the koalarnes hook does; the README states that contract.

### D3. The project's base and the branch list

**Decision.** The project's base is worked out on the machine by one shell fragment both scripts share: `git.baseBranch` of the top level's `.claude/koalarnes.json` (a text match on the file joined into one line, used only when `origin` has that branch), else the target of `refs/remotes/origin/HEAD`, else `master` or `main` when `origin` has it. A text match keeps `prepareScript` able to compare without a JSON parser on the machine; both scripts use the same fragment, so the list's base and the launch's never disagree.

Both scripts bound `git fetch` (12 s) and `git ls-remote` (6 s) with a portable watchdog (a background `sleep` that kills the command and its direct children, the `ssh` or `git-remote-https` that hangs on the network; `timeout` is not on a stock macOS), writing git's errors to a temporary file so a process left behind cannot hold the script open. The hub's own limits (25 s for each script) stay under the 30 s Chrome gives an extension's request.

`branchesScript(path)` runs `git fetch --prune origin` (which drops the clone's references to branches deleted on `origin`, as any `git fetch --prune` does), lists `refs/remotes/origin/*` without `origin/HEAD` (`B` lines) and prints the project's base (`D`). A failed fetch prints `F` with git's message and still lists what the machine knows; a repository without `origin` says so in `F`. `parseBranches(out): BranchList`. The panel reaches it through a new read-only action `listBranches { target }`; the extension through `GET /api/ext/branches?host=&session=&folder=&sub=` (covered by the extension token like every `/api/ext/*`). Both resolve the target's folder with `targetFolder(host, machine, target)`, which `launchTask` uses too: the added folder (and `sub`) when given, else the folder of the open space's current pane, where a new window of that space starts.

**Consequences.** Opening a dialog costs one fetch per destination; the dialog shows «Cargando ramas…» and keeps the launch button disabled until the list arrives when a worktree is checked. A repository with no remote branches, or a list that could not be read, does not block the launch: the dialog says the worktree will start without a chosen base and offers to read the list again; only a folder outside git blocks it.

### D4. What is remembered, and where

- Extension: `Memory.boards[board]` gains `base?: string`, saved by the service worker on launch like the rest.
- Panel's Trello drawer: `prefs.trelloLaunch[board]` gains `base?: string`.
- «Nuevo worktree»: a new per-device pref `worktreeBases: Record<string, string>` keyed by `<host>\t<folder>\t<sub>`.
- Automation: `base?: string` in `Automation`, sanitised in `server/src/automations.ts` (a branch name check), shown as a select in the automation form; empty means the project's base at each run (the hub passes no `base`: with a hook, the hook decides; without one, D1 resolves the project's base on the machine). The `Automations` class builds each run's launch request, base included, so its tests see what is launched.

The dialogs preselect the remembered branch when it is in the list, else `BranchList.base`. A shared pure `pickBase(remembered, list)` in `shared/worktree.ts` decides it for the panel and the extension.

### D5. Contracts

- `ExtLaunchRequest.base?: string`; the `launchTask` action takes the same field. Checked on the hub with `git check-ref-format`-like rules (`branchNameProblem` in `shared/worktree.ts`) before any script.
- `ExtLaunchResult.notice?: string`: «La rama <name> ya existía: se usa tal cual, sin partir de <base>» (only with a base, and not when the branch is already at `origin/<base>`), and «No se ha podido actualizar origin: el worktree parte de la copia local de origin/<base>» (`S`).
- `branchNameProblem` also refuses `HEAD`, which `origin/HEAD` would otherwise accept as a base.
- `BranchList = { repo: false } | { repo: true; branches: string[]; base?: string; fetchError?: string }` in `shared/types.ts`.
- `ActionOp` gains `{ op: 'listBranches'; target: ExtLaunchTarget }`, added to `READ_ONLY_OPS`.
- The extension's `Request` gains `{ type: 'branches'; host: string; target: ExtLaunchTarget }`; `/api/ext/*` changes go with the extension in the same commit (server standards).

No dependency-injection or bootstrap wiring changes: the new route and action sit next to the existing ones in `server/src/index.ts` and `server/src/actions.ts`. A boot smoke test is not required beyond the dev hub used for the manual check.

## Risks / Trade-offs

- [Hook detection misses a hook or sees a disabled one] → D2: the worktree still starts from the base on a miss; a false positive falls back to Claude Code's default base. The manual check covers a machine with the koalarnes hook and one without.
- [`git fetch` is slow, hangs or asks for credentials] → `GIT_TERMINAL_PROMPT=0`, a portable watchdog, and the list of known branches with a warning; a launch goes on from the known `origin/<base>` and says so.
- [A launch with a worktree takes longer] → one script per launch, bounded under 25 s (worst case 22 s: fetch 12 s, then the worktree branch's `ls-remote` 4 s and fetch 6 s); the dialog already shows «Lanzando…».
- [A bare repository with linked worktrees and no main checkout] → without a hook the new worktree goes under the bare directory (`<repo>.git/.claude/worktrees/<dir>`), the first entry of `git worktree list`. It works; the owner chose to keep this uncommon layout as it is.
- [A launch fails after the script made the branch or the worktree (the window cannot be opened)] → The branch stays at `origin/<base>`; a retry reuses it without a warning, since it is at that base. With another base chosen on the retry, the old branch is reused and the warning says so.
- [A hook that does not reuse an existing branch named like the worktree, local or in `origin`] → `H` and `X` would make it fail inside the window after the hub answered; the README states the contract (the koalarnes hook honours it).
- [Without a hook, Claude Code does not manage the worktree: no offer to remove it on exit, and `worktree.baseRef` is not read] → The owner chose a branch named like the worktree and the project's base over Claude Code's own layout; removing it is `git worktree remove`, as for the koalarnes hook's worktrees.

## Migration Plan

None. New optional fields; old automations, old extension versions and old requests keep working (on a machine without a hook, their worktrees now come from the hub, named like the worktree). Rolling back is reverting the change; automations saved with a `base` then ignore it.
