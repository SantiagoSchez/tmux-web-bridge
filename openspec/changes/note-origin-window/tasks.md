# Tasks

## 1. Branch

- [x] 1.1 Create `feature/33-las-notas-muestran-la-ventana-en-la-que-se-crearon` from `origin/master` in its own worktree with `/koalarnes:git-worktree create`; verify `git branch --show-current` prints it.

## 2. Review the existing tests

- [x] 2.1 Read `server/src/scratchpads.test.ts` and confirm its tests of `noteText`, `sanitizeScratchpads` and `ScratchpadStore` still describe the behaviour (notes without an origin load and behave as before); record one line per module: "tests up to date" or "tests updated/added in this change".
  - `server/src/scratchpads.test.ts`: tests up to date (the existing ones keep describing notes without an origin); tests added in this change for the origin.
- [x] 2.2 Confirm `web/src/components/Scratchpads.tsx` and `web/src/styles.css` have no tests by the web standards and are checked by hand in 5.4; record it.
  - `web/src/components/Scratchpads.tsx`, `web/src/styles.css`: no tests by the web standards; checked by hand in 5.4.

## 3. Shared types and loading

- [x] 3.1 Add `ScratchpadNoteOrigin`, `origin?` on `ScratchpadNote` and `origin?: { host: string; window: string }` on `ScratchpadAddRequest` to `shared/types.ts`, with JSDoc (design «The panel sends ids; the hub stores ids and names»); verify `pnpm --filter server typecheck` passes.
  - Done; `pnpm --filter server typecheck` passes.
- [x] 3.2 Write failing tests in `server/src/scratchpads.test.ts` for `noteOrigin(raw)` and `sanitizeScratchpads`: a well-formed origin is kept; a missing field, a non-string name, a name over 200 characters or a negative or fractional index drops the origin but keeps the note; a note without origin loads as before. See them fail, implement `noteOrigin` in `shared/scratchpads.ts` and use it in `sanitizeScratchpads`; verify they pass.
  - Seen failing (missing export), then 285 pass.

## 4. Store and route (server)

- [x] 4.1 Write failing tests in `server/src/scratchpads.test.ts`: `originOf(host, windowId)` with a fake host (`id`, `name`, `findWindow`) returns the ids, the host, session and window names and the index, and `undefined` for an unknown window; `ScratchpadStore.add(pad, text, origin)` stores the origin, a new instance reloads it, and `edit` (text and pin) and a paste of a pinned note keep it. See them fail.
  - Seen failing (missing `originOf`).
- [x] 4.2 Implement `originOf` and the `origin` parameter of `add` in `server/src/scratchpads.ts` until 4.1 passes.
  - 289 pass.
- [x] 4.3 In `POST /api/scratchpads/notes` (`server/src/index.ts`), narrow `body.origin` (an object with string `host` and `window`), resolve it with `originOf(hosts.get(host), window)` and pass it to `add`; an unknown machine or window adds the note without origin. Verify `pnpm --filter server typecheck`.
  - Done; typecheck passes.
- [x] 4.4 Check the route with `curl` against an isolated hub (own port, `dataDir`, `HOME`, `TMUX_TMPDIR` and tmux socket, no `TMUX`): with the origin of an open window (the note carries its names), with an unknown window and an unknown machine (added without origin), with a malformed origin (added without origin), without origin (as before).
  - Isolated hub on port 7693 (own dataDir, HOME, TMUX_TMPDIR, socket ./tsock): open window @1 → origin {local, @1, Local, demo, 1, claude}; unknown window @9, unknown machine, origin as a string and with non-string ids → added without origin (200); without origin → as before; bad pad → 400.
- [x] 4.5 Payload audit: list every producer and consumer of `ScratchpadNote`, `Scratchpads`, `ScratchpadAddRequest` and the `scratchpads` message (`grep -rn` over `server/src`, `web/src`, `shared`, `trello-extension/src`) and confirm each was updated or does not need to be; record the list here.
  - Producers: `ScratchpadStore.add` (server/src/scratchpads.ts, updated), `sanitizeScratchpads` (shared/scratchpads.ts, updated), the add route (server/src/index.ts, updated), `AddField` (web, 5.1). Carriers that need no change: the `change` broadcast and the on-connect send (server/src/index.ts:301, 417) send the store as it is; `edit` and `paste` copy the note; web/src/ws.ts:175 stores the pads in the `scratchpads` signal (web/src/state.ts:149). Consumer: `NoteRow` (web, 5.2). trello-extension/src: no use.

## 5. Panel

- [x] 5.1 Send `origin: { host, window }` from `AddField` when the route shows a window.
  - Done.
- [x] 5.2 Add `OriginLine` to `NoteRow` (design «The panel decides open or closed»): open, a button with the current names that opens the window and, on a phone, closes the drawer; closed, a dimmed span with the stored names and the title «Ventana cerrada»; nothing without origin. Lay the text and the line out in a column beside the buttons, in `web/src/styles.css`.
  - Done: `OriginLine` and `.pads-body` / `.pads-origin` in styles.css.
- [x] 5.3 Run `pnpm --filter web typecheck`; verify it passes.
  - `pnpm --filter web typecheck` passes.
- [x] 5.4 Check the panel by hand against the isolated hub of 4.4 (vite dev server proxying to it), wide and phone-sized, dark and light: a note added in a window shows «Local · demo · N name»; one added on the home screen has no line; pressing the line from another window opens it (on the phone, closing the drawer); «Pegar» still types into the window open now; renaming the window updates the line; closing it dims the line and it no longer opens anything; editing and pinning keep the line.
  - Isolated hub + vite, wide (1400×860) dark and light, phone (390×844, touch): a note added in window @0 shows «Local · demo · 0 sh»; one added on the home screen has none; pressing «Local · demo · 1 claude» from window 0 opened window 1; on the phone the tap opened it and closed the drawer; «Pegar» on the note from window 0, pressed in window 1, typed into window 1; renaming window 1 to «api» turned its lines into «1 api»; closing window 0 left «Local · demo · 0 sh» dimmed as a span titled «Ventana cerrada»; pinning kept the line (edit and paste keep it by the store tests).

## 6. Checks

- [x] 6.1 Run the step 4 commands of every touched layer: `pnpm --filter server test`, `pnpm --filter server typecheck`, `pnpm --filter web typecheck`, and `ka features-check`; verify each passes.
  - server test 289 pass, server and web typecheck pass, `ka features-check` exit 0.

## 7. Documentation and changelog

- [x] 7.1 Add a changelog entry with `/koalarnes:changelog` (type `added`, scope `web`, Issue #33).
  - Entry changelogs/unreleased/20261116T211329964-feature-33-….json (added, web, Issue #33).
- [x] 7.2 Run `/koalarnes:update-docs` for the new field of `ScratchpadAddRequest`, `ScratchpadNote` and the `scratchpads` message, and the README's scratchpads paragraph if it describes the notes; apply what it proposes after review.
  - README scratchpads paragraph: one sentence on the window line, approved by the owner. The standards documents describe no scratchpad payload, so nothing to change there.

## 8. Feature catalogue

- [x] 8.1 Sync the spec to `openspec/specs/scratchpads/` with `/opsx:sync`, then run `/koalarnes:update-features note-origin-window`, review and apply the three new sections of `docs/FEATURES.md` (one per added requirement of `scratchpads`).
  - Main spec openspec/specs/scratchpads/spec.md synced (3 requirements appended); FEATURES.md: «La ventana de cada nota», «Volver a la ventana de una nota», «Una ventana cerrada sigue nombrada», approved by the owner.
- [x] 8.2 Run `ka features-check`; verify the exit code is 0.
  - `ka features-check` exit 0 (31 sections).
- [ ] 8.3 Commit the catalogue sync with `/koalarnes:commit` before the human review.

## 9. E2E pipeline

- [x] 9.1 The project has no E2E suite; this step does not apply. Record it here.
  - The project has no E2E suite; this step does not apply.

## 10. Human review

- [ ] 10.1 Another developer (the owner) reviews the pull request after `/koalarnes:review-pr` comes back clean; findings go through the change-request steps until approval.

## 11. Before the archive

- [ ] 11.1 Run `ka features-check` as the last task before `/opsx:archive`; verify the exit code is 0.

## Workflow follow-up

- After approval: `/opsx:archive note-origin-window`, then `/koalarnes:commit` to push the archive into the same pull request.
- Merge only on the owner's yes; while the `deploy` workflow stays disabled at the owner's request, say the merge deploys nothing.
- Once merged, propose closing Issue #33 and removing the worktree, in one `AskUserQuestion` call.
