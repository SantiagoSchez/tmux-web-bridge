# Tasks

## 1. Branch

- [x] 1.1 Create `feature/21-tres-scratchpads-de-colores` (slug shortened to fit the 64-character worktree limit) from `origin/master` in its own worktree with `/koalarnes:git-worktree create`; verify `git branch --show-current` prints it.

## 2. Review the existing tests

- [x] 2.1 Read the tests of the server modules the change touches (`server/src/index.ts` has none by the server standards; the new `server/src/scratchpads.ts` has none yet) and confirm nothing existing describes the scratchpads; record one line per module: "tests up to date" or "tests updated/added in this change".
  - `server/src/index.ts`: no tests by the server standards; the routes' logic is tested in `server/src/scratchpads.test.ts` (tests added in this change).
  - `server/src/scratchpads.ts` and `shared/scratchpads.ts`: new; tests added in this change (3.2, 4.1, 4.3).
  - No existing test describes the scratchpads (`grep scratch server/src/*.test.ts` only finds an unrelated path in `files.test.ts`).
- [x] 2.2 Confirm the web modules the change touches (`web/src/components/App.tsx`, `Drawer.tsx`, `WindowView.tsx`, the new `Scratchpads.tsx`, `web/src/prefs.ts`, `web/src/state.ts`, `web/src/shortcuts.ts`, `web/src/ws.ts`, `web/src/styles.css`) have no tests by the web standards and are checked by hand in 7.2; record one line per module.
  - `App.tsx`, `Drawer.tsx`, `WindowView.tsx`, `Scratchpads.tsx`, `prefs.ts`, `state.ts`, `shortcuts.ts`, `ws.ts`, `styles.css`: no tests by the web standards; checked by hand in 7.2. Their shared logic (limits and validation in `shared/scratchpads.ts`) is tested in `server/src/scratchpads.test.ts`.

## 3. Shared types and limits

- [x] 3.1 Add `ScratchpadNote`, `Scratchpads`, the `ServerMessage` variant `{ t: 'scratchpads'; pads: Scratchpads }` and the request bodies of the four endpoints to `shared/types.ts`, with JSDoc (design «Data model and limits»); verify `pnpm --filter server typecheck` passes.
  - Types `ScratchpadNote`, `Scratchpads`, `ScratchpadAddRequest`, `ScratchpadEditRequest`, `ScratchpadPasteRequest` and the `scratchpads` server message; `pnpm --filter server typecheck` passes.
- [x] 3.2 Write failing tests in `server/src/scratchpads.test.ts` for `noteText(raw)` and `sanitizeScratchpads(raw)` of `shared/scratchpads.ts`: trailing whitespace trimmed, empty or whitespace-only refused, 4000 characters accepted and 4001 refused, a non-string refused; on load, exactly three scratchpads, at most 10 notes each, notes without a string `id` or `text` dropped, `pinned` coerced to a boolean, unknown keys dropped; see them fail, implement, and verify they pass.
  - Seven tests in `server/src/scratchpads.test.ts`; seen failing without the module, without the 10-note cut and without the duplicate-id check.

## 4. Store on the hub

- [x] 4.1 Write failing tests in `server/src/scratchpads.test.ts` for `ScratchpadStore` against a temporary `dataDir`: `add` appends an unpinned note with a new id and emits `change`; an eleventh note is refused with status 409 and a Spanish message; a bad scratchpad index or text with 400; `edit` changes the text or the pin, and empty text removes the note; `edit` and `remove` of an unknown id give 404; a new instance reloads the saved file; a broken file starts empty; see them fail.
  - Seven tests in `server/src/scratchpads.test.ts` against a temporary `dataDir`, seen failing before the store existed.
- [x] 4.2 Implement `ScratchpadStore` and `ScratchpadError` in `server/src/scratchpads.ts` (temporary file + `renameSync`, mode `0o600`, `Events: 'change' (Scratchpads).`) until 4.1 passes.
  - `ScratchpadStore` and `ScratchpadError` in `server/src/scratchpads.ts`; 18 tests pass.
- [x] 4.3 Write failing tests for the paste bookkeeping: `startPaste` of a note returns it and a second `startPaste` of the same note before `finishPaste` gives 404; `finishPaste(id, true)` removes an unpinned note and keeps a pinned one; `finishPaste(id, false)` keeps the note and lets it be pasted again; a note deleted while being pasted is not brought back; see them fail, implement in `server/src/scratchpads.ts`, and verify they pass.
  - Four tests; seen failing with the paste mark removed and with pinned notes removed on paste.

## 5. Routes and broadcast

- [x] 5.1 Instantiate the store in `server/src/index.ts`, broadcast `{ t: 'scratchpads' }` on `change` and send it in the `/ws` snapshot; add `POST /api/scratchpads/notes`, `POST /api/scratchpads/notes/:id`, `POST /api/scratchpads/notes/:id/delete` and `POST /api/scratchpads/notes/:id/paste` under a `// ---- scratchpads` banner, narrowing every body field, answering `ScratchpadError` with its status and a failed paste with 502 «No se pudo pegar en <máquina>: …», checking `pane` against `^%\d+$` and `findPane`, and pasting with the existing `pasteText`; logs name the note id, never its text.
  - Store, broadcast, snapshot and the four routes under `// ---- scratchpads` in `server/src/index.ts`; `pnpm --filter server typecheck` passes.
- [x] 5.2 Boot smoke test: start the hub on its own port and `TMUX_TMPDIR` (no `TMUX`/`TMUX_PANE`, a scratch `dataDir`), wait for its ready line, stop it; verify it started without errors.
  - Isolated hub (own port 7693, dataDir, HOME, TMUX_TMPDIR and relative tmux socket) started and printed «tmux-web-bridge escuchando…» with no error.
- [x] 5.3 Check the endpoints with `curl` against that isolated hub with a `local` machine on its own tmux socket: add (200, then 409 at the eleventh, 400 for empty text or a bad index), edit and pin (200, 404 for an unknown id), delete (200), paste into a pane of the isolated tmux (200, the text in `capture-pane` without a new command run, the unpinned note gone, a pinned one kept), paste to a missing pane (404) and to a closed machine (502, note kept); restore the data afterwards.
  - All answers as expected: add 200, empty 400, bad or missing index 400, eleventh 409, edit 200, unknown id 404, missing pane 404, bad pane id 400, paste 200 (text on the shell prompt, not run; unpinned note gone; a second paste 404), pinned note pasted and kept, delete 200 then 404, paste with the machine's tmux down 502 with the note kept. Logs name the note id only. Scratch data, nothing to restore.

## 6. Panel

- [x] 6.1 Add the `scratchpads` signal in `web/src/state.ts` and its `case` in `web/src/ws.ts`; add `paneOf()` to `web/src/state.ts` with `WindowView`'s rule and make `WindowView` use it (design «Target pane in the panel»); verify `pnpm --filter web typecheck` passes.
  - Done: `scratchpads` signal and ws case; `paneOf()` in state.ts used by WindowView and by the paste target of Scratchpads.tsx.
- [x] 6.2 Add `scratchpadsCollapsed` and `scratchpad` (0, 1 or 2) to `prefs.ts` with `toggleScratchpads()` and `SCRATCHPADS_KEY` (⌘. on a Mac, Ctrl+Shift+. elsewhere, matched on `e.code === 'Period'`), and bind it in `shortcuts.ts` next to Cmd+B on wide screens only.
  - Done: prefs `scratchpadsCollapsed`, `scratchpad`, `toggleScratchpads()`, `SCRATCHPADS_KEY`; shortcut on `e.code === 'Period'`, wide screens only; checked it does not reach the terminal.
- [x] 6.3 Write `web/src/components/Scratchpads.tsx`: the colour tabs (`role="tablist"`), the selected scratchpad's notes, `NoteRow` (click on the text edits it in a `textarea`: Enter or blur saves, Shift+Enter new line, Escape cancels, empty deletes; paste, pin and delete buttons with `aria-label`s, paste disabled outside a window (no target pane)), the add field (Enter adds, Shift+Enter new line, disabled with «Lleno» at 10 notes, `n/10`), errors as toasts through `api<T>()`; colours from `--blue`, `--green` and `--peach`.
  - Done: Scratchpads, NoteRow, NoteEditor, AddField; notes laid out in one row (text, then the three buttons), fields grow with their text (field-sizing).
- [x] 6.4 Add the desktop column and its folded strip (`ScratchpadsRail`: a button that unfolds and the three dots, each unfolding on its scratchpad) to `App.tsx` and `styles.css` (design «Layout on wide screens»), the limits strip and update notice spanning every column.
  - Done: `pads-side` column (320px) and `ScratchpadsRail`; limits strip and update notice span the three columns.
- [x] 6.5 Extract the edge gesture of `Drawer.tsx` into an `EdgeDrawer` component, keep the list's drawer on it, let the back button close it (`backButton.ts`), close it after a successful paste, and add `ScratchpadsDrawer` on the right edge with a `scratchpadsOpen` signal, mounted on every phone screen (design «Drawer on phones»).
  - Done: `EdgeDrawer` with `other`, `Drawer` and `ScratchpadsDrawer`; backButton.ts counts `scratchpadsOpen`; the header window swipe ignores both edges.
- [x] 6.6 Run `pnpm --filter web typecheck`; verify it passes.
  - Done: `pnpm --filter web typecheck` passes.

## 7. Checks

- [x] 7.1 Run the step 4 commands of every touched layer: `pnpm --filter server test`, `pnpm --filter server typecheck`, `pnpm --filter web typecheck`; and `ka features-check`; verify each passes.
  - Done: server test 254 pass (268 after rebasing onto `master`, which brought PR #22's tests), server and web typecheck pass, `ka features-check` exit 0.
- [x] 7.2 Check the panel by hand against the isolated hub (vite dev server proxying to it), on a wide viewport and a phone-sized one: add, edit, Escape, empty-deletes, pin, delete, the 10-note limit, paste into a pane (text in the input without Enter, unpinned note gone on a second open tab), paste disabled on the home screen, fold and unfold with the button, the strip dots and the shortcut (state kept after a reload), the right-edge drawer opening and closing while the left one still works, and both themes.
  - Done against the isolated hub (port 7693, own tmux socket) and vite: wide 1440x900 in dark and light; phone 390x844 with CDP touch emulation. Add (Shift+Enter keeps the new line), edit with Enter, Escape cancels without leaving the window, empty deletes, pin, 10-note limit (field disabled, «Lleno», 10/10), paste typed without Enter (pinned kept, unpinned gone), live sync (notes added from another client with curl showed up without a reload), paste disabled on home, fold by button, by dot (unfolds on that colour) and by Ctrl+Shift+. with the terminal focused (nothing typed), kept after reload; phone: right-edge swipe opens, paste closes it, the right swipe does nothing while the list is open, tap outside, swipe back and the back button close it. Found and fixed: notes took two rows each, the resize grip overlapped the counter.

## 8. Documentation and changelog

- [x] 8.1 Add a changelog entry with `/koalarnes:changelog` (type `added`, scope `web`, Issue #21).
  - Done: `added`/`web` entry with Issue 21 in changelogs/unreleased/ (PR number added when the PR opens).
- [x] 8.2 Run `/koalarnes:update-docs`: the new store, routes and broadcast follow the existing workflows of `docs/dev-standards/server-standards.md`; add the scratchpads to the README's feature list and to its keyboard shortcuts if it lists them; apply what it proposes after review.
  - Done with /koalarnes:update-docs, approved by the owner: README feature bullet; web-standards convention on `paneOf()` and workflow for edge drawers and back-button layers. server-standards already describes the store + broadcast workflow followed; nothing stale.

## 9. Feature catalogue

- [x] 9.1 Sync the spec to `openspec/specs/scratchpads/` with `/opsx:sync`, then run `/koalarnes:update-features scratchpads`, review and apply the update of `docs/FEATURES.md` with one anchored section per requirement of `scratchpads`.
  - Done: `openspec/specs/scratchpads/spec.md` created from the delta (Purpose and 9 requirements), `openspec validate --specs` passes; new «Scratchpads» area in docs/FEATURES.md with one anchored section per requirement and its index line, approved by the owner.
- [x] 9.2 Run `ka features-check`; verify the exit code is 0.
  - Done: `ka features-check` exit 0 (23 sections verified).
- [x] 9.3 Commit the catalogue sync with `/koalarnes:commit` before the human review.
  - Done: committed with the docs and the changelog entry in `docs: describe the scratchpads`.

## 10. E2E pipeline

- [x] 10.1 The project has no E2E suite; this step does not apply. Record it here.
  - Not applicable: the project has no E2E suite (step 7 of the mandatory steps).

## 13. Review round 1 (PR #23)

- [x] 13.1 Write failing tests in `server/src/scratchpads.test.ts` for `ScratchpadStore.paste(id, send)`: success removes an unpinned note and keeps a pinned one; a second `paste` while the first awaits gets 409, pinned or not; a rejecting `send` keeps the note, lets it be pasted again and passes the error up; a note deleted while `send` awaits is not brought back; and for `edit` with a text over 4000 characters or not a string (400). Replace `startPaste`/`finishPaste` with `paste` in `server/src/scratchpads.ts` and make the route call it with a `send` that turns a `pasteText` failure into a 502 naming the machine; verify the tests pass.
  - Done: five paste tests rewritten against `paste(id, send)` and seen failing before it existed; the `edit` test with a too-long or non-string text seen failing under a mutation that saved it; `startPaste`/`finishPaste` replaced by `paste`, the route passes a `send` that turns a `pasteText` failure into a 502 naming the machine; 270 server tests and typecheck pass.
- [x] 13.2 Web: remove `maxLength` from both fields; keep a note open with its text when saving it fails; ignore Enter in the add field while adding; set `scratchpadPasted` after a paste and focus that pane's terminal on a computer; 44 px note buttons under `pointer: coarse`; `EdgeDrawer` does not start while a sheet, dialog, palette or file viewer is open; `role="tabpanel"` on a wrapper of the `<ul>`; «1 nota» in the labels. Verify `pnpm --filter web typecheck`.
  - Done: no `maxLength`; the editor stays open with its text when the save fails; the add field ignores Enter while adding; `scratchpadPasted` focuses the pane terminal on a computer; 44 px note buttons under `pointer: coarse`; `EdgeDrawer` skips a touch while a sheet, dialog, palette or file viewer is open; `role="tabpanel"` on a div around the `<ul>`; «1 nota». `pnpm --filter web typecheck` passes.
- [x] 13.3 Re-run the step 4 commands and `ka features-check`; update the «Pegar una nota en el panel», «Editar una nota» and «Límite de 10 notas» sections of `docs/FEATURES.md` to the amended spec; check the panel by hand against the isolated hub (5000-character note in the field and in an edit, focus after paste, 44 px buttons on the phone viewport, drawer not opening under a sheet).
  - Done: 270 server tests, both typechecks and `ka features-check` pass; three catalogue sections updated. By hand on the isolated hub: a 5000-character note shows «Una nota admite como mucho 4000 caracteres» and stays in the field; a 5000-character edit stays open and Escape then cancels it; after a paste, typed keys and Enter reach the pane without clicking it; on 390x844 with touch emulation the note buttons measure 44x44 and the right-edge swipe does nothing while Ajustes is open.

## 11. Human review

- [ ] 11.1 After `/opsx:verify`, `/koalarnes:commit`, the pull request and a clean `/koalarnes:review-pr`, the owner reviews the pull request; findings go through the artifacts and `/opsx:apply` again, until the owner approves in the chat.

## 12. features-check before the archive

- [ ] 12.1 Run `ka features-check` as the last task before `/opsx:archive`; verify the exit code is 0.

## Workflow follow-up

- After approval: `/opsx:archive`, then `/koalarnes:commit` to push the archive into the same pull request.
- Merge with `gh pr merge <n> --squash --delete-branch` on the owner's yes, follow the `deploy` run with `gh run watch` and report it.
- Once merged: propose closing Issue #21 and removing the worktree, in one `AskUserQuestion` call.
- Once deployed and checked: propose a release (`ka changelog release --dry-run`).
