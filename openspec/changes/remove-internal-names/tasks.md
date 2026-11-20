# Tasks

The list of the original names and their replacements lives outside the repository (design.md, Context). No task, note or commit message writes an original name.

## 1. Branch (mandatory step 1)

- [x] 1.1 Create the branch `chore/remove-internal-names` from `origin/master` in its own worktree with `/ka:git-worktree create` (a chore with no work item). Verify with `git branch --show-current`.
  - Created; `git branch --show-current` prints `chore/remove-internal-names`, based on `2e23880`.

## 2. Review the existing tests (mandatory step 2)

- [x] 2.1 Read the server tests that hold the names (`server/src/machines.test.ts`, `scheduled.test.ts`, `scheduled-rules.test.ts`, `ext.test.ts`, `window-details.test.ts`) and output one line per module saying whether its tests stay up to date once only their example values change.
  - `server/src/machines.test.ts`, `scheduled.test.ts`, `scheduled-rules.test.ts`, `ext.test.ts`, `window-details.test.ts`: tests up to date; only their example values change, no assertion changes meaning.

## 3. Replace the names (mandatory step 3, design D1 to D4)

- [x] 3.1 Replace the names and addresses in the five server test files with the mapping of D1 and D2. Verify: `pnpm --filter server test` passes with the same number of tests as on `master`.
  - Replaced through a script outside the repository. The escaped address in a regular expression of `machines.test.ts` needed a hand edit (the first run failed on it). `pnpm --filter server test`: 397 tests, 397 pass, as on `master`.
- [x] 3.2 Replace the names in the archived changes under `openspec/changes/archive/`, changing nothing else (D4). Verify: `git diff --stat` touches only lines that held a name.
  - 12 archived files; a word diff shows only name changes.
- [x] 3.3 Check the spec deltas of this change: `scheduled-messages`, `usage-limits` and `window-details`, each requirement block whole under MODIFIED with only its example values changed (D3). Verify: `openspec validate --strict remove-internal-names` passes, and a diff of each delta block against its main spec block shows only name changes.
  - 3 requirements of `scheduled-messages`, 1 of `usage-limits`, 4 of `window-details`, each built from its main spec block with only the names replaced. `openspec validate --strict`: valid.
- [x] 3.4 Search every tracked file, case-insensitively, for each original name and address of the mapping. Verify: no match outside the main specs that the archive syncs (`openspec/specs/scheduled-messages`, `usage-limits`, `window-details`).
  - Matches left only in the three main specs, which the archive syncs.

## 4. The rule (mandatory step 3, design D5)

- [x] 4.1 Add a principle to `docs/dev-standards/base-standards.md`: the repository is public, so nothing published (tracked files, commit messages, pull requests, issues, comments) names the owner's machines, projects, people or network addresses; use generic names instead. Add one line under «Always in view» in `AGENTS.md` that links it. Verify with `ka docs-check`.
  - Principle 8 «The repository is public» in `docs/dev-standards/base-standards.md`; one line under «Always in view» in `AGENTS.md`. `ka docs-check`: no dead reference.

## 5. Tests, typecheck and lint (mandatory step 4)

- [x] 5.1 Run `pnpm --filter server test` and `pnpm --filter server typecheck`; both must pass. Run `ka scope` and the checks it lists (`ka features-check`, `ka docs-check`), reporting the ones that do not apply, and `openspec validate --strict remove-internal-names`.
  - `pnpm --filter server test`: 397 pass. `pnpm --filter server typecheck`: exit 0. `ka scope`: both checks apply, no E2E suite. `ka features-check`: in sync (84 sections). `ka docs-check`: no dead reference. `openspec validate --strict`: valid.

## 6. Documentation and changelog (mandatory step 5)

- [x] 6.1 Run `/ka:update-docs`. No API contract, data model, payload, environment variable or user-visible flow changes, so no changelog entry: the change is internal. Record that here.
  - The standards change is the new principle (4.1); nothing else in the standards describes what changed. No changelog entry: the change is internal (tests, OpenSpec artifacts, standards).

## 7. GitHub texts

- [x] 7.1 Replace the names, with the same mapping, in the descriptions and the agent's own comments of Issue #16, #43, #52, #60, #61, #64 and PR #4, #44, #53, #62. Verify: a search of each one's description and comments finds no original name. Review bodies and comments count too.
  - 12 texts edited: the descriptions of Issue #16, #43, #61, #64 and PR #44, #62, two comments (Issue #43, #61) and four review bodies (PR #44, #62); all were written from the owner's account. The other numbers held only names the owner chose to keep. A dry run over #1 to #66 afterwards finds nothing left.

## 8. Feature catalogue (mandatory step 6, after the review loop's gate passes)

- [x] 8.1 Run `/ka:update-features remove-internal-names`, then `ka features-check --strict` with exit code 0, and commit with `/ka:commit`. The catalogue holds none of the names, so the sections are expected to stay as they are.
  - After round 1's gate passed on `edaf5e0`. The 8 modified requirements change only example names in their scenarios, which the catalogue does not quote, so their sections stay as they are; `docs/FEATURES.md` holds none of the names. `ka features-check --strict`: exit 0, 84 sections in sync.

## 9. E2E pipeline (mandatory step 7)

- [x] 9.1 The project has no E2E suite; this step does not apply. Record it here.
  - Not applicable: `ka scope` reports no E2E suite.

## 10. Human review (mandatory step 8)

- [ ] 10.1 Ask the owner with `AskUserQuestion` who reviews the pull request and record the answer here; do not archive before the approval or that answer.

## 11. features-check before the archive (mandatory step 9)

- [ ] 11.1 Run `ka features-check --strict` as the last task before `/opsx:archive`; the exit code must be 0. After the archive, repeat the search of 3.4 with no exception left.

## Workflow follow-up

- Between groups 6 and 8: `/opsx:verify`, `/ka:commit` with the pull request, and the bounded review loop. No adversarial review: no payload, wiring or migration changes.
- After the approval: `/opsx:archive`, `/ka:commit`, check the head, merge with `gh pr merge --squash --match-head-commit <sha>` on the owner's yes, follow the `deploy` run, and remove the worktree.
