# Tasks

## 1. Branch

- [x] 1.1 Create `feature/24-cinco-scratchpads-20-notas-y-contador-de-caracteres` from `origin/master` in its own worktree with `/koalarnes:git-worktree create`; verify `git branch --show-current` prints it.

## 2. Review the existing tests

- [x] 2.1 Read `server/src/scratchpads.test.ts` (the only tests of the touched modules; the web layer has none by its standards) and record which tests describe three scratchpads or 10 notes and are updated in this change; one line per module: "tests up to date" or "tests updated/added in this change".
  - server/src/scratchpads.test.ts: tests updated/added in this change (six described three scratchpads or 10 notes). Web modules (Scratchpads.tsx, state.ts, styles.css): no tests by the web standards, checked by hand in 5.2.

## 3. Shared limits and type

- [x] 3.1 Update the failing tests first in `server/src/scratchpads.test.ts`: `sanitizeScratchpads` returns five lists, reads a three-list file with its notes in positions 0 to 2 and empty 3 and 4, and keeps at most 20 notes per list; the store refuses the twenty-first note (409) and accepts index 4; empty stores read as five empty lists. See them fail.
  - Done: tests for five lists, a three-list file kept in place, 20 notes, the twenty-first refused, index 4 accepted; 8 seen failing.
- [x] 3.2 Set `SCRATCHPAD_COUNT = 5`, `SCRATCHPAD_MAX_NOTES = 20` and add `SCRATCHPAD_COUNTER_FROM = 3500` in `shared/scratchpads.ts`; return five lists from `sanitizeScratchpads`, with `SCRATCHPAD_COUNT` declared `satisfies Scratchpads['length']` so it cannot drift from the tuple; make `Scratchpads` a five-element tuple in `shared/types.ts`; replace the literal `[[], [], []]` in `server/src/scratchpads.ts` and `web/src/state.ts`; verify the tests and `pnpm --filter server typecheck` pass.
  - Done: SCRATCHPAD_COUNT 5, SCRATCHPAD_MAX_NOTES 20, SCRATCHPAD_COUNTER_FROM 3500; five-element tuple; 272 server tests and typecheck pass.

- [x] 3.3 Rewrite the comments the change makes false: the header of `server/src/scratchpads.ts` (three lists of 10 notes), `prefs.scratchpad` in `web/src/prefs.ts` (0 blue, 1 green, 2 orange), and every other mention of three scratchpads or `0..2`.
  - Done: server/src/scratchpads.ts header and add() comment, prefs.scratchpad, shared/types.ts, state.ts and styles.css comments now say five and 0..4.

## 4. Panel

- [x] 4.1 In `web/src/components/Scratchpads.tsx`, turn `PADS` into the screen order (blue 0, green 1, yellow 3 with `--yellow`, orange 2, purple 4 with `--mauve`), each entry with its storage position, and use that position for the notes, the selection and the strip; the remembered `prefs.scratchpad` stays a storage position.
  - Done: PADS in screen order with storage positions (yellow 3, purple 4); selection, notes and strip by position.
- [x] 4.2 Replace the `n/10` of the add field with a character counter shown from `SCRATCHPAD_COUNTER_FROM`, marked above `SCRATCHPAD_MAX_CHARS`; give the note editor a wrapper with the same counter; tooltips of the colours read `n/20`. Verify `pnpm --filter web typecheck`.
  - Done: CharCount under the add field and in the editor wrapper, from 3500, class over above 4000; colour tooltips n/20; web typecheck passes. The counter sits under the field (design.md updated: over the corner it covered text and scrollbar).
- [x] 4.3 Count the text without trailing whitespace in the counter of the add field and of the editor (`trimEnd()`, as `noteText()` does), so 3999 characters and two new lines read «3999/4000», not marked. Verify `pnpm --filter web typecheck`.
  - Done: CharCount takes the text and counts text.trimEnd().length in the add field and the editor; web typecheck passes.
- [x] 4.4 Move the counter's measure to `noteLength()` in `shared/scratchpads.ts`, used by `noteText()` and by the counter: first a failing test in `server/src/scratchpads.test.ts` (3999 characters and two new lines measure 3999, and a text over 4000 by that measure is the one `noteText()` refuses), then the function. Verify the server tests and both typechecks.
  - Done: noteLength() in shared/scratchpads.ts, used by noteText() and CharCount; test seen failing (missing export), then 273 server tests and both typechecks pass. docs/FEATURES.md «Añadir una nota» now says trailing whitespace does not count.

## 5. Checks

- [x] 5.1 Run the step 4 commands of every touched layer: `pnpm --filter server test`, `pnpm --filter server typecheck`, `pnpm --filter web typecheck`; and `ka features-check`; verify each passes.
  - Done: 272 server tests, server and web typecheck, ka features-check pass.
- [x] 5.2 Check by hand against an isolated hub started with a three-list `scratchpads.json`: its notes stay blue, green and orange; five colours in order on a wide screen, in the folded strip and in the phone drawer; 20 notes fill a scratchpad; the counter appears at 3500, is marked above 4000, and shows while editing a long note; both themes.
  - Done: three-list seed keeps blue/green/orange; order Azul, Verde, Amarillo, Naranja, Morado on wide screen, folded strip and phone drawer (390px); 20 notes then 409 and field «Lleno…»; counter absent at 3499, 3500/4000 at 3500, marked at 4100; 3800/4000 while editing; dark and light themes.
- [x] 5.3 Audit every producer and consumer of the `scratchpads` message and of `ScratchpadAddRequest.pad`, and confirm each handles five lists and positions 0 to 4.
  - Done, clean: producers server/src/index.ts:300 (change broadcast) and :416 (on connect) send ScratchpadStore.pads (five lists); consumer web/src/ws.ts:175 assigns the five-tuple signal; route server/src/index.ts:785-787 passes pad to add(), which accepts 0 to SCRATCHPAD_COUNT-1; trello-extension uses neither.

## 6. Documentation and changelog

- [x] 6.1 Add a changelog entry with `/koalarnes:changelog` (type `changed`, scope `web`, Issue #24).
  - Done: changelogs/unreleased/20261116T184057572-feature-24-...json (changed, web, Issue 24).
- [x] 6.2 Update the README bullet of the scratchpads (five colours, 20 notes) through `/koalarnes:update-docs`.
  - Done: README bullet (five colours, 20 notes, counter, five-colour strip), approved by the owner; the standards documents do not mention the numbers.

## 7. Feature catalogue

- [x] 7.1 Sync the spec with `/opsx:sync`, then run `/koalarnes:update-features scratchpads` and apply the update of `docs/FEATURES.md`, renaming the anchors of the two renamed requirements.
  - Done: spec synced (two renames, five modified requirements; Purpose changed by hand to «Five coloured scratchpads»); docs/FEATURES.md sections and anchors updated, approved by the owner.
- [x] 7.2 Run `ka features-check`; verify the exit code is 0.
  - Done: ka features-check passes (23 sections verified).
- [x] 7.3 Commit the catalogue sync with `/koalarnes:commit` before the human review.
  - Done: the catalogue sync is in the change's first commit, before the human review.

## 8. E2E pipeline

- [x] 8.1 The project has no E2E suite; this step does not apply. Record it here.
  - Does not apply: the project has no E2E suite.

## 9. Human review

- [x] 9.1 After `/opsx:verify`, `/koalarnes:commit`, the pull request and a clean `/koalarnes:review-pr`, the owner reviews the pull request; findings go through the artifacts and `/opsx:apply` again, until the owner approves in the chat.
  - Done: the owner approved PR #25 in the chat on 2026-11-16.

## 10. features-check before the archive

- [x] 10.1 Run `ka features-check` as the last task before `/opsx:archive`; verify the exit code is 0.
  - Done: exit 0 (23 sections verified).
