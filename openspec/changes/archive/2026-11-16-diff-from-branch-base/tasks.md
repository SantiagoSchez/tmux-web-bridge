# Tasks

## 1. Branch

- [x] 1.1 Create `feature/30-diff-contra-la-rama-base-del-worktree` from `origin/master` in its own worktree with `/koalarnes:git-worktree create`; verify `git branch --show-current` prints it.

## 2. Review the existing tests

- [x] 2.1 Read `server/src/files.test.ts` and confirm no test covers `gitChanges`, `gitStat` or the base script; read the tests that use `branchNameProblem` (`server/src/worktree-base.test.ts`, `server/src/tasks.test.ts` if present) and confirm they still describe it; record one line per module: "tests up to date" or "tests updated/added in this change".
  - `server/src/files.test.ts`: no test covers `gitChanges`, `gitStat` or the base script; tests added in this change (4.1, 5.1).
  - `server/src/worktree-base.test.ts`: its `branchNameProblem` test still describes it (valid and invalid names); tests up to date.
  - `server/src/index.ts`: no tests by the server standards; the route only narrows `base` with the tested `branchNameProblem`, and is checked with `curl` in 5.4.
  - There is no `server/src/tasks.test.ts`.
- [x] 2.2 Confirm `web/src/components/Files.tsx` has no tests by the web standards and is checked by hand in 6.4; record it.
  - `web/src/components/Files.tsx`: no tests by the web standards; checked by hand in 6.4.

## 3. Shared types

- [x] 3.1 Add `defaultBase?: string` and `branches: string[]` to `GitChanges` in `shared/types.ts`, and rewrite the JSDoc of `GitStat.base` and `GitChanges.base` to say they name the branch the current one started from (design «The contract names an origin branch, not a ref»); verify `pnpm --filter server typecheck` passes.
  - Done: `defaultBase` and `branches` in `GitChanges`, JSDoc of `GitStat.base`, `GitChanges.base` and the `base` parameter; `pnpm --filter server typecheck` passes.

## 4. The branch it started from (server)

- [x] 4.1 Write failing tests in `server/src/files.test.ts` that build real repositories (a seed repository and a clone, with a fake host whose `exec.shell` and `exec.spawnShell` run `/bin/sh -c`, `HOME` and `GIT_CONFIG_NOSYSTEM` isolated) and call `gitChanges(host, cwd, 'auto')` and `gitStat(host, cwd)` on branches created: by the hub's command (`git branch --no-track -- x refs/remotes/origin/develop`) → `origin/develop`; with `git checkout -b x origin/develop` → `origin/develop`; from a local `develop` that `origin` has → `origin/develop`; from a local `prueba` that `origin` lacks → `prueba`; with `git worktree add -b x dir` (note `HEAD`), from a hash, from a deleted branch, and with its reflog removed → `origin/master`; from `refs/remotes/origin/x` on a branch named `x` → `origin/master`. Each asserts `base.ref`, `defaultBase`, the mode and the files listed, and `gitStat`'s `base` and counts; on `master` the mode is `head`. See them fail.
  - Done: three tests in `server/src/files.test.ts` over a seed repository, a clone and a worktree per way of creating a branch (plus `tipF`, a name ending in F, the header's end line); seen failing before the change (base `origin/master`, no `defaultBase`).
- [x] 4.2 Replace `BASE_SCRIPT` with `baseScript(asked?)` in `server/src/files.ts` (design «The base comes from the branch's oldest reflog entry» and «One script builder for the base»), printing `D` and `M` lines, and make `gitChanges` and `gitStat` parse `D`; keep the main-branch loop as the fallback; verify 4.1 passes and the script runs under `sh` without bashisms (`sh -n` and the tests under `/bin/sh`).
  - Done: `START_SCRIPT` and `baseScript()` in `server/src/files.ts`, `MODE_SCRIPT` tests against the `D` ref, `gitChanges` parses `D`; the header is cut at a line `F` of its own. 12 tests pass under `/bin/sh` (dash). Mutation check: keeping the own copy, a gone local branch, not mapping a local branch to origin, not cutting `refs/remotes/`, the newest reflog entry, the old `F` cut and not parsing `D` each fail a test; the mode test against a hard-coded `master` passes, as the fixture's main branch is `master` (the rule predates this change).

## 5. Comparing with another branch (server)

- [x] 5.1 Write failing tests in `server/src/files.test.ts` for `gitChanges(host, cwd, 'branch', 'master')` on a worktree created from `origin/develop`: `base.ref` is `origin/master`, the merge-base and the files are those against `origin/master`, `defaultBase` stays `origin/develop`, and `branches` lists origin's branches without `HEAD`; with a branch that is not on `origin` (`borrada`) it rejects with a 404 `FileError` naming it; in `head` mode the asked base is ignored. See them fail.
  - Done: one test in `server/src/files.test.ts` (asked `master`, origin's branches without `HEAD` in branch and auto mode, `prueba` only local gives a 404 naming it, asked base ignored in head mode); seen failing before 5.2.
- [x] 5.2 Implement the asked base and the `O` lines in `baseScript` and `gitChanges` (the name passed through `quote()`, only ever built into `refs/remotes/origin/<name>`); verify 5.1 passes.
  - Done: `baseScript(asked)` and `ORIGIN_BRANCHES_SCRIPT` in `server/src/files.ts`; `gitChanges(host, cwd, mode, base)` passes the base only in branch mode, throws a 404 `FileError` on `GONE` and parses the `O` lines. 13 tests pass; listing origin's HEAD, reading the asked base from local branches, using it in head mode and ignoring it each fail a test.
- [x] 5.3 Read `base` in `GET /api/git/changes` (`server/src/index.ts`), answer 400 with the message of `branchNameProblem` before running anything, and pass it to `gitChanges`; verify `pnpm --filter server typecheck` passes.
  - Done: `GET /api/git/changes` reads `base`, answers 400 with `branchNameProblem`'s message before finding the pane's folder or running anything, and passes it to `gitChanges`; `pnpm --filter server typecheck` passes.
- [x] 5.4 Check the route with `curl` against an isolated hub (own port, `dataDir`, `HOME`, `TMUX_TMPDIR` and tmux socket, no `TMUX`) with a window in a scratch repository: no `base` (200, `defaultBase` and `base.ref` the start branch), `base=master` (200), `base=borrada` (404), `base=-x` and `base=a..b` (400), a missing machine (400).
  - Done against an isolated hub (port 7693, own dataDir, HOME, TMUX_TMPDIR and tmux socket) with a window in worktree `feat` created from `origin/develop` and one on `master`: no `base` 200 (auto and branch: `defaultBase` and `base.ref` `origin/develop`, only `feat.txt`); `base=master` 200 (`develop.txt` and `feat.txt`, `defaultBase` still `origin/develop`); `base=feature/login` 200; `base=borrada` 404 «La rama borrada ya no está en origin»; `base=-x` and `base=a..b` 400; unknown machine 400; `mode=head&base=master` 200 with the asked base ignored; `master` opens on head. `/api/git/stat`: `origin/develop` on `feat`, head mode on `master`. Read-only calls, nothing to restore.
- [x] 5.5 Payload audit: list every producer and consumer of `GitChanges` and `GitStat` (`grep -rn "GitChanges\|GitStat" server/src web/src shared`) and confirm each was updated or does not need to be; record the list here.
  - Producers: `gitChanges` and `gitStat` in `server/src/files.ts` (updated), served by `/api/git/changes` (updated) and `/api/git/stat` (unchanged shape) in `server/src/index.ts`.
  - Consumers: `ChangesView` in `web/src/components/Files.tsx` (updated in 6.1 and 6.2); `DiffView` and the `diff` screen of `web/src/fileViewer.ts` read `root`, `mode` and `base.commit`, unchanged; `ChangesButton` (the +/− counter) reads `GitStat.mode` and `base`, unchanged shape. The Trello extension and the host kit use neither.

## 6. Panel

- [x] 6.1 Add the `changesBase` signal to `web/src/components/Files.tsx`, reset where the modal opens, and send it as `base` from `ChangesView` in «Toda la rama», reloading when it changes (design «The web app keeps the choice in a module signal»).
  - Done: `changesBase` and `changesMode` signals, reset in `openChanges`; `ChangesView` sends `base` in «Toda la rama» and reloads on either; the `mode` of the `changes` screen in `web/src/fileViewer.ts` removed (design updated: the tab chosen survives the diff too).
- [x] 6.2 Add the `<select class="text-input changes-base">` on its own row below `.file-actions` in «Toda la rama» (first option `defaultBase` with value `''`, then `origin/<name>` for the other `branches`, hidden with no other option, `aria-label="Comparar con la rama"`); change the empty message to «Esta rama no tiene cambios respecto a <base.ref>.» and keep the subtitle «desde <base.ref>».
  - Done: `<select class="text-input changes-base">` below the actions in «Toda la rama» (first option `defaultBase`, then `origin/<name>`; hidden with no other option; a gone pick stays selected and the last list is kept to pick another); «Cargando…» while the list is of another branch; empty message names `base.ref`.
- [x] 6.3 Run `pnpm --filter web typecheck`; verify it passes.
  - Done: `pnpm --filter web typecheck` passes.
- [x] 6.4 Check the panel by hand against the isolated hub of 5.4 (vite dev server proxying to it), on a wide viewport and a phone-sized one: a worktree created from `develop` opens on «Toda la rama» with `origin/develop` selected and «desde origin/develop»; picking `master` changes the list and a file's diff; going back keeps `master`; closing and opening resets it; the +/− counter keeps «desde origin/develop»; a branch deleted after the list was read shows the error; on `master` the modal opens on «Sin commit»; both themes.
  - Done against the isolated hub of 5.4 and vite, wide 1440x900 dark and phone 390x844 light (also with the mouse sizes): worktree `feat` opens on «Toda la rama» with `origin/develop` selected and «desde origin/develop»; picking `origin/master` lists `develop.txt` and `feat.txt`, and `develop.txt`'s diff shows it new since that point; back from the diff keeps `origin/master`; Escape and opening again resets it to `origin/develop`; the window's counter stays «desde origin/develop» throughout; `origin/feature/login` deleted after the list was read: «La rama feature/login ya no está en origin», the choice still there, and picking `origin/master` from it works; the window on `master` opens on «Sin commit» and, on «Toda la rama», «respecto a origin/master».

## 7. Checks

- [x] 7.1 Run the step 4 commands of every touched layer: `pnpm --filter server test`, `pnpm --filter server typecheck`, `pnpm --filter web typecheck`, and `ka features-check`; verify each passes.
  - Done: `pnpm --filter server test` 281 pass, server and web typecheck exit 0, `ka features-check` exit 0 (before the catalogue sections of 9.1).

## 8. Documentation and changelog

- [x] 8.1 Add a changelog entry with `/koalarnes:changelog` (type `changed`, scope `web`, Issue #30).
  - Done: `changed`/`web` entry with Issue 30 in `changelogs/unreleased/20261116T203432701-feature-30-diff-contra-la-rama-base-del-worktree.json` (PR number added when the PR opens).
- [x] 8.2 Run `/koalarnes:update-docs` for the new `base` parameter of `GET /api/git/changes` and the fields of `GitChanges`; apply what it proposes after review.
  - Done, approved by the owner: the README paragraph on the +12 −3 button and «Ficheros cambiados» now names the branch it started from and the dropdown. The standards documents do not describe `/api/git/*` or `GitChanges` (grep over `docs/dev-standards/`), so nothing there is stale; the change follows the existing route and host-script workflows.

## 9. Feature catalogue

- [x] 9.1 Run `/koalarnes:update-features diff-from-branch-base`, review and apply the five new sections of `docs/FEATURES.md` (one per added requirement of `worktree-base`).
  - Done: spec synced to `openspec/specs/worktree-base/spec.md` (five requirements added, Purpose extended), `openspec validate --specs` passes; five anchored sections at the end of «Worktrees» in `docs/FEATURES.md` and its index line, approved by the owner.
- [x] 9.2 Run `ka features-check`; verify the exit code is 0.
  - Done: `ka features-check` exit 0 (28 sections verified).
- [x] 9.3 Commit the catalogue sync with `/koalarnes:commit` before the human review.
  - Done: committed with the code in `feat: compare a branch's changes with the branch it started from` (02da9d7), PR #31.

## 10. E2E pipeline

- [x] 10.1 The project has no E2E suite; this step does not apply. Record it here.
  - Not applicable: the project has no E2E suite (step 7 of the mandatory steps).

## 13. Review round 1 (PR #31)

- [x] 13.1 Write a failing test in `server/src/files.test.ts`: an orphan branch `pages` on origin (added to `withBranches`, and to the expected `branches`) asked as base rejects with a 409 `FileError` «La rama pages no tiene historia en común con esta», and an untracked file whose name has `GONE` on a line of its own does not break the list; then make `baseScript(asked)` print `NOBASE` when the merge-base fails, and look for `GONE` and `NOBASE` only in the header; verify the tests pass.
  - Done: orphan `pages` in the fixture; asking for it gives a 409 «La rama pages no tiene historia en común con esta»; a file named `a\nGONE\nNOBASE\nb.txt` is listed in both modes. Both seen failing (404 «ya no está», the file name taken for the label); `baseScript` prints `NOBASE` when the merge-base fails, and the labels are looked for only in the header. 14 tests pass.
- [x] 13.2 Web: keep what the choice offers in a `changesChoice` signal reset in `openChanges`, and abort a superseded request in `ChangesView` (its answer ignored); verify `pnpm --filter web typecheck` and check by hand that a gone branch picked, a diff opened and back, still shows the choice.
  - Done: `changesChoice` signal reset in `openChanges`; `ChangesView` aborts the request a newer one replaces (and on unmount) and ignores its answer; `pnpm --filter web typecheck` passes. By hand against the isolated hub: `origin/feature/login` picked, `feat.txt`'s diff opened, the branch deleted, back: «La rama feature/login ya no está en origin» with the choice still there.
- [x] 13.3 Rewrite the comments that still say «the main one» (`server/src/files.ts` header and `gitDiff`'s message, `GitStat.mode` in `shared/types.ts`); re-run the step 4 commands and `ka features-check`.
  - Done: `server/src/files.ts` header and `gitDiff` message, `GitStat.mode` and `GitDiffMode` in `shared/types.ts`, and the counter label fallback in `Files.tsx` no longer say the comparison is always with the main branch. 282 server tests pass, server and web typecheck exit 0, `ka features-check` exit 0.

## 11. Human review

- [x] 11.1 Another developer (the owner) reviews the pull request after `/koalarnes:review-pr` comes back clean; findings go through the change-request steps until approval.
  - Done: `/koalarnes:review-pr` approved in round 2; the owner approved PR #31 in the chat on 2026-11-16.

## 12. Before the archive

- [x] 12.1 Run `ka features-check` as the last task before `/opsx:archive`; verify the exit code is 0.
  - Done: `ka features-check` exit 0 (28 sections verified).

## Workflow follow-up

- After approval: `/opsx:archive diff-from-branch-base`, then `/koalarnes:commit` to push the archive into the same pull request.
- Merge only on the owner's yes; follow the `deploy` run with `gh run watch` and report it; propose a release.
- Once merged, propose closing Issue #30 and removing the worktree, in one `AskUserQuestion` call.
