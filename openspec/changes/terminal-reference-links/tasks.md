# Tasks

## 1. Branch

- [x] 1.1 Create `feature/12-enlaces-a-trello-pr-issues-y-vista-previa-de-image` from `origin/master` in its own worktree with `/koalarnes:git-worktree create` (slug shortened to fit 64 characters); verify `git branch --show-current` prints it.

## 2. Review the existing tests

- [x] 2.1 Read `server/src/trello.test.ts` (TrelloService, which gains `cardUrl`) and confirm it still describes the intended behaviour; record "tests up to date" or "tests updated/added in this change".
  - `server/src/trello.ts`: tests up to date; `cardUrl` tests added in this change (5.1).
- [x] 2.2 Confirm the modules without tests that the change touches (`web/src/fileLinks.ts`, `web/src/components/TerminalView.tsx`) have their behaviour covered at the levels the standards set (route logic tested in its module, web checked by hand); record one line per module.
  - `web/src/fileLinks.ts`: no tests by the web standards; its detection (`shared/paths.ts`) is tested in `server/src/files.test.ts`, up to date and not touched.
  - `web/src/components/TerminalView.tsx`: no tests by the web standards; checked by hand in 7.3.

## 3. Shared types and pure detection

- [x] 3.1 Add `RefRepo`, `RefContext`, `TrelloCardUrl` and `ClaudeImageResult` to `shared/types.ts` with JSDoc (design D6); verify `pnpm --filter server typecheck` passes.
- [x] 3.2 Write failing tests in `server/src/refs.test.ts` for `findRefs(text)` of `shared/refs.ts`: `PR #N`, `Issue #N`, `Trello #N`, `pipeline #N` in any case with their ranges, `[Image #N]`, and no match for `SPR #12`, `reissue #3`, `PR#12`, `PR #` and `#12` alone; see them fail.
- [x] 3.3 Implement `findRefs` until 3.2 passes (`pnpm --filter server test`).
- [x] 3.4 Write failing tests for `parseRemote(url)` (GitHub and Bitbucket over `git@`, `ssh://`, `https://` with and without user and `.git`; other hosts and garbage give nothing) and for `refUrl(ref, repo)` (the URLs of the spec's scenarios; `pipeline` on GitHub gives nothing); see them fail, implement in `shared/refs.ts`, and verify they pass.

## 4. Project context endpoint

- [x] 4.1 Write a failing test in `server/src/project-refs.test.ts` that runs the context script for real with `/bin/sh` in a temporary git repository (explicit `{ PATH, HOME }` env, git local variables stripped) through a fake host, covering: koalarnes.json with GitHub repository and Trello board, koalarnes.json winning over `origin`, `origin` fallback for Bitbucket, a folder outside git, a malformed koalarnes.json; see it fail.
- [x] 4.2 Implement `contextScript(path)` and `parseContext(out): RefContext` in `server/src/project-refs.ts` (design D2, shell values quoted with `shQuote`/`shPath`, output tagged `K`/`O`) until 4.1 passes.
- [x] 4.3 Add `GET /api/refs/context?host&window&pane` to `server/src/index.ts` under the HTTP API section (folder from `paneFolders`, 400 on unknown machine or folder, 502 when the machine fails); verify with `curl` against a dev hub with an isolated `TMUX_TMPDIR` on a pane in this repository and on one outside git.

## 5. Trello card lookup

- [x] 5.1 Write a failing test in `server/src/trello.test.ts` for `TrelloService.cardUrl(board, n)` with the injected fake `fetch` answering like the real API: the card's `shortUrl`, a 404 as a Spanish «no encuentro la tarjeta» error, a malformed board or number rejected before any request, and `TrelloSetupError` without credentials; see it fail.
- [x] 5.2 Implement `cardUrl` (design D3) until 5.1 passes.
- [x] 5.3 Verify with one real read-only call with the owner's Trello account that `GET /1/boards/{board}/cards/{idShort}` accepts the short number; if it does not, switch `cardUrl` to the fallback of D3, update 5.1's fake to the fallback's request, and record which one was kept in `design.md`.
  - Verified with the owner's account (the Trello credentials of the koalarnes MCP server) on board `0mGPkF10`: cards 1 and 12 answer 200 with their `shortUrl`, number 9999999 answers 404 «Could not find the card». The short-number route is kept.
- [x] 5.4 Add `GET /api/trello/card-url?board&n` to `server/src/index.ts` (answers `TrelloCardUrl`; 400 bad input, 404 no card, `setup: true` on `TrelloSetupError`, 502 on other Trello failures); verify with `curl` for a card, a missing card and bad input.
  - Checked against the dev hub: without an account 409 with `setup: true`; with the owner's account card 1 gives its URL (200), 9999999 gives «No encuentro la tarjeta 9999999 en el tablero del proyecto» (404), and a bad number or board 400. The setup error keeps the 409 of the other Trello routes (`trelloError`) instead of a new status.

## 6. Image placeholders on the hub

- [x] 6.1 Write a failing test in `server/src/claude-image.test.ts` that runs the lookup script for real with `/bin/sh` against a temporary folder standing for the machine's temporary directory (passed through `TMPDIR`, with `claude-<uid>/<cwd A>/<session>/images/` and `claude-<uid>/<cwd B>/<session>/images/`): it prints the newest `<N>.<ext>` across both folders, ignores another session's files, and prints nothing for an absent number; see it fail.
- [x] 6.2 Implement the script and its parsing in `server/src/claude-image.ts` (design D4; session id and N checked against their regexes before the script is built, values quoted with the `exec.ts` helpers) until 6.1 passes.
- 6.3 (moved by the owner to after the deploy, see «Workflow follow-up»): the Mac's temporary folder for Claude Code's images.
- [x] 6.4 Add `GET /api/claude-image?host&pane&n` to `server/src/index.ts` (pane id regex, 404 «No encuentro la imagen N» without a session or a file, 502 when the machine fails); verify with `curl` against a dev hub on a pane running Claude Code with a pasted image not sent yet, a sent one, and an absent number.
  - Checked with a simulated session (`@claude_session` set by hand and a file under `/tmp/claude-<uid>/<cwd>/<session>/images/1.png`): 200 with the path, 404 for an absent number and for a pane without a session, 404 for a gone pane, 400 for bad input; the path opens through `GET /api/files`. Claude Code's own files, sent and not, were checked earlier on this machine (see `design.md`).

## 7. Links in the panel's terminal

- [x] 7.1 Add `web/src/refLinks.ts` with `refLinkProvider` (uses `findRefs`, `refUrl` and a per host+folder `RefContext` cache of five minutes fetched with `api<RefContext>()`; returns no links until the context arrives) and `imageLinkProvider` (design D5); verify `pnpm --filter web typecheck` passes.
- [x] 7.2 Wire both providers in `web/src/components/TerminalView.tsx` next to `fileLinkProvider`: repository references open with `openLink`, `Trello #N` opens `about:blank` inside the gesture and then the card or closes with an error toast (setup hint when the hub says `setup`), `[Image #N]` asks `GET /api/claude-image` and calls `openFile` on click and `peekFile` on hover, with the same drag guard as file links; verify the typecheck passes.
- [x] 7.3 Check by hand in a browser against a dev hub (isolated `TMUX_TMPDIR`, no `TMUX`/`TMUX_PANE`) on a phone-sized viewport with touch emulation and on a wide one: every scenario of `specs/terminal-links/spec.md` that does not need a real Bitbucket repository, plus `PR #N` on a fake Bitbucket `origin`; record what was checked in the pull request.
  - Checked in headless Chrome against an isolated hub with four panes (this repository: GitHub via koalarnes.json; a Bitbucket repository with a Trello board in koalarnes.json; a GitHub repository with only `origin`; a folder outside git), at 1400×900 with the mouse and at 390×844 with touch taps: every reference opens the spec's URL, `pipeline #N` on GitHub and everything outside git stay unlinked, `Trello #N` without a board stays unlinked and with a board but no Trello account opens and closes the tab with the Ajustes › Trello toast, `[Image #1]` opens the viewer and `[Image #7]` shows «No encuentro la imagen 7».
  - Found and fixed: right after a page load the links of a row could stay missing while the mouse stayed on it (xterm keeps a row's first answer); the provider now waits for the project read (design D1).
  - The thumbnail on hover was not visible here, because headless Chrome reports no hover device and the panel then skips every preview: checked in 8.8. A real Trello card was checked afterwards (5.3); the Mac moved to after the deploy (6.3).

## 8. Findings of the first review of PR #13

- [x] 8.1 Write a failing test in `server/src/stale-cache.test.ts` for `StaleCache` of `shared/stale-cache.ts` with an injected clock: a fresh value answers at once without a load; an expired one still answers at once and starts one reload; a failed reload keeps the old value; a first failed load answers nothing and the next look loads again; see it fail, implement, and use it for the context cache of `web/src/refLinks.ts` (design D1).
  - Five tests; seen failing without the module and with two mutations (no reload on expiry, a failed reload dropping the value).
- [x] 8.2 Write a failing test in `server/src/panes.test.ts` for `paneAt(window, col, row)` of `shared/panes.ts`: the pane whose rectangle holds the cell in a window split side by side and one on top of the other, the active pane of a zoomed window, nothing on a border and nothing when the window is larger than the terminal; see it fail and implement it (design D7).
  - Six tests; seen failing without the module and with the zoom ignored (the zoomed test lists the active pane last so `find` cannot hit it by order).
- [x] 8.3 Add `left` and `top` (`pane_left`, `pane_top`) to `PaneInfo` in `shared/types.ts` and `server/src/host.ts`, and to the test fixtures that build a `PaneInfo`; verify the server typecheck.
- [x] 8.4 Pass the cell where each link starts from `fileLinkProvider`, `refLinkProvider` and `imageLinkProvider` to `TerminalView`, which resolves the pane under it with `paneAt` (falling back to the selected pane) for the file viewer, the project context and the image lookup (design D7); reuse `dragged()` for the file links and the URL links of `createTerminal()`.
- [x] 8.5 Declare `TRELLO_BOARD` in `server/src/trello.ts` and import it from `project-refs.ts`; write a failing test in `server/src/trello.test.ts` for a `shortUrl` that does not start with `https://trello.com/` (an error, no URL), see it fail, and make `cardUrl` check it (design D3).
  - The test fakes Trello answering `javascript:alert(1)` and `https://trello.com.example.org/c/x`; seen failing before the check.
- [x] 8.6 Show an error toast when the browser blocks the blank tab of `Trello #N`, without asking the hub (design D3).
- [x] 8.7 Ask the hub on hover over `[Image #N]` only with `(any-hover: hover)`, after the file previews' wait, and keep the path for a minute (design D4).
- [x] 8.8 Check by hand against a dev hub (isolated `TMUX_TMPDIR`, no `TMUX`/`TMUX_PANE`): the thumbnail on hover over `[Image #N]` with hover emulated; in a window split into two panes in different repositories and Claude Code sessions, a reference, an image placeholder and a relative file path of the pane that is not selected resolve against that pane; with the context cache's lifetime lowered, the first tap after it expires opens the page; with the tab blocked, the toast.
  - Checked in headless Chrome against an isolated hub with a window split side by side (left: Bitbucket repository with a Trello board and session A; right, selected: GitHub repository with session B), with a mouse at 1700×900: `PR #5` opens `workspace/left/pull-requests/5` on the left and `owner/right/pull/5` on the right; `[Image #1]` opens session A's image on the left and session B's on the right; `docs/notes.md` opens each pane's own file; `Trello #470` is linked only on the left. With `matchMedia` answering `(any-hover: hover)` (this Chrome ignores the CDP emulation of it), resting on `[Image #1]` shows the thumbnail of each pane's own image after one `GET /api/claude-image`, a second rest shows it again without asking, and crossing it fast asks nothing. With `window.open` returning null, `Trello #470` shows «El navegador ha bloqueado la pestaña de la tarjeta de Trello». With touch emulation and the context lifetime lowered to 8 s for the check (restored afterwards), the first tap on `PR #5` after it expired opened the page while the context was read again.
- [x] 8.9 Add `"pr": "13"` to the changelog entry, and a `fixed` entry for relative file paths of the pane that is not selected in a split window (they opened in the selected pane's folder).

## 9. Run tests, typecheck and lint

- [x] 9.1 Run `pnpm --filter server test` and `pnpm --filter server typecheck`; verify both pass.
  - 177 tests pass; typecheck clean.
- [x] 9.2 Run `pnpm --filter web typecheck`; verify it passes.
- [x] 9.3 Run `ka features-check`; verify it passes. (`trello-extension` and `host-kit` are not touched: their commands do not apply.)

## 10. Documentation and changelog

- [x] 10.1 Run `/koalarnes:update-docs` for the three new REST endpoints and the pattern of a link provider resolved ahead of the tap (server and web standards); apply the approved patches.
- [x] 10.2 Add a changelog entry with `/koalarnes:changelog` (user-visible flow and new endpoints, Spanish description, `web` and `server` scopes); verify the file exists under `changelogs/unreleased/`.

## 11. Feature catalogue

- [x] 11.1 Run `/koalarnes:update-features terminal-reference-links`, review and apply the update of `docs/FEATURES.md` with one anchored section per requirement of `terminal-links`.
  - New area «Terminal» with four sections; the spec was synced to `openspec/specs/terminal-links/` with `/opsx:sync` so the check can see the capability.
- [x] 11.2 Run `ka features-check`; verify the exit code is 0.
- [x] 11.3 Commit the catalogue sync with `/koalarnes:commit` before the human review.

## 12. E2E pipeline

- [x] 12.1 The project has no E2E suite; this step does not apply. Recorded here.

## 13. Human review

- [ ] 13.1 After `/opsx:verify`, `/koalarnes:commit`, the pull request and a clean `/koalarnes:review-pr`, the owner reviews the pull request; findings go through the artifacts and `/opsx:apply` again, until the owner approves in the chat.

## 14. features-check before the archive

- [ ] 14.1 Run `ka features-check` as the last task before `/opsx:archive`; verify the exit code is 0.

## Workflow follow-up

- After approval: `/opsx:archive`, then `/koalarnes:commit` to push the archive into the same pull request.
- Merge with `gh pr merge <n> --squash --delete-branch` on the owner's yes, follow the `deploy` run with `gh run watch` and report it.
- Once merged: propose closing Issue #12 and removing the worktree, in one `AskUserQuestion` call.
- Once deployed: the owner taps a `Trello #N` in the panel installed as an app (PWA) on the phone and checks the card opens.
- Once deployed: the owner pastes an image into a Claude Code on the Mac and taps its `[Image #N]` in the panel. If it answers «No encuentro la imagen N», find the temporary folder Claude Code uses on macOS and whether the hub's SSH shell reaches it, and fix the candidate list of design D4 in a `bugfix/` branch.
- Once deployed and checked: propose a release (`ka changelog release --dry-run`).
