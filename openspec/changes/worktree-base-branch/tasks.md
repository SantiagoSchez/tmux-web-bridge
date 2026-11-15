# Tasks

## 1. Branch

- [x] 1.1 Create `feature/14-elegir-la-rama-base-al-crear-un-worktree` from `origin/master` in its own worktree with `/koalarnes:git-worktree create`; verify `git branch --show-current` prints it.

## 2. Review the existing tests

- [x] 2.1 Read `server/src/ext.test.ts` (launch requests, `taskCommand`, `launchTask`), `server/src/automations.test.ts` (automation validation and runs), `server/src/actions.test.ts` (`READ_ONLY_OPS`, `listWorktrees`) and `trello-extension/src/logic.test.ts` (the extension's memory and dialog logic) and confirm they still describe the intended behaviour; record one line per module: "tests up to date" or "tests updated/added in this change".
  - `server/src/tasks.ts` (`server/src/ext.test.ts`): tests up to date; tests added in this change (4.3, 5.3).
  - `server/src/automations.ts`: tests up to date; tests added in this change (6.1).
  - `server/src/actions.ts`: tests up to date; `listBranches` delegates to `worktree-base.ts`, tested in its own file (4.1).
  - `trello-extension/src/logic.ts`: tests up to date; it only re-exports `pickBase`, tested in `server/src/` (3.2).
- [x] 2.2 Confirm the web modules the change touches (`web/src/components/Dialogs.tsx`, `Trello.tsx`, `Automations.tsx`, `web/src/prefs.ts`) have no tests by the web standards and are checked by hand in 8.3; record one line per module.
  - `web/src/components/Dialogs.tsx`, `Trello.tsx`, `Automations.tsx` and `web/src/prefs.ts`: no tests by the web standards; their shared logic (`pickBase`, `branchNameProblem`) is tested in `server/src/` and the screens are checked by hand in 8.3.

## 3. Shared types and pure logic

- [x] 3.1 Add `BranchList` to `shared/types.ts`, `base?: string` to `ExtLaunchRequest` and `Automation`, `notice?: string` to `ExtLaunchResult`, and `{ op: 'listBranches'; target: ExtLaunchTarget }` to the action union, with JSDoc (design D5); verify `pnpm --filter server typecheck` passes.
- [x] 3.2 Write failing tests for `branchNameProblem(name)` of `shared/worktree.ts` (valid: `master`, `release/2.0`, `feature/14-login`; rejected: empty, a leading `-`, `..`, a space, a control character, `@{`, a trailing `/` or `.lock`, more than 200 characters) and for `pickBase(remembered, list)` (remembered and listed wins; remembered but gone, nothing remembered or `undefined` gives `list.base`; no `base` gives the first branch); see them fail, implement, and verify they pass (design D4, D5).
  - Two tests in `server/src/worktree-base.test.ts`; seen failing without the functions and with `pickBase` returning the remembered branch unchecked.

## 4. Branch list on the hub

- [x] 4.1 Write a failing test in `server/src/worktree-base.test.ts` that runs `branchesScript` for real with `/bin/sh` in temporary git repositories with a bare `origin` (explicit `{ PATH, HOME }` env, git local variables stripped) through a fake host, covering: the remote's branches after a fetch (including one pushed to the bare `origin` after the clone), `origin/HEAD` left out, the base from `.claude/koalarnes.json`'s `git.baseBranch`, the base from `origin/HEAD` without koalarnes.json, a koalarnes.json without `git.baseBranch`, or with one `origin` does not have, falling back to `origin/HEAD`, a repository without `origin`, an unreachable `origin` (fetch error reported, known branches still listed), and a folder outside git; see it fail.
  - Four tests, written together with 4.2; each rule was then broken on purpose (no fetch, the koalarnes base unchecked on `origin`, no koalarnes base) and a test failed every time.
- [x] 4.2 Implement `branchesScript(path)` and `parseBranches(out): BranchList` in `server/src/worktree-base.ts` with the project-base fragment shared with `prepareScript` (design D3: `GIT_TERMINAL_PROMPT=0`, a 20 s `timeout` when available, tagged `R`/`F`/`B`/`D` lines, values quoted with `shQuote`/`shPath`) until 4.1 passes.
  - The adversarial review replaced the `timeout` with the portable 12 s watchdog of 5.7.
- [x] 4.3 Add a `targetFolder(host, machine, target)` that resolves a launch target to its folder as `launchTask` does (the folder and `sub` when given, else the folder of the open space's current pane) with a failing test in `server/src/ext.test.ts` first, and use it from `listBranches`.
  - `targetFolder` in `server/src/tasks.ts` (with `folderPath` exported from `actions.ts`); one test, seen failing without the function and with the space's folder read from the wrong target.
- [x] 4.4 Add the read-only `listBranches` action to `server/src/actions.ts` (in `READ_ONLY_OPS`) and `GET /api/ext/branches?host&session&folder&sub` to `server/src/index.ts` next to `GET /api/ext/targets` (400 on bad input or unknown machine, 502 when the machine fails); verify with `curl` against a dev hub (isolated `TMUX_TMPDIR`, no `TMUX`/`TMUX_PANE`) on a folder of this repository, a folder outside git and an open space.
  - Checked with `curl` against an isolated hub (scratch `HOME`, `TMUX_TMPDIR`, fake `claude`): a repository with a hook gives its branches and base `develop` (koalarnes `git.baseBranch`), one without gives base `master` (origin's default), a folder outside git and an open space outside git give `repo: false`; no target or an unknown machine give 400. A folder that is not an added one (`/etc`), a missing subfolder and a closed or invalid space give 400; only a command that fails on the machine (`TmuxError`) gives 502.

## 5. Applying the base at launch

- [x] 5.1 Write a failing test in `server/src/worktree-base.test.ts` that runs `prepareScript` for real with `/bin/sh` against temporary repositories with a bare `origin` and a fake `HOME`/`CLAUDE_CONFIG_DIR`, covering each answer of design D1: `E` for a base missing on `origin` and outside a repository; with a hook, a bare `X` for an existing local branch and for an existing `origin` branch named like the worktree, with nothing created; without a hook, `X` with the path of the worktree already on that branch, or of a new one added on it; with a hook, `N` when the base is the project's base (koalarnes.json's `git.baseBranch`); without a hook, `N` when the base is `origin`'s default branch, and `W` when it is koalarnes.json's base but not the default; `H` with a `WorktreeCreate` hook in the user's `settings.json`, in the project's `.claude/settings.json`, in `settings.local.json` and in an enabled plugin's `hooks/hooks.json` (the local branch exists, starts at `origin/<base>` and has no upstream); no `H` for a plugin with the hook that is not enabled; `W` without a hook (the worktree exists under `.claude/worktrees/<name with / as ->` on branch `<name>` at `origin/<base>`, and `.git/info/exclude` lists `.claude/worktrees/` once after two launches); see it fail.
  - Nine tests (five places for the hook), written together with 5.2; twelve mutations of the script (no hook in settings or plugins, a disabled plugin taken as enabled, the project base used without a hook, a tracking branch, no lookup of the existing worktree, the exclude line repeated, the remote branch ignored, the base unchecked) each make a test fail.
- [x] 5.2 Implement `prepareScript(path, worktree, base)` and `parsePrepare(out)` in `server/src/worktree-base.ts` (design D1, D2) until 5.1 passes.
- [x] 5.3 Write failing tests in `server/src/ext.test.ts` for `taskCommand` with a prepared `W` path (types `cd <path> && claude … [prompt]`, no `--worktree`, path quoted with `shellWord`) and for `launchTask` with a fake host: a `base` with an invalid name is rejected before any tmux command; with `base`, the prepare script runs in the target's folder before any window opens; `X` returns the `notice`; `E` opens nothing and fails with «No existe la rama base …»; without `base` the commands are the same as today; see them fail.
  - Four tests (the `cd` command, a prepared worktree, a reused branch with its notice, an invalid or unknown base and a base without a worktree); five mutations of `launchTask` (no preparation, no `cd`, no notice, the base name unchecked, the base kept without a worktree) each make one fail.
- [x] 5.4 Wire `prepareScript` into `launchTask` (`server/src/tasks.ts`) until 5.3 passes, and pass `base` through the `launchTask` action, `launchFromRequest` and the automations' `launch` in `server/src/index.ts`.
  - The panel's `launchTask` action and `launchFromRequest` pass the request as is, so `base` reaches `launchTask` without changes there; the automations' `launch` passes `a.base`.
- [x] 5.5 Payload audit for `ExtLaunchRequest.base` and `ExtLaunchResult.notice`: list every producer (`Dialogs.tsx`, `Trello.tsx`, the extension's service worker, the automations' runner) and consumer (`launchTask`, `launchFromRequest`, the `launchTask` action) and confirm each was updated; record the list here.
  - Producers of `base`: `WorktreeStep` (`Dialogs.tsx`, the `launchTask` action), `LaunchCard` (`Trello.tsx`, `POST /api/trello/launch`), the extension's dialog (`content.ts`, forwarded unchanged by `background.ts` to `POST /api/ext/launch`) and the automations' `launch` (`index.ts`, `a.base`). Consumers: `launchTask` (`tasks.ts`), reached through the action handler and `launchFromRequest` (`index.ts`), which pass the body as is. `notice` is read by the three dialogs (a toast each); an automation run does not show it (it records only the run). `trello.ts` and `shared/trello.ts` read other fields of `ExtLaunchResult` and need nothing.

Fixes from the adversarial review (design D1 as revised):

- [x] 5.6 Write failing tests in `server/src/worktree-base.test.ts` for the revised matrix and see them fail: with a hook and a base equal to the project's, `H` (the branch is made from `origin/<base>`), and `N` only without a base; without a hook, `W` for `origin`'s default branch too (branch named like the worktree), from the project's base without a base, from `HEAD` in a repository without remote branches, and with the ignored files `.worktreeinclude` selects copied (a tracked or not ignored match is not); from a linked worktree, the new one under the main checkout's `.claude/worktrees/`; without a hook, `E inuse` with the path when the branch is checked out in the main checkout or another folder, and `X` with the path when it is in `.claude/worktrees/<dir>`; `X` with `1` when the existing branch is at `origin/<base>`; `E base` for a base deleted on `origin` that the clone still knows; `S` and the known `origin/<base>` when `origin` cannot be reached; `E git` with git's message.
- [x] 5.7 Implement them in `prepareScript` and `parsePrepare` (the main checkout, the portable fetch watchdog, which kills the command and its direct children, with errors in a temporary file and a test of it, `ls-remote`, `.worktreeinclude`), run `prepareScript` for every launch with a worktree, add `HEAD` to `branchNameProblem` (with its case in the shared helpers' test), and set `BRANCHES_TIMEOUT`/`PREPARE_TIMEOUT` to 25 s; until 5.6 passes.
- [x] 5.8 Write failing tests in `server/src/ext.test.ts` and see them fail: a launch with a worktree and no base runs the prepare script too; `E inuse` fails with «La rama X está extraída en <ruta>: elige otro nombre para el worktree» and opens nothing; `S` returns the stale-origin `notice`; an `X` with `1` returns no `notice`, nor does an `X` without a base. Implement in `server/src/tasks.ts` until they pass.
  - 5 tests in `ext.test.ts` (the old worktree test now uses a clone with a hook); 4 mutations of the notices and of preparing every worktree caught.
- [x] 5.9 PR #15 review. Write failing tests and see them fail: `worktreeNameProblem` refuses a name that starts with `-`; with a hook and a base, `prepareScript` given `-m` does not rename the checked-out branch; without a hook, a worktree whose folder was deleted by hand is added again (`X` with its path); a branch named like the worktree that `origin` has and the clone has not fetched is reused (`X`, at the remote's commit), with and without a hook; the watchdog test asserts no wall-clock budget. Implement (`--` before the name in `git branch`, `git worktree prune`, a bounded `ls-remote` and fetch of the worktree's branch) until they pass.
  - 3 tests; 5 mutations caught (`--`, the prune, the remote lookup and its condition, the name check).
- [x] 5.10 PR #15 second review. Extend the deleted-folder test so another worktree whose folder is missing stays registered, and see it fail with `git worktree prune`; replace it with `git worktree remove --force` of the launched worktree's folder only. Bound the worktree branch's `ls-remote` at 4 s and fail the launch when the remote has the branch and its fetch fails. State in the README and the design that a hook must reuse the branch named like the worktree, local or in `origin`, and fix the row of `POST /api/ext/launch`, the proposal and the comment in `server/src/automations.ts` about a launch without a base.
  - The extended test failed with `git worktree prune` and passes with the targeted removal (2 mutations caught). The fetch failure after a positive `ls-remote` has no test (it needs a remote that lists a branch and then fails to send it); the generated script passes `sh -n` and `bash -n`.

## 6. Automations

- [x] 6.1 Write failing tests in `server/src/automations.test.ts`: an automation saved with a valid `base` keeps it, an invalid one is rejected with a Spanish message, an empty one is dropped, an automation without `base` loads as before, and a run passes `base` to `launch` only when the automation has one; see them fail, implement in `server/src/automations.ts`, and verify they pass (design D4).
  - One test; seen failing before the change and with four mutations (the base not kept, unchecked, kept without worktrees, a blank one kept).
- [x] 6.2 Add the base branch select to the automation form in `web/src/components/Automations.tsx` (shown when «En un worktree nuevo» is checked, filled with `listBranches` for the automation's target, first option «Base del proyecto (<base>)» saving no `base`); verify `pnpm --filter web typecheck` passes.
  - The select is `BaseBranchSelect` with `projectOption`; a saved base `origin` no longer has stays offered, marked «ya no está en origin», and an automation whose branches cannot be read keeps its saved base. The list of automations shows «worktree desde <base>».
- [x] 6.3 Move the building of a run's launch request (target, prompt, name, worktree, base, skipPermissions) into `Automations` (its `launch` dependency takes the request), with a failing test in `server/src/automations.test.ts` that a run with a base launches with it and one without launches without; then `server/src/index.ts` only adds the machine.

## 7. Base branch choice in the panel and the extension

- [x] 7.1 Add a shared `BaseBranchSelect` to the panel (`web/src/components/`) that asks `listBranches` for a target, shows «Cargando ramas…», the list with `pickBase` preselected, the fetch warning, and «No es un repositorio git» blocking the launch; use it in `WorktreeStep` of `Dialogs.tsx` with the per-folder pref `worktreeBases` (new in `web/src/prefs.ts`, key `<host>\t<folder>\t<sub>`), send the chosen `base` with every worktree launch (the hub decides when nothing changes), and show `notice` as a toast; verify the web typecheck.
  - `web/src/components/BaseBranch.tsx`; the hint of «Nuevo worktree…» now says it starts from the branch of origin you pick.
- [x] 7.2 Use `BaseBranchSelect` in the Trello drawer's launch form (`web/src/components/Trello.tsx`) when the worktree is checked, re-asking when the destination changes; save `base` in `prefs.trelloLaunch[board]`; show `notice` as a toast; verify the web typecheck.
- [x] 7.3 Re-export `pickBase` from `trello-extension/src/logic.ts` for the dialog. Its matrix is tested once in `server/src/` (3.2), following the testing standards' rule against repeating a shared helper's matrix per wrapper; the memory and the request are built in `background.ts` and `content.ts`, which the layer checks by hand (8.4).
- [x] 7.4 Add the `{ type: 'branches' }` message to `trello-extension/src/types.ts` and the service worker (`background.ts`, `GET /api/ext/branches`), the base branch select to the dialog of `content.ts` (shown with «En un worktree nuevo», re-asked when the destination changes, preselected with `pickBase` from `Memory.boards[board].base`), save `base` on launch, and show `notice` in the dialog after launching; run `pnpm --filter trello-extension test` and `pnpm --filter trello-extension typecheck`.
  - `pnpm --filter trello-extension test` (11 pass) and `typecheck` clean.
- [x] 7.5 In `BaseBranchSelect` (panel) and the extension's dialog: a repository with no remote branches, or a list that could not be read, lets the task launch without a base, with a note saying so and a «Volver a leer» button that reads the list again; only a folder outside git blocks the launch. The panel reads the list without its own error toast (the text below the field already says it). The extension's 404 for `/api/ext/branches` says the panel is too old to list branches. Verify the web and extension typechecks.

## 8. Manual checks

- [x] 8.1 Check with `curl` against a dev hub (isolated `TMUX_TMPDIR`, no `TMUX`/`TMUX_PANE`, a fake machine whose shell reaches temporary repositories with a bare `origin`) `POST /api/ext/launch` with each path of design D1: a base equal to the project's (plain `--worktree`), a hook machine (fake `HOME` with a `WorktreeCreate` hook, the branch created before `claude --worktree`), no hook (`cd <worktree> && claude`), an existing branch (`notice`), an unknown base (error, no window left) and no `base` (as today); restore the repositories after each call.
  - Every path of D1 checked with `curl`: hook + `develop` → plain `--worktree`; hook + `release/2.0` → branch created at `origin/release/2.0`, then `--worktree`; no hook + `release/2.0` → `cd .claude/worktrees/<name> && claude` on that commit; no hook + `master` → plain `--worktree`; an existing `feature/login` → reused worktree and the `notice`; unknown base → 400 «No existe la rama base «no-existe» en origin» and no window left; no `base` → as before; «a b» → 400.
  - Before the adversarial review: the paths without a hook changed since (the hub creates every worktree), and 8.5 checks them again.
- [x] 8.2 Check the `H` path once for real with the koalarnes hook: in a temporary clone with its own `.claude/koalarnes.json`, create the branch as `prepareScript` does and run the plugin's `ka hook worktree-create` with that name; verify it reuses the branch at `origin/<base>`.
  - With koalarnes 0.8.1, `ka hook worktree-create` on a branch created as `prepareScript` does printed «Checking out the existing branch feature/2-hook» and the worktree's HEAD was `origin/release/2.0`, not the project's `develop`.
- [x] 8.3 Check by hand in headless Chrome against the dev hub, on a phone-sized viewport with touch emulation and on a wide one: «Nuevo worktree» lists the branches, preselects the project's base, then the last one used for the folder after a launch, and falls back when that branch is deleted from `origin`; the Trello drawer remembers the base per board; the automation form saves and shows the base; the `notice` toast; «No es un repositorio git». Record what was checked in the pull request.
  - Checked in headless Chrome against the isolated hub, at 1400×900 and on an emulated Pixel 7 (touch): «Nuevo worktree» lists origin's branches with the project's base marked and preselected; after launching from `release/2.0` it preselects `release/2.0` for that folder, and falls back to the project's base once `release/2.0` is deleted from origin; the `notice` toast on an existing branch; «La carpeta no es un repositorio git» on a folder outside git; the automation form offers «Base del proyecto (master)», saves `develop` (the list shows «worktree desde develop», editing preselects it) and saving the project's base shows only «worktree»; the Trello drawer (a temporary card in «[Tablero plantilla]», archived afterwards) saved `base: master` for that board, preselected it when reopened, and another board started from «develop · base del proyecto».
- [x] 8.4 Check the extension's dialog with the method of the memory note on testing it (public board, local hub, fake claude): the branch list follows the destination, the base is remembered per board and another board starts from the project's base.
  - Checked with the extension built with `TWB_EXTRA_HOSTS='http://127.0.0.1/*'`, headless Chrome on the public board with a card rewritten to a temporary card in «[Tablero plantilla]» (archived afterwards), the isolated hub and fake `claude`: with «En un worktree nuevo» the list of `hook` offers «develop · base del proyecto» and switching the destination to `plain` re-reads it («master · base del proyecto»); launching from `develop` on `plain` created the worktree and the toast; reopening the dialog preselected `plain` and `develop`; a card of another board (opened, not launched) started from «master · base del proyecto».
- [x] 8.5 Re-check with `curl` against the isolated hub the revised paths: hook + project base (`H`), no hook + default branch (`W`, branch named like the worktree, `.worktreeinclude` files copied), no base without a hook, a target inside a linked worktree, `E inuse`, a base deleted on `origin`, an unreachable `origin` (`S` notice); and in the panel, a repository without remote branches launching without a base and «Volver a leer».
  - All as expected (`H`, `W` with `.env` copied and `.otro` not, no base from `origin/master`, the linked-worktree target under the main checkout, `E inuse` with no window, `E base`, `S` notice). A hanging `origin` (`ext::sleep 100`) is cut at 12 s with the `S` notice; it showed the watchdog left git's helper alive, now killed too. In the panel, a repository without `origin` launched `feature/10-panel` without a base, and «Volver a leer» showed «Cargando ramas…» again with no error toast.

## 9. Run tests, typecheck and lint

- [x] 9.1 Run `pnpm --filter server test` and `pnpm --filter server typecheck`; verify both pass.
  - After the PR #15 review: `pnpm --filter server test`: 212 pass, 0 fail; `typecheck` clean.
- [x] 9.2 Run `pnpm --filter web typecheck`; verify it passes.
  - `pnpm --filter web typecheck` clean.
- [x] 9.3 Run `pnpm --filter trello-extension test` and `pnpm --filter trello-extension typecheck`; verify both pass.
  - `pnpm --filter trello-extension test`: 11 pass; `typecheck` clean.
- [x] 9.4 Run `ka features-check`; verify it passes. (`host-kit` is not touched: its command does not apply.)
  - `ka features-check` exit 0 (the new capability is not synced yet: step 11 adds it).

## 10. Documentation and changelog

- [x] 10.1 Run `/koalarnes:update-docs` for the new `GET /api/ext/branches` endpoint and `listBranches` action, the new fields of `ExtLaunchRequest`, `ExtLaunchResult` and `Automation`, and the new extension message (server, web and trello-extension standards); apply the approved patches.
  - The standards documents hold generic recipes that already cover a new `/api/ext/*` route, an `ActionOp` and an extension message: nothing in them went stale. Following the `/api/ext/*` recipe, the root `README.md` gained the `GET /api/ext/branches` row, `base?` and `notice` in `POST /api/ext/launch`, and the base branch in «Nuevo worktree», automations and Trello; `trello-extension/README.md` describes «Rama base» and the `cd <worktree> && claude` command.
- [x] 10.2 Add a changelog entry with `/koalarnes:changelog` (user-visible flow, Spanish description, `--issue 14`); verify the file exists under `changelogs/unreleased/`.
  - Three entries under `changelogs/unreleased/` with `--issue 14` and `pr` 15: `web` (the panel), `trello-extension` (the dialog) and `server` (`changed`: without a hook the hub creates every worktree).
- [x] 10.3 Update `README.md`, `trello-extension/README.md` and `docs/FEATURES.md` to the revised behaviour: without a hook the hub always creates the worktree (named like it, from the project's base without a base, `.worktreeinclude` copied), a branch checked out elsewhere is refused, an unreachable `origin` goes on from the known copy, a repository without remote branches launches without a base; and state the contract a `WorktreeCreate` hook must honour (reuse an existing local branch named like the worktree).
  - Done in both READMEs and the «Worktrees» area; a third changelog entry records the behaviour change.
- [x] 10.4 PR #15 review: state in `README.md`, `docs/FEATURES.md` and the JSDoc of `Automation.base` that an automation without a base launches without one (the hook decides; without a hook, the project's base), that a branch on `origin` not fetched yet is reused, and that a worktree whose folder was deleted is created again; add `"pr": "15"` to the three changelog entries.

## 11. Feature catalogue

- [x] 11.1 Sync the spec to `openspec/specs/worktree-base/` with `/opsx:sync` so the check sees the capability, then run `/koalarnes:update-features worktree-base-branch`, review and apply the update of `docs/FEATURES.md` with one anchored section per requirement of `worktree-base`.
  - `openspec/specs/worktree-base/spec.md` created from the delta (Purpose and five requirements; `openspec validate --specs` passes); `docs/FEATURES.md` gained the «Worktrees» area with one anchored section per requirement and its index line.
- [x] 11.2 Run `ka features-check`; verify the exit code is 0.
  - `ka features-check`: 2 capability specs, 10 requirements, in sync; exit 0.
- [x] 11.3 Commit the catalogue sync with `/koalarnes:commit` before the human review.
  - Committed as `docs: add the worktree base branch to the feature catalogue`, after the implementation commit.

## 12. E2E pipeline

- [x] 12.1 The project has no E2E suite; this step does not apply. Record it here.
  - The project has no E2E suite: this step does not apply.

## 13. Human review

- [ ] 13.1 After `/opsx:verify`, `/koalarnes:adversarial-review worktree-base-branch` (the change alters a launch payload and runs git on the machines), `/koalarnes:commit`, the pull request and a clean `/koalarnes:review-pr`, the owner reviews the pull request; findings go through the artifacts and `/opsx:apply` again, until the owner approves in the chat.

## 14. features-check before the archive

- [ ] 14.1 Run `ka features-check` as the last task before `/opsx:archive`; verify the exit code is 0.

## Workflow follow-up

- After approval: `/opsx:archive`, then `/koalarnes:commit` to push the archive into the same pull request.
- Merge with `gh pr merge <n> --squash --delete-branch` on the owner's yes, follow the `deploy` run with `gh run watch` and report it.
- Once merged: propose closing Issue #14 and removing the worktree, in one `AskUserQuestion` call.
- Once deployed: the owner reloads the extension (it updates from the hub) and launches a card from a board with a non-default base on a machine with the koalarnes hook; the worktree's branch starts at that base.
- Once deployed and checked: propose a release (`ka changelog release --dry-run`), together with the release pending from Issue #12.
