# Tasks

## 1. Branch

- [x] 1.1 Create `feature/36-nota-rapida-con-atajo-de-teclado-y-seccion-de-atajos` from `origin/master` in its own worktree with `/koalarnes:git-worktree create`; verify `git branch --show-current` prints it.

## 2. Review the existing tests

- [x] 2.1 Read `server/src/shortcut.test.ts` and confirm what still describes the intended behaviour: the round-trip test stays; the refusal test lists `meta+KeyK`, which this change allows (design «Shortcut logic moves to `shared/shortcuts.ts`»), so update it before the implementation lands. Record one line per module: "tests up to date" or "tests updated/added in this change".
  - `server/src/shortcut.test.ts`: tests updated in this change (Cmd+K is no longer refused; it now imports `shared/shortcuts.js` and covers defaults, saved shortcuts, matching, clashes and formatting).
- [x] 2.2 Read `server/src/settings.test.ts` (if it covers `dictationShortcut`) and confirm it still holds with the moved helpers; record it.
  - `server/src/settings.test.ts`: tests up to date (it checks `dictationShortcut` through the store, unchanged).
- [x] 2.3 Confirm `web/src/shortcuts.ts`, `web/src/prefs.ts`, `web/src/components/Settings.tsx`, `Dialogs.tsx`, `Scratchpads.tsx`, `Header.tsx`, `Rail.tsx` have no tests by the web standards and are checked by hand in 5.7; record it.
  - Web files: no tests by the web standards; checked by hand in 5.7.

## 3. Shared shortcut logic (server layer)

- [x] 3.1 Write failing tests in `server/src/shortcut.test.ts` importing from `shared/shortcuts.js`: round-trip; refusals (without Ctrl/Alt/Cmd, Ctrl+letter alone, Ctrl+number) and `meta+KeyK` now accepted; `panelShortcut` gives each id's Mac and other default, the saved combination when it parses and the default when it does not; `matchesShortcut` needs the same code and all four modifiers; `shortcutClash` names the shortcut already using a combination and gives null otherwise; `formatShortcut` writes «⌃⌥N», «⌘.», «⌥⌘D» on a Mac and «Ctrl+Alt+N», «Ctrl+Shift+Espacio» elsewhere. See them fail.
  - Seen failing (module not found).
- [x] 3.2 Create `shared/shortcuts.ts` (move `Shortcut`, `parseShortcut`, `serializeShortcut`, `shortcutProblem` without the Cmd+K rule; add `PANEL_SHORTCUTS`, `PanelShortcutId`, `panelShortcut`, `matchesShortcut`, `shortcutClash`, `formatShortcut`), remove them from `shared/dictation.ts`, and move every importer (`server/src/settings.ts`, `web/src/dictation.ts`, `web/src/components/Settings.tsx`, `web/src/components/Mic.tsx`). Verify 3.1 passes and `pnpm --filter server typecheck` and `pnpm --filter web typecheck` pass.
  - 296 pass; server and web typecheck pass. Mic.tsx kept importing `formatShortcut` from web/src/dictation.ts, now a wrapper of the shared one.

## 4. Panel shortcuts per device (web)

- [x] 4.1 Add `shortcuts: Partial<Record<PanelShortcutId, string>>` to `Prefs` (default `{}`); in `web/src/shortcuts.ts` add `isMac`, `shortcutOf(id)`, `shortcutLabel(id)` and move `recordingShortcut` there from `web/src/dictation.ts` (updating its users).
  - Done; `recordingShortcut` moved to web/src/shortcuts.ts, web/src/dictation.ts and Settings.tsx import it from there.
- [x] 4.2 Rewrite `bindShortcuts` to match search, fold list, fold scratchpads and quick note with `matchesShortcut(e, shortcutOf(id))`, return at once while `recordingShortcut` is true, keep the fold shortcuts on wide screens only and the number families as they are; the quick note opens `dialog.value = { kind: 'quickNote' }` when no dialog is open.
  - Done.
- [x] 4.3 Remove `SIDEBAR_KEY` and `SCRATCHPADS_KEY` from `web/src/prefs.ts`; `Header.tsx`, `Rail.tsx` and `Scratchpads.tsx` use `shortcutLabel`. Verify `pnpm --filter web typecheck`.
  - Done; `pnpm --filter web typecheck` passes.

## 5. Quick note and «Atajos» (web)

- [x] 5.1 Extract `addNote(pad, text)` from `AddField` in `Scratchpads.tsx` (route origin, toast-free result with the hub's error), and make `AddField` use it.
  - Done: `addNote(pad, text)` returns the hub error or null; `AddField` toasts it.
- [x] 5.2 Add the `quickNote` variant to `Dialog` in `web/src/state.ts`, and `QuickNoteDialog` in `Scratchpads.tsx` mounted from `Dialogs.tsx` in a `Sheet` «Nota rápida»: focused textarea with `CharCount`, the radiogroup of five colours in `PADS` order with roving `tabindex` and arrows, Alt+1…5 by `event.code`, Enter adds and closes, Shift+Enter new line, Escape closes, focus restored to the element active on open; full scratchpad and hub refusals keep it open with the reason; after adding, `setPref('scratchpad', pad)`. Styles in `web/src/styles.css`.
  - Done (QuickNoteDialog in Scratchpads.tsx, reusing the colour tabs' classes).
- [x] 5.3 Generalise `ShortcutSetting` in `Settings.tsx` (label, value, default, the combinations taken with their labels, `onChange`), refusing with `shortcutProblem` and `shortcutClash`.
  - Done as `ShortcutRow` in the new web/src/components/ShortcutSettings.tsx (moved out of Settings.tsx); `recordingShortcut` holds the id of the row listening.
- [x] 5.4 Add the `'shortcuts'` `SettingsTab` «Atajos» after «Dispositivo»: rows for the four panel shortcuts (saved in `prefs.shortcuts`, «Restablecer» deletes the entry), the dictation row (hub setting, «vale para todos tus dispositivos», a clash line when a panel shortcut uses the same combination), and the three number families as fixed rows.
  - Done: `ShortcutSettings`.
- [x] 5.5 In «Dictado», replace the shortcut block with a line naming the shortcut and a button that opens «Atajos».
  - Done: a line with the shortcut and «Cambiarlo en Atajos».
- [x] 5.6 Run `pnpm --filter web typecheck`; verify it passes.
  - `pnpm --filter web typecheck` passes.
- [x] 5.7 Check by hand against an isolated hub (own port, `dataDir`, `HOME`, `TMUX_TMPDIR` and tmux socket, no `TMUX`) with the vite dev server, on a wide screen as Linux and as a Mac (platform overridden through CDP), dark and light, and on a phone width: the default quick note shortcut opens the dialog over the terminal; Alt+4 and Enter add the note to orange with its window line, show orange and give the focus back to the terminal; Tab and the arrows choose a colour; Shift+Enter, Escape, an empty text and a full scratchpad behave as the spec says; ⌥N then N types «ñ» on the Mac; Ctrl+Shift+K opens the search on Linux; «Atajos» changes, refuses a clash and a typing combination, cancels with Escape and restores; while waiting no shortcut acts; a changed fold shortcut works and the buttons' titles name it; the dictation row changes the hub setting and «Dictado» links to «Atajos».
  - Checked against an isolated hub (port 7693, own dataDir, HOME, TMUX_TMPDIR and socket) with vite. Linux: Ctrl+Alt+N opens the dialog over the terminal with the text focused and blue chosen; Alt+4 + Enter adds to orange with the window line (@1), shows orange and gives the focus back to the terminal; Tab and the arrows choose a colour and Enter on it saves; Shift+Enter new line; Escape closes without saving; empty Enter keeps it open; full green shows the reason and keeps the text; Ctrl+Shift+K opens the search. «Atajos»: clashes refused («ya es «Plegar la lista».», «ya es «Dictado».»), Shift+N refused, the current shortcut does nothing while waiting, Ctrl+Shift+U / Ctrl+Shift+J work, Escape cancels, «Restablecer» restores, the dictation change reaches settings.json and the unfold title names Ctrl+Shift+J. Mac (platform overridden): «Atajos» shows ⌘K ⌘B ⌘. ⌃⌥N ⌃⇧Espacio; ⌥N is not captured (reaches the terminal); ⌃⌥N opens, ⌥5 chooses purple, saved. Phone width: the sheet opens with the text typed. Dark and light screenshots look right. «Dictado» links to «Atajos» only while dictation is on (off in the test hub; the block is unchanged code).

## 6. Checks

- [x] 6.1 Run the step 4 commands of every touched layer: `pnpm --filter server test`, `pnpm --filter server typecheck`, `pnpm --filter web typecheck`, and `ka features-check`; verify each passes.
  - server test: 296 pass; server typecheck and web typecheck pass; ka features-check exit 0.

## 7. Documentation and changelog

- [x] 7.1 Add a changelog entry with `/koalarnes:changelog` (type `added`, scope `web`, Issue #36).
  - Entry changelogs/unreleased/20261116T222046370-feature-36-…json (added, web, Issue #36).
- [x] 7.2 Run `/koalarnes:update-docs`: the README paragraphs on dictation and scratchpads (the shortcut moves to «Atajos»; the quick note; ⌘. now configurable) and `docs/dev-standards/web-standards.md` (the shared shortcut logic in `shared/shortcuts.ts`, and a new configurable shortcut as one entry of `PANEL_SHORTCUTS`); apply what it proposes after review.
  - Owner approved: README (dictation shortcut in Ajustes › Atajos, quick note sentence, Ctrl+Shift+., new «Atajos de teclado a tu gusto» bullet) and web-standards (shared shortcuts.ts in Testing, new workflow «A new configurable shortcut»).

## 8. Feature catalogue

- [x] 8.1 Sync the specs to `openspec/specs/` with `/opsx:sync`, then run `/koalarnes:update-features quick-note-shortcuts`, review and apply: two new sections and the changed «Columna lateral en pantallas anchas» in «Scratchpads», and a new area «Atajos» with one section per requirement of `keyboard-shortcuts`.
  - Specs synced to openspec/specs/ (scratchpads: 2 ADDED, 1 MODIFIED; new keyboard-shortcuts spec). Owner approved the catalogue: two sections and the changed «Columna lateral» in Scratchpads, new area «Atajos» with six sections and its index line.
- [x] 8.2 Run `ka features-check`; verify the exit code is 0.
  - ka features-check: 39 sections verified, exit 0.
- [x] 8.3 Commit the catalogue sync with `/koalarnes:commit` before the human review.
  - Committed with the implementation, before the human review.

## 9. E2E pipeline

- [x] 9.1 The project has no E2E suite; this step does not apply. Record it here.
  - The project has no E2E suite; this step does not apply.

## 10. Human review

- [ ] 10.1 Another developer (the owner) reviews the pull request after `/koalarnes:review-pr` comes back clean; findings go through the change-request steps until approval.

## 11. Before the archive

- [ ] 11.1 Run `ka features-check` as the last task before `/opsx:archive`; verify the exit code is 0.

## 12. Review round 1 (PR #37)

- [x] 12.1 Write failing tests in `server/src/shortcut.test.ts`: `shortcutRefusal` refuses a «Restablecer» whose default another shortcut took, a combination that would type and Alt+1…5 with their reasons, and accepts a free one; the defaults of each kind of device clash neither with each other nor with the dictation's, and all are valid; `dictationShortcutOf` gives the saved combination, and the default for a missing or invalid one. See them fail.
  - Seen failing (missing exports PANEL_SHORTCUT_IDS, shortcutRefusal, dictationShortcutOf).
- [x] 12.2 `shared/shortcuts.ts`: `shortcutRefusal`, the Alt+1…5 rule in `shortcutProblem`, `PANEL_SHORTCUT_IDS` and `PANEL_SHORTCUTS` as a `Record`; `shared/dictation.ts`: `dictationShortcutOf`. Verify 12.1 passes.
  - Done; shortcut.test.ts 12 of 12 pass.
- [x] 12.3 `ShortcutSettings.tsx`: the recorder and «Restablecer» use `shortcutRefusal`, a refused «Restablecer» says why under its row, and the listener depends only on `listening`. Move `shortcutFromEvent` and the formatting wrapper (`shortcutText`) to `web/src/shortcuts.ts`, and use `dictationShortcutOf` in `web/src/dictation.ts`, `ShortcutSettings.tsx` and `Settings.tsx`.
  - Done: ShortcutRow uses shortcutRefusal for both, a refused «Restablecer» says why under the row, the listener depends on listening only (taken and onChange from a ref); shortcutFromEvent and shortcutText live in web/src/shortcuts.ts; dictationShortcutOf in dictation.ts, ShortcutSettings.tsx and Settings.tsx.
- [x] 12.4 The quick note shortcut closes the search before opening the dialog; the dialog closes and gives the focus back once; its colour dots and digits are `aria-hidden`; `Sheet` moves to `web/src/components/Sheet.tsx` and every importer follows; the comments that still say «Ajustes → Dictado» or a fixed Cmd+K/Cmd+B are corrected.
  - Done: the quick note closes the search; done() runs once; colour dots and numbers aria-hidden; Sheet in web/src/components/Sheet.tsx with its eight importers; stale comments in WindowView.tsx, state.ts, Palette.tsx and styles.css corrected; double blank line in Settings.tsx removed. Web and server typecheck pass.
- [x] 12.5 Run the step 4 commands and `openspec validate quick-note-shortcuts --strict`; check by hand against the isolated hub: a refused «Restablecer», the quick note over the search, Alt+2 refused, and a hub broadcast while a row waits.
  - server test 300 pass; server and web typecheck pass; openspec validate --strict valid. By hand (Mac emulated, isolated hub, dark and light): «Restablecer» on fold the list refused while the quick note holds ⌘B, the reason goes once ⌘B is free; Alt+2 refused with its reason; a hub broadcast (dictationTimeout 20 from another connection) leaves the row waiting and ⇧⌘U is then taken; the quick note from the search closes it, focuses the text, and Escape gives the focus to the terminal.
- [x] 12.6 Sync the corrected specs to `openspec/specs/` (the ⇧⌘U scenario, the refusals and the quick note from the search) and update the catalogue sections they change, with the owner's approval; `ka features-check` exits 0.
  - Specs synced (⇧⌘U, Alt+1…5 and «Restablecer» refusals, the quick note from the search); owner approved the catalogue changes to «Nota rápida desde el teclado» and «Combinaciones que se rechazan»; ka features-check exit 0.

## Workflow follow-up

- After approval: `/opsx:archive quick-note-shortcuts`, then `/koalarnes:commit` to push the archive into the same pull request.
- Merge only on the owner's yes; while the `deploy` workflow stays disabled at the owner's request, say the merge deploys nothing.
- Once merged, propose closing Issue #36 and removing the worktree, in one `AskUserQuestion` call.
