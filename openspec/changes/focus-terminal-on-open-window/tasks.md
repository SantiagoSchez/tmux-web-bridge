# Tasks

## 1. Branch (mandatory step 1)

- [x] 1.1 Create the branch `feature/48-enfocar-el-terminal-al-abrir-un-espacio-o-una-ventana` from `origin/master` in its own worktree with `/ka:git-worktree create`; verify with `git branch --show-current`.

## 2. Review the existing tests (mandatory step 2)

- [x] 2.1 Confirm that no test covers the modules this change touches (`web/src/router.ts`, `web/src/state.ts`, `web/src/components/TerminalView.tsx`): `web` has no test runner, and no `server/src/*.test.ts` imports them. Output one line per module ("no tests; checked by hand in group 3").
  - `web/src/router.ts`: no tests; checked by hand in group 3.
  - `web/src/state.ts`: no tests; checked by hand in group 3.
  - `web/src/components/TerminalView.tsx`: no tests; checked by hand in group 3 (`dictation.test.ts` and `files.test.ts` only quote its path as sample text).

## 3. Focus the terminal when a window opens (mandatory step 3)

The panel has no test runner (see `docs/dev-standards/web-standards.md`, Testing), so each behaviour is checked in a browser against an isolated hub: its own `TMUX_TMPDIR`, no `TMUX`/`TMUX_PANE`, a `local` machine with a test tmux server on its own `-L` socket, and the `vite` dev server proxying to it. The check is run first on the unchanged code and seen failing, then again after the change.

- [x] 3.1 Start the isolated hub and the panel with two spaces («demo» with windows «claude» and «shell», «backend» with window «api»). On a wide viewport with a mouse, record the failing behaviour on the unchanged code: after clicking «shell» of «demo» in the list, and after clicking the window already open, `document.activeElement` is the list's button, not xterm's textarea, and a typed key does not reach the pane.
  - Seen failing: after «claude» → «shell» of «demo», and after a second click on «shell», `document.activeElement` is `BUTTON.win`; a `z` pressed then lands on that button and the pane of «shell» does not get it. «api» of «backend» (another space) already gets the focus today, from `createTerminal()`.
- [x] 3.2 Widen `terminalFocus` in `web/src/state.ts` to `{ pane: string | null; at: number } | null`, with its doc comment saying that `null` asks for the terminal shown when a window opens (design D2); verify with `pnpm --filter web typecheck`.
- [x] 3.3 In `web/src/components/TerminalView.tsx`, add one helper that focuses the terminal on a computer unless an element with `aria-modal="true"` is in the document (design D4), and use it for the focus at the end of `createTerminal()` and for `terminalFocus` requests with `pane === null`; requests with a pane id keep today's check. Verify with `pnpm --filter web typecheck`.
- [x] 3.4 In `openWindow` of `web/src/router.ts`, set `terminalFocus.value = { pane: null, at: Date.now() }` on every call, including the one whose hash is already the target (design D1); verify with `pnpm --filter web typecheck`.
- [x] 3.5 Repeat the check of 3.1 on the changed code and see it pass for every scenario of `specs/terminal-focus/spec.md`: another window of the same space, a window of another space, the search, the window already open (the terminal keeps its content), a window opening while «Ajustes» is open (the focus stays in «Ajustes»), and, on a phone-sized touch viewport, a tap on a window that leaves the on-screen keyboard hidden (the input proxy does not get the focus). Also check that a scratchpad paste still focuses the terminal. Stop the hub, the dev server and the test tmux server afterwards.
  - Seen passing, with a real key press after each step: «claude» → «shell» of «demo» (xterm's textarea has the focus, `x` reaches «shell»); a click on «shell» again with the focus on another button of the list (`y` reaches it); «api» of «backend» (`z` reaches it); ⌃⇧K, «shell», Enter (`w` reaches it); `openWindow` called with «Ajustes» open and the focus on one of its controls, for `@0` (same space) and `@2` (another space): the focus stays in «Ajustes»; touch emulation (`maxTouchPoints` 5, `pointer: coarse`) at 412×915, a tap on «shell»: the focus is on `BODY`, neither xterm nor the input proxy; «Pegar en el panel» of a blue note: the terminal has the focus and the note is in the pane. Hub, Vite and the test tmux server stopped.
- [x] 3.6 Review finding R1-02 of PR #49. Split window «shell» of «demo» of the isolated hub, open its second pane, move the focus to a button of the list and press the window's number shortcut: on the code of 3.4 the focus stays on the button (seen failing).
  - The test tmux numbers windows from 0, so «shell» is window 1 and its shortcut Ctrl+1. Seen failing with `web/src/shortcuts.ts` of the previous commit: after Ctrl+1 on `#/h/local/w/1/p/3`, the focus stays on «Nueva ventana en demo» and a `k` reaches neither pane.
- [x] 3.7 In `bindShortcuts` of `web/src/shortcuts.ts`, call `openWindow` for the window already open too, passing the route's pane (design D1); verify with `pnpm --filter web typecheck`.
- [x] 3.8 Repeat 3.6 and see it pass: the terminal has the focus, the second pane stays selected (the route keeps `/p/<pane>`) and a key pressed reaches that pane; the number shortcut of another window still moves to it. Update the section «Volver al terminal con un clic en su ventana» of `docs/FEATURES.md` for the number shortcut and run `ka features-check --strict`. Stop the hub, Vite and the test tmux server afterwards.
  - Seen passing: Ctrl+1 on `#/h/local/w/1/p/3` gives xterm's textarea the focus, the route stays `#/h/local/w/1/p/3`, the second pane tab stays selected and a `k` reaches `%3`, not `%1`. Ctrl+1 from `#/h/local/w/0` moves to `#/h/local/w/1` with the terminal focused. Catalogue section updated; `ka features-check --strict`, `ka docs-check`, `pnpm --filter web typecheck` and `openspec validate --strict` pass. Hub, Vite and the test tmux server stopped.

## 4. Tests, typecheck and lint (mandatory step 4)

- [x] 4.1 Run `pnpm --filter web typecheck` and see it pass (the only check of the `web` layer).
- [x] 4.2 Run `ka scope` and the project checks it lists: `ka features-check` and `ka docs-check` must pass; report the ones that do not apply.

## 5. Documentation and changelog (mandatory step 5)

- [x] 5.1 Run `/ka:update-docs`: add to the Conventions of `docs/dev-standards/web-standards.md` that a window is opened through `openWindow()`, which hands the terminal the focus on a computer (unless a `Sheet` is open), so a new place that opens a window gets it without its own `focus()`; verify with `ka docs-check`.
- [x] 5.2 Add a changelog entry with `/ka:changelog` (es-ES, a flow the user sees); verify the JSON file under `changelogs/unreleased/`.

## 6. Feature catalogue (mandatory step 6, after the review loop's gate passes)

- [x] 6.1 Run `/ka:update-features focus-terminal-on-open-window` for the new `terminal-focus` capability, then `ka features-check --strict` with exit code 0, and commit with `/ka:commit`.

## 7. E2E pipeline (mandatory step 7)

- [x] 7.1 The project has no E2E suite; this step does not apply. Record it here.

## 8. Human review (mandatory step 8)

- [ ] 8.1 Ask the owner with `AskUserQuestion` who reviews the pull request (a person, or the owner takes it as good) and record the answer here; do not archive before the approval or that answer.

## 9. features-check before the archive (mandatory step 9)

- [ ] 9.1 Run `ka features-check --strict` as the last task before `/opsx:archive`; the exit code must be 0.

## Workflow follow-up

- Between groups 5 and 6: `/opsx:verify`, `/ka:commit` with the pull request, and the bounded review loop (`/ka:review-pr`, `ka review-rounds record`, `ka review-rounds gate`).
- After the approval: `/opsx:archive`, `/ka:commit`, check the pull request's head against `git rev-parse HEAD`, merge with `gh pr merge --squash --match-head-commit <sha>`, follow the `deploy` run with `gh run watch`, and propose the release.
- Ask in one `AskUserQuestion` whether to comment on Issue #48 with the pull request's link (es-ES) and close it, and whether to remove the worktree with `/ka:git-worktree remove`.
