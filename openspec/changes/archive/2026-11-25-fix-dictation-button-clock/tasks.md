# Tasks

## 1. Create the branch

- [x] 1.1 Create `bugfix/85-el-contador-del-boton-de-dictar-se-queda-en-0-00` from `master` in its own worktree with `/ka:git-worktree create`; check with `git branch --show-current`.

## 2. Review the existing tests

- [x] 2.1 Read the tests of every module the change touches and write one line per module saying «tests up to date» or «tests updated/added in this change»: `web/src/components/Mic.tsx` and `web/src/styles.css` (the web layer has no test suite: say so, and that the behaviour is checked by hand in 3.4), and `web/src/dictation.ts` (unchanged: say so).
  - `web/src/components/Mic.tsx`, `web/src/styles.css`: no tests (the web layer has no test suite); checked by hand in 3.4.
  - `web/src/dictation.ts`: unchanged by this change, no tests. `server/src/dictation.test.ts` tests the hub's dictation (`screenWords`, `modelLabel`), which this change does not touch: tests up to date.
- [x] 2.2 Trace the bug before the fix changes anything: run `ka review-rounds escape --path web/src/components/Mic.tsx --line 122 --reason "HoldMic renders the recording clock but the tick that redraws it lives in its parent MicButton; @preact/signals skips HoldMic when its props do not change, so the hold mode clock stays at 0:00"`.

## 3. The clock and the transcribing ring

- [x] 3.1 In `web/src/components/Mic.tsx`, add a `RecClock` component that takes `since`, owns the 500 ms interval and its tick state, and renders `● m:ss` (D1). Render it in tap mode's recording button and in `HoldMic`'s label while recording; remove the interval and the `tick` state from `MicButton`. `pnpm --filter web typecheck` passes.
- [x] 3.2 In `web/src/components/Mic.tsx`, render the `sending` phase as the disabled button with `aria-label="Transcribiendo"` and an `aria-hidden` `span.mic-spinner` in place of «…», without the `rec` class (D2). `pnpm --filter web typecheck` passes.
- [x] 3.3 In `web/src/styles.css`, add `.mic-spinner` (a `1em` circle with a `currentColor` border whose top side is transparent, turned by a new `@keyframes spin`) and drop the `pulse` animation from `.mic.busy`, keeping `cursor: progress` and setting `opacity: 1` against the global fade of disabled buttons (D2). `pnpm --filter web typecheck` passes.
- [x] 3.4 Check it by hand in a browser against an isolated panel (a hub with its own `HOME` and `TMUX_TMPDIR`, a tmux on its own socket started with `-f /dev/null`, never the user's tmux; the dictation reported ready and `/api/dictate` answered by a stand-in, with a delay so the ring can be seen), on a phone-sized viewport and a wide one, in the key bar and the window header: «Hold mode clock advances», «Tap mode clock advances», «Recording started with the shortcut», «Ring while the hub transcribes», «Back to the label when the text arrives», «Back to the label when the dictation fails» and «Discarded recording». Before the fix, see the hold mode clock stay at `● 0:00` with the same setup. Record what was checked in this task.
  - Setup: a hub on its own port with a fake `HOME` and `TMUX_TMPDIR`, a `local` machine whose `tmux` is a wrapper on a relative `-S` socket with `-f /dev/null`, vite against it, headless Chrome with a fake microphone playing a WAV. Dictation turned on and reported ready by setting the panel's `hubSettings` and `dictationInfo` signals from the page (the hub's model was not downloaded), and `/api/dictate` answered in the page after 3 s with a text, or with an error.
  - Before the fix (the button of `master`): holding the header's 🎤 at 1280 px read `● 0:00` at 1, 2, 3 and 4 s, then «…» on release.
  - Hold mode, header button, 1280 px: `● 0:01`, `● 0:02`, `● 0:03`, `● 0:04` while held; on release the ring turning (its transform changes between reads), background `rgb(48, 52, 70)` as the idle button, disabled, «Transcribiendo»; 🎤 again when the text arrived.
  - Tap mode, header button, 1280 px: `● 0:01`, `● 0:02`, `● 0:03`; the ring after the second tap; 🎤 «Dictar» again at the end.
  - Shortcut, hold mode, 1280 px: Ctrl+Shift+Space from the terminal, `● 0:02` after 2.3 s; the ring after the second press; 🎤 at the end.
  - Hub failure, hold mode: `● 0:02` while held, the ring on release, the toast «Dictado: fallo simulado», then 🎤.
  - Discard, hold mode: «✕ suelta» when the pointer left the button, 🎤 on release; the ring never appeared (watched with a MutationObserver) and `/api/dictate` was not called.
  - Phone, 390×844 with touch emulation, key bar 🎤 held with a finger: `● 0:01`, `● 0:02`; on release the ring inside the 44×40 key; 🎤 at the end. The first screenshot showed the ring faint, because the global `button:disabled` rule fades a disabled button to 0.4; `.mic.busy` now sets `opacity: 1` (D2), and the second screenshot shows it clearly. On a phone the window header has no 🎤 (it is only in the key bar), so the header was checked at 1280 px, where the ring fits inside its 38×34 button.
- [x] 3.5 Commit the group with `/ka:commit` (with the change's OpenSpec artifacts) once `pnpm --filter web typecheck` passes.

## 4. Run tests, typecheck and lint

- [x] 4.1 Run `pnpm --filter web typecheck`, green; run `ka scope` and the checks it lists (`ka features-check`, `ka docs-check`), or record them as not applicable.
  - `pnpm --filter web typecheck`: exit 0. `ka scope`: features-check and docs-check apply. `ka features-check`: exit 0, two pending sections (`recording-clock`, `transcribing-indicator`) for group 7. `ka docs-check`: exit 0, no dead reference.

## 5. Update the documentation and the changelog

- [x] 5.1 Run `/ka:update-docs` for the flow visible to the end user and for the pattern future contributors should follow: a component that redraws over time owns its own timer, because `@preact/signals` skips a child that reads a signal when its props do not change (web standards, «Conventions»).
  - `docs/dev-standards/web-standards.md`, «Conventions»: a line after the signals one, on a component that redraws over time owning its own timer (`RecClock`). No other standard or the README described the button's busy state, so nothing went stale.
- [x] 5.2 Add the changelog entry with `/ka:changelog --issue 85`: the dictation button's clock advances in hold mode, and a spinning ring shows while the dictation is transcribed.
  - `changelogs/unreleased/20261125T111357054-bugfix-85-el-contador-del-boton-de-dictar-se-queda-en-0-00.json`: `fixed`, scope `web`, Issue 85.
- [x] 5.3 Commit the group with `/ka:commit` once `pnpm --filter web typecheck` passes.

## 6. Review loop

- [x] 6.1 Run `/opsx:verify` and fix what it reports through the artifacts.
- [x] 6.2 The adversarial review does not apply: the change touches no message or job payload, no dependency-injection wiring or bootstrap, and no migration; it changes one component's rendering and its styles.
- [x] 6.3 Open the pull request with `/ka:commit --pr`.
- [x] 6.4 Run `/ka:review-pr` in rounds as the bounded review loop says, recording each with `ka review-rounds record`; tick this task once `ka review-rounds gate` passes and the pending suggestions have gone through `ka-evaluator`.

## 7. Update the feature catalogue

- [x] 7.1 Run `/ka:update-features fix-dictation-button-clock` for the added requirements of `dictation-button`.
- [x] 7.2 Run `ka features-check --strict` with exit code 0.
- [x] 7.3 Commit the catalogue with `/ka:commit`.

## 8. E2E pipeline

- [x] 8.1 The project has no E2E suite; this step does not apply.

## 9. Human review

- [x] 9.1 Ask the user with `AskUserQuestion` who reviews the pull request, and wait for the approval or record that the user takes it as good. The owner took PR #86 as good without a manual review (2026-11-25).

## 10. Feature catalogue check before the archive

- [x] 10.1 Run `ka features-check --strict` with exit code 0 as the last task before `/opsx:archive`.

## Workflow follow-up

- Run `/opsx:archive`, commit the archive moves with `/ka:commit`, check the pull request's head matches `git rev-parse HEAD`, and merge with `gh pr merge --squash --match-head-commit <commit>` on the owner's yes.
- Follow the `deploy` run of the merge commit with `gh run watch`.
- Offer to comment and close Issue #85 and to remove the worktree with `/ka:git-worktree remove`.
