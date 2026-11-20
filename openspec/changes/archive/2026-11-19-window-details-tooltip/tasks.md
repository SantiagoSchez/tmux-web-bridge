# Tasks

## 1. Branch (mandatory step 1)

- [x] 1.1 Create the branch `feature/57-tooltip-ventana-y-nombre-desde-trello` (Issue #57's title, shortened to fit 64 characters) from `origin/master` in its own worktree with `/ka:git-worktree create`; verify with `git branch --show-current`.
  - Created; `git branch --show-current` prints the branch, based on `dcb302c`.

## 2. Review the existing tests (mandatory step 2)

- [x] 2.1 Read the tests of every module the change touches and output one line per module: `server/src/tasks.ts` (`server/src/ext.test.ts`: the `launchTask` cases pin the typed command through `keys()`; confirm the cases without a card stay valid), `server/src/trello.ts` (`server/src/trello.test.ts`: the `afterLaunch` cases pass a card id, which D7 replaces with a `TrelloCard`), `shared/folders.ts` (`homePath`, reused, not changed), and the `web` components (`Tree.tsx`, `Rail.tsx`, `App.tsx`: no tests, `web` has no runner).
  - `server/src/tasks.ts` (`server/src/ext.test.ts`): tests up to date; the `launchTask` cases launch without a card and pin today's typed command, which stays. Tests added in this change (5.1).
  - `server/src/trello.ts` (`server/src/trello.test.ts`): tests updated in this change (5.3): the two `afterLaunch` cases pass an id, which becomes a `CardRead`; no case covered a card that cannot be read, so one is added.
  - `shared/folders.ts`: `homePath` has no test of its own; it is reused unchanged, and 3.1 covers it through a folder under the home shown with `~`.
  - `web/src/components/Tree.tsx`, `Rail.tsx`, `App.tsx`: no tests (`web` has no runner); their new logic goes to `shared/` with tests (3.1, 3.3).

## 3. Window details model and placement in `shared/` (design D3, D4)

- [x] 3.1 Write `server/src/window-details.test.ts` first, failing: a single-pane Claude window in a worktree gives its name, the state (icon, label, `since`), the command, the worktree, the folder shortened with `~` and the account, and no active mark; a two-pane window lists both panes in order with the active one marked, one with a branch and one outside a repository (no place); a window with no state, no git and no account gives none of those fields; the host name shows only when asked; `spaceDetails` gives the full name and the window count. Run `pnpm --filter server test` and see it fail because the module does not exist.
  - Six cases; failed with `ERR_MODULE_NOT_FOUND` for `shared/window-details.js`. Once implemented, removing the «only with several panes» rule fails two of them.
- [x] 3.2 Move `STATE_LABEL` from `web/src/state.ts` to `shared/` (re-exported from `state.ts`, every import still compiling), and write `shared/window-details.ts` (`windowDetails`, `spaceDetails`) with the types of `shared/types.ts` (`WindowInfo`, `SessionInfo`, `PaneInfo`). Verify with `pnpm --filter server test` (3.1 passes) and `pnpm --filter web typecheck`.
  - `STATE_LABEL` lives in `shared/window-details.ts`; `web/src/state.ts` re-exports it, so its five importers are unchanged. Server tests: 333 pass; server and web typecheck pass.
- [x] 3.3 Write `server/src/tip-position.test.ts` first, failing: a tip that fits goes 8 px right of the anchor, aligned with its top; one that does not fit on the right goes to the left; one near the bottom is moved up to stay 8 px inside; one taller than the screen starts at 8 px. Then write `shared/tip-position.ts` (`tipPosition(anchor, size, viewport)`) and see the test pass with `pnpm --filter server test`.
  - Five cases (right, left, clamped on the right, moved up, taller than the screen); failed with `ERR_MODULE_NOT_FOUND`, then 338 pass.

## 4. The hover tooltip in the panel (design D1, D2, D5, D6)

The `web` layer has no test runner: its logic is covered by group 3, and the components are checked by hand in a browser against a hub with its own `TMUX_TMPDIR` and no `TMUX`/`TMUX_PANE` (never the real tmux server).

- [x] 4.1 Write `web/src/components/HoverTip.tsx`: the `hoverTip` signal, `useHoverTip(key, render)` (1000 ms timer, only for `pointerType === 'mouse'`, cleared on leave and on unmount), and `HoverTip` (hidden render, measure in `useLayoutEffect`, place with `tipPosition`, close on capture `pointerdown`, Escape, capture `scroll`, `resize`, and when its render finds nothing). Mount it once in `App.tsx`. Add its styles to `web/src/styles.css` with the `:root` custom properties (`position: fixed`, `pointer-events: none`, `max-width`, `overflow-wrap: anywhere`, both themes). Verify with `pnpm --filter web typecheck`.
  - `HoverTip.tsx` also closes on the window's `blur`; it tells the mouse by `pointerType` alone (headless Chrome reports no `any-hover`, and the input is what matters). Mounted in `Overlays` of `App.tsx`; `.hover-tip` styles use only `:root` properties. `pnpm --filter web typecheck` passes.
- [x] 4.2 Write the window details view (rendering `windowDetails`) and the space details view (rendering `spaceDetails`), and attach `useHoverTip` to `WindowRow`'s `li.win-row`, `SoloSession`'s row (space name above the window's details), `SessionGroup`'s `.session-head` and the rail's pane buttons (that pane marked). Remove the native `title`s of `WhereLine`, of the rail's pane buttons and of the session toggle, keeping every `aria-label`. Verify with `pnpm --filter web typecheck`.
  - `windowTip` and `spaceTip` in `HoverTip.tsx`. `SessionBlock` calls its hook before the solo branch (a space can gain or lose its second window); the rail's buttons became `RailItem` so each can use the hook. `pnpm --filter web typecheck` passes.
- [x] 4.3 Check by hand in a browser (Vite against an isolated hub with a `local` machine, a long window name, a worktree, a two-pane window, and a phone-sized viewport with touch emulation) every scenario of `specs/window-details/spec.md`: the 1 s delay and nothing on a quick pass; full name, worktree, folder and account; both panes with the active one marked; no empty lines; live update of the state; closing when the window closes, on leave, click (the window still opens), Escape and scroll; a row at the bottom stays inside the screen; the solo space, the space header and the rail; only one tooltip over the branch; none on touch. Record what was checked here.
  - Checked on 2026-11-19 with headless Chrome (agent-browser) against an isolated hub (port 7691, its own `TMUX_TMPDIR`, a relative `tmux -S` socket, no `TMUX`/`TMUX_PANE`) and Vite on port 5257, with a git repository with three worktrees, a two-pane window and a solo space with a long name:
    - Nothing at 0.5 s, the tooltip at 1.3 s; name, 🙋 «Pregunta», `zsh`, the worktree, the folder and `ana@example.com`, all whole.
    - Two panes: «Panel 0» with its worktree and folder, «Panel 1 … activo» with its folder only, no empty lines.
    - Changing `@win_state` to `done` with the tooltip open: it showed «✅ Terminado · ahora» by itself. Killing the window with its tooltip open closed it (the row moving up under the mouse then opened its own after 1 s, as expected).
    - Closes on leave, Escape, a click (the window opened: `#/h/local/w/2`) and a scroll of the list. The tool's `mouse wheel` did not scroll the list (its `scrollTop` stayed 0), so the scroll was made from the page.
    - At 520 px high, the tooltip of a low row moved up to stay inside the screen.
    - The solo space shows its full name above its window's details; the header shows «shop-platform» and «4 ventanas»; the folded list's button shows its window's details with its pane highlighted and has no `title`.
    - No `title` left in `.win-where` or on `.session-toggle`.
    - A `pointerenter` with `pointerType: 'touch'` opens nothing after 1.3 s; the same with `'mouse'` opens it. Headless Chrome reports no `any-hover`, which is why the check is on `pointerType` alone.

- [x] 4.4 Fix review finding R1-01 (design D5): register the tip's Escape listener in the capture phase, without stopping the key, so Escape closes the tip while the terminal has the focus. Verify with `pnpm --filter web typecheck` and by hand: with a window open and the terminal focused, rest the mouse on a row, press Escape, see the tip close and the Escape reach the pane; and see that before the fix the tip stays open.
  - `keydown` is registered (and removed) with `capture: true` in `HoverTip.tsx`; `pnpm --filter web typecheck` passes. Checked on the isolated hub with window «shell» running `cat -v` and the terminal focused (`xterm-helper-textarea`): resting on another row opened its tip; Escape closed it and `cat -v` printed `^[`. With the listener back in the bubble phase, the same Escape left the tip open; restored.
  - Found while checking it: a click on a row brought that row's tip up a second later (the click closed open tips but not the one still waiting). Same requirement (the tip closes on a click), so fixed here: the hook's `onPointerDown` cancels the wait (design D5). Clicking «shell» then left no tip after 1.6 s.

## 5. Card launches rename their window (design D7, D8)

- [x] 5.1 Add failing cases to `server/src/ext.test.ts`: `launchTask` with `opts.card` resolving to a card types the instruction (with the card's title quoted, «30 caracteres», `tmux rename-window -t "$TMUX_PANE"`) followed by a blank line and the prompt; with an empty prompt and a worktree, the instruction alone; a title with a newline and over 200 characters arrives on one line and cut; `opts.card` resolving to `null`, or no `opts`, types the prompt alone (the pinned command line of today); the window is still created with the requested name and pinned. Run `pnpm --filter server test` and see the new cases fail.
  - Five cases: the instruction pinned word for word (a deliberate pin of the prompt); a title with control characters on one line and a 500-character one cut to 200 with «…»; `withCardRename` puts the instruction before the prompt, alone with an empty prompt, and nothing without a card (the empty-prompt case is tested on this pure function rather than through a worktree launch); a launch with a card types, decoded by bash, exactly that text, in a window named and pinned as before; a card read as `null`, no card or no `opts` types today's command. Failed with «does not provide an export named 'cardRenameInstruction'».
- [x] 5.2 Implement `cardRenameInstruction(title)` and the optional third argument `opts: { card?: Promise<TrelloCard | null> }` of `launchTask` in `server/src/tasks.ts`, awaited just before typing the command. Verify with `pnpm --filter server test` (5.1 passes).
  - Also `withCardRename(prompt, title)`. 343 pass and the typecheck passes; typing the prompt alone again fails the launch case.
- [x] 5.3 Add `TrelloService.readCard(id)` (`{ card } | { error }`, never rejects) and change `afterLaunch` to take that read instead of the id. Update `server/src/trello.test.ts` first: its cases pass `await t.readCard(CARD)`, and a new case checks that a read Trello refuses gives `{ error }` and that `afterLaunch` with it returns only the warning «No se pudo leer la tarjeta», making no call; see them fail before the change. Verify with `pnpm --filter server test`.
  - `CardRead` is exported from `server/src/trello.ts` (internal to the hub, not in `shared/types.ts`). The three cases failed before the change; a `readCard` that rethrows fails the new one. 344 pass.
- [x] 5.4 In `launchFromRequest` (`server/src/index.ts`), start `trello.readCard(id)` without awaiting it when the request has a card; pass `launchTask` that read mapped to its card or `null`; then call `afterLaunch` with the read. Audit every caller of `launchTask` (`launchFromRequest`, the automations' `launch`, the panel's `launchTask` op) and of `afterLaunch`, and confirm only `launchFromRequest` passes a card. Verify with `pnpm --filter server typecheck` and `pnpm --filter server test`.
  - Audit: `launchTask` is called by `launchFromRequest` (`index.ts`, with the card), the automations' `launch` (line 377) and the panel's `launchTask` op (line 464), neither with a card; `afterLaunch` only by `launchFromRequest`. `readCard` never rejects, so a launch that throws leaves no unhandled rejection. Typecheck passes; 344 pass.
- [x] 5.5 Boot smoke test (the composition root changes): start the hub in development with its own `TMUX_TMPDIR`, no `TMUX`/`TMUX_PANE` and a temporary `dataDir`, wait for its listening log line, stop it. Record the line here.
  - With the changed `index.ts`: «tmux-web-bridge escuchando en http://127.0.0.1:7691 (1 máquinas, config …/t57/config.yaml)». Stopped by its port after 5.6.
- [x] 5.6 Check by hand, on an isolated hub with a `local` machine and a fake `claude` command that prints its arguments: a launch on a card from the panel's Trello drawer (or `curl` to `/api/trello/launch` with a card id against the real Trello account) types the instruction with the card's title and then the prompt; the window keeps its launch name and stays pinned; running the instruction's command from that pane renames the window and the kit does not undo it. Record what was checked here.
  - Trello was answered by a module preloaded into the isolated hub (`tsx --import`), never the real API or the owner's account. `POST /api/trello/launch` with the card: one `GET` of the card, then the lists, the `PUT` to Doing and the comment; the result had `movedTo: "Doing"`, `commented: true`, no warnings, and `windowName` «feat/481-permitir-reintentar».
  - The fake `claude` got `--permission-mode auto` and, as one argument, the instruction with «Permitir reintentar las subidas de vídeo que fallan por timeout», a blank line and «Haz la tarjeta https://trello.com/c/aB3dE6fG». The window had `@name_pinned 1`.
  - Typed in that pane while another window was current, `tmux rename-window -t "$TMUX_PANE" 'Reintentar subidas fallidas'` renamed that window, not the current one (it had to run from the socket's folder: the test socket is relative, a real `$TMUX` is absolute). The kit's `refresh` kept the name and the pin, and the panel listed «Reintentar subidas fallidas».
  - Traps of the test setup, not of the change: the fake home needed a `.zshrc` (zsh's first-run menu ate a character), and the login shell rebuilt `PATH`, so the first relaunch started the real `claude`, which stopped at its first-run theme screen with no account and was closed at once; the fake `claude` was then put first in the `PATH` from that `.zshrc`.

## 6. Tests, typecheck and lint (mandatory step 4)

- [x] 6.1 Run `pnpm --filter server test`, `pnpm --filter server typecheck` and `pnpm --filter web typecheck`, and see them pass. `trello-extension` and `host-kit` are not touched: report them as not applicable.
  - Server tests: 344 pass, 0 fail. Server and web typecheck: exit 0. `trello-extension` and `host-kit`: not applicable (not touched).
- [x] 6.2 Run `ka scope` and the project checks it lists (`ka features-check`, `ka docs-check`); report the ones that do not apply. Run `openspec validate --strict window-details-tooltip`.
  - `ka scope`: both checks apply, no E2E suite. `ka features-check`: exit 0, 56 sections verified and the 10 new requirements pending for step 6 (8.1). `ka docs-check`: no dead reference. `openspec validate --strict`: valid.

## 7. Documentation and changelog (mandatory step 5)

- [x] 7.1 Run `/ka:update-docs`: two flows visible to the owner change (the list's tooltip, the card task's first step). Check whether `docs/dev-standards/web-standards.md` needs the hover-tooltip pattern (a row that cuts text uses `useHoverTip`, not a native `title`) and whether the README's description of the Trello launch needs a line; verify with `ka docs-check`.
  - `docs/dev-standards/web-standards.md` (Conventions): a row that cuts text uses `useHoverTip` of `HoverTip.tsx`, never a native `title`; (Testing): `window-details.ts` and `tip-position.ts` added to the `shared/` modules tested from `server/`.
  - `README.md`: a «Detalles al pasar el ratón» bullet under «Todas tus máquinas en un solo panel»; «Tareas desde Trello» says the agent first renames its window and how to allow `tmux rename-window`; the `POST /api/ext/launch` row says what `card` adds to the prompt and the warning when the card cannot be read. No line described the removed native titles. `ka docs-check`: no dead reference.
- [x] 7.2 Add a changelog entry with `/ka:changelog` (es-ES, `added`, Issue #57), saying that without «Saltar permisos» Claude asks once before running `tmux rename-window`; verify the JSON file under `changelogs/unreleased/`.
  - Two entries, one per user-visible change, both `added` with Issue 57: `20261119T190807351-…json` (`web`, the hover details) and `20261119T190808915-…json` (`server`, the card window rename and the permission). `--pr` is added by `/ka:commit` when it opens the pull request.

## 8. Feature catalogue (mandatory step 6, after the review loop's gate passes)

- [x] 8.1 Run `/ka:update-features window-details-tooltip` for the new requirements of `window-details` and `trello-card-launch`, then `ka features-check --strict` with exit code 0, and commit with `/ka:commit`.

## 9. E2E pipeline (mandatory step 7)

- [x] 9.1 The project has no E2E suite; this step does not apply. Record it here.
  - Not applicable: `ka scope` reports «the project has no E2E suite».

## 10. Human review (mandatory step 8)

- [x] 10.1 Ask the owner with `AskUserQuestion` who reviews the pull request (a person, or the owner takes it as good) and record the answer here; do not archive before the approval or that answer.
  - The owner takes PR #58 as good, without a manual review (2026-11-19).

## 11. features-check before the archive (mandatory step 9)

- [x] 11.1 Run `ka features-check --strict` as the last task before `/opsx:archive`; the exit code must be 0.
  - Exit code 0: 66 sections verified.

## Workflow follow-up

- Between groups 7 and 8: `/opsx:verify`, `/ka:commit` with the pull request, and the bounded review loop (`/ka:review-pr`, `ka review-rounds record`, `ka review-rounds gate`). No adversarial review: no payload or migration changes, and the wiring change in `launchFromRequest` is covered by the boot smoke test and the caller audit.
- After the approval: `/opsx:archive`, `/ka:commit`, check the pull request's head against `git rev-parse HEAD`, merge with `gh pr merge --squash --match-head-commit <sha>`, follow the `deploy` run with `gh run watch`, and propose the release.
- Ask in one `AskUserQuestion` whether to comment on Issue #57 with the pull request's link (es-ES) and close it, and whether to remove the worktree with `/ka:git-worktree remove`.
