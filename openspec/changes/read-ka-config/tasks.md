# Tasks

## 1. Branch

- [x] 1.1 Create `bugfix/46-el-panel-no-lee-la-configuracion-de-ka-claude-ka-json` from `origin/master` in its own worktree with `/ka:git-worktree create`; verify `git branch --show-current` prints it.
  - Done; `git branch --show-current` prints it.

## 2. Review the existing tests

- [x] 2.1 Read `server/src/project-refs.test.ts` and `server/src/worktree-base.test.ts` and confirm they still describe the intended behaviour for `.claude/koalarnes.json` (it stays the fallback, design D3); record one line per module. The tests for `.claude/ka.json` and the precedence are added test-first in groups 3 and 4.
  - `server/src/project-refs.test.ts`: tests up to date (`koalarnes.json` gives the repository and board, wins over origin, malformed or wrong values dropped); tests added in this change for `ka.json` (3.1).
  - `server/src/worktree-base.test.ts`: tests up to date (`git.baseBranch` of `koalarnes.json` while origin has it, hook and native preparation); tests added in this change for `ka.json` (3.3).

## 3. One reader of the harness configuration (server)

- [x] 3.1 In `server/src/project-refs.test.ts`, add failing tests that run `contextScript` for real against a temporary repository: a project with only `.claude/ka.json` gives its repository and Trello board; a project with both files takes them from `.claude/ka.json` (design D1); the existing `.claude/koalarnes.json` tests keep passing unchanged. Verify the new tests fail with `pnpm --filter server test`.
  - Added `ka.json gives the repository and the Trello board…` and `ka.json wins over koalarnes.json as a whole…` (the `repo()` helper takes `ka`; the fixture constant is now `CONFIG`). Both failed before 3.2 (the script read only `koalarnes.json`); the six `koalarnes.json` tests kept passing.
- [x] 3.2 Create `server/src/harness-config.ts` with `MAX_CONFIG` and the shell fragment that sets `f` to `$top/.claude/ka.json`, else `$top/.claude/koalarnes.json` (design D2), and use it in `contextScript` in place of its own assignment. Update the comments of `project-refs.ts` so they name both files. Verify the tests of 3.1 pass with `pnpm --filter server test`.
  - `server/src/harness-config.ts` exports `MAX_CONFIG` and `CONFIG_FILE`; `contextScript` uses them and the comments name both files. `project-refs.test.ts`: 9 pass.
- [x] 3.3 In `server/src/worktree-base.test.ts`, add failing tests through `branches` (and so `PROJECT_BASE`): `git.baseBranch` of a `.claude/ka.json` is the base while origin has it; with both files, `.claude/ka.json`'s value wins. Verify they fail with `pnpm --filter server test`.
  - Added `ka.json's git.baseBranch is the base while origin has it, and wins over koalarnes.json as a whole`; it failed before 3.4.
- [x] 3.4 Use the shared fragment and `MAX_CONFIG` in `PROJECT_BASE` (`server/src/worktree-base.ts`) and update its comments. Verify the tests of 3.3 and every existing one pass with `pnpm --filter server test`, and `pnpm --filter server typecheck` passes.
  - `PROJECT_BASE` uses `CONFIG_FILE` and `MAX_CONFIG`; comment updated. `worktree-base.test.ts`: 32 pass; server typecheck passes. Seen failing: with the two names swapped in `CONFIG_FILE`, both precedence tests fail; restored, all pass.
- [x] 3.5 Update the comments that name only `koalarnes.json`: `shared/types.ts` (the `RefContext` doc and the project's base) and `web/src/refLinks.ts`. Verify `pnpm --filter server typecheck` and `pnpm --filter web typecheck` pass.
  - `shared/types.ts` (`RefContext`, the branch list's `base`) and `web/src/refLinks.ts` (`CONTEXT_TTL`) name `ka.json` and the fallback. Server and web typecheck pass.

## 4. Checks

- [x] 4.1 Run the step 4 commands of the touched layers: `pnpm --filter server test`, `pnpm --filter server typecheck`, `pnpm --filter web typecheck`; and the project checks `ka scope` says apply (`ka features-check`). Run `openspec validate read-ka-config --strict`. Verify each passes.
  - Server tests 307/307 pass; server and web typecheck exit 0; `ka scope`: the feature catalogue check applies, `ka features-check` exit 0 (47 sections); `openspec validate --strict` valid.
  - After merging `master` (PR #45, which adds the `ka docs-check` gate): server tests 307/307 again, `ka features-check` and `ka docs-check` exit 0 (review R1-02).

## 5. Documentation and changelog

- [x] 5.1 Add a changelog entry with `/ka:changelog` (type `fixed`, scope `server`, Issue #46): links and the base branch work again in projects migrated to `.claude/ka.json`.
  - Entry `changelogs/unreleased/20261117T193653539-bugfix-46-….json` (fixed, server, Issue #46).
- [x] 5.2 Run `/ka:update-docs` and apply what it proposes: the README line about «Nuevo worktree»'s base branch names both files. Verify `grep -n koalarnes.json README.md` shows only lines that also name `ka.json`.
  - README (the «Nuevo espacio» bullet): the project's base names `.claude/ka.json` and the fallback; the grep shows only that line. The standards' mentions of `.claude/koalarnes.json` describe this repository's harness, renamed in PR #45, so they stay here. No standards document describes the readers; nothing else went stale.

## 6. Feature catalogue

- [x] 6.1 Run `/ka:update-features read-ka-config`, review and apply: the sections of `terminal-links` (repository, Trello) and `worktree-base` (base branch offered first) name `.claude/ka.json` and the fallback.
  - «De qué repositorio sale cada enlace» (docs/FEATURES.md:32), «Enlaces a tarjetas de Trello» (:37) and «Qué rama propone primero» (:59) name `.claude/ka.json`, the fallback and which one wins.
- [x] 6.2 Run `ka features-check --strict`; verify the exit code is 0.
  - 47 sections verified, exit 0.
- [x] 6.3 Commit the catalogue sync with `/ka:commit` before the human review.
  - Committed `docs(features)` with tasks.md and review.json, after gate passed on round 1.

## 7. E2E pipeline

- [x] 7.1 The project has no E2E suite; this step does not apply. Record it here.
  - The project has no E2E suite; this step does not apply.

## 8. Human review

- [ ] 8.1 Once `ka review-rounds gate` passes, ask the owner with `AskUserQuestion` who reviews the pull request (a person, or the owner takes it as good) and record the answer here; findings go through the fix path of the review loop until approval.

## 9. Before the archive

- [ ] 9.1 Run `ka features-check --strict` as the last task before `/opsx:archive`; verify the exit code is 0.

## Workflow follow-up

- `/opsx:archive`, then `/ka:commit` to push the archive moves into the pull request.
- Merge with `--squash --match-head-commit`, follow the `deploy` run with `gh run watch`, and propose a release.
