# Tasks

The change touches only the `web` layer, which has no test runner (`docs/dev-standards/web-standards.md`, Testing). Each behaviour is checked with `pnpm --filter web typecheck` and by hand in a browser against an isolated hub, on a phone width and a wide one. The helper of D2 is display text and stays in `web/`, so no server test covers it.

## 1. Branch (mandatory step 1)

- [x] 1.1 Create the branch `feature/72-ver-las-sesiones-libres-de-cada-cuenta` from `origin/master` in its own worktree with `/ka:git-worktree create`. Verify with `git branch --show-current`.
  - Created; `git branch --show-current` prints `feature/72-ver-las-sesiones-libres-de-cada-cuenta`, based on `b692d58`.

## 2. Review the existing tests (mandatory step 2)

- [x] 2.1 Confirm that no test covers the modules this change touches (`web/src/accounts.tsx`, `web/src/components/LimitsBar.tsx`, `web/src/components/AccountRotation.tsx`) and that the server tests of `spare` (`server/src/accounts.test.ts`) still describe the count the panel shows. Output one line per module.
  - `web/src/accounts.tsx`, `web/src/components/LimitsBar.tsx`, `web/src/components/AccountRotation.tsx`: no tests (the `web` layer has no test runner).
  - `server/src/accounts.test.ts`: tests updated/added in this change. The `spare` tests still hold; none pinned that a second panel login of a known account stays in the same account as one more spare, which the new requirements rely on, so the test «a second login of a known account from the panel is one more spare of the same account» is added. Seen failing (2 accounts instead of 1) with `ensure` forced to create a new account, then restored.

## 3. Spare count in the strip (design D1, D2)

- [x] 3.1 Add `spareLabel(n)` to `web/src/accounts.tsx` («1 sesión libre», «N sesiones libres», undefined for 0) and use it in the subtitle of `accountMenu` in place of the inline text. Verify: `pnpm --filter web typecheck` passes and the menu's subtitle reads as before.
  - Typecheck exit 0; the subtitle reads «s2@example.com · Pro · 2 sesiones libres».
- [x] 3.2 In `AccountRow` (`web/src/components/LimitsBar.tsx`), show the count after the account's button as `·N` (the `·` `aria-hidden`, the words in a `visually-hidden` span, `title` with the words), only when `acc.spare > 0`, and add the words to the button's `title`. Add `.limit-spare` (dimmed like `.limit-plan`, visible on a phone) and `.visually-hidden` to `web/src/styles.css`. Verify in the browser: an account with two spare logins shows `·2` and its tooltip says «2 sesiones libres»; one with none shows nothing; on a phone width the count stays visible next to the cut name.
  - At 1280×800: `s1` (its only login in use) shows nothing, `s2 ·2`, `s3 ·1`, `s5` (needs a login) only ⚠. Button tooltips: «s2 · s2@example.com · Pro · leídos hace 0m · 2 sesiones libres» and, for `s1`, no spare text. The accessibility tree reads «2 sesiones libres», not the glyph. At 390×844 the count stays visible, also next to a 23-character name cut to «trabaj…».

## 4. Adding a login from an account's menu (design D3)

- [x] 4.1 In `accountMenu`, replace «Añadir otra cuenta» with «Añadir una sesión de esta cuenta» (opens `{ kind: 'claudeLogin', account: acc.id }`) when the account does not need a login, keeping «Iniciar sesión otra vez» in its place when it does. Verify in the browser: the menu of a working account offers the new item and no «Añadir otra cuenta»; the dialog names the account's email; the menu of an account that needs a login offers only «Iniciar sesión otra vez».
  - `s2`'s menu: «Añadir una sesión de esta cuenta», «Renombrar», «Quitar del hub»; no «Añadir otra cuenta». Its dialog is titled «Iniciar sesión con s2» and names `s2@example.com`. A login of s2 there: «Sesión de s2 guardada», still one row, `·3`. A login of s4 from `s1`'s dialog: «Has iniciado sesión con s4, no con s1: se queda guardada, sin cambiar nada», and a new row `s4 ·1`. `s5`'s menu offers «Iniciar sesión otra vez» and not the new item.

## 5. Adding an account from Ajustes (design D4)

- [x] 5.1 Add the button «Añadir una cuenta de Claude» to `AccountRotationSettings` (`web/src/components/AccountRotation.tsx`), calling `addAccount()`, and add to the section's text that it adds an account or one more session of one. Verify in the browser: the button opens the login dialog titled «Añadir una cuenta de Claude»; a row for an account only a statusline knows still opens it.
  - The button sits at the end of the section and opens the dialog titled «Añadir una cuenta de Claude». The hint of Ajustes › Máquinas in the settings list now names «cuentas de Claude» too (`web/src/components/Settings.tsx`), since that section is now the panel's way to add one. Not checked in the browser: the row of an account only a statusline knows, which needs a machine publishing its statusline; its code path (`AccountRow`'s `open`, `addAccount()` when there is no `acc`) is unchanged.
- [x] 5.2 In `ClaudeLoginDialog` (`web/src/components/Dialogs.tsx`), confirm «Sesión de X guardada» when the login's account was already in the panel's list before sending, «Cuenta X añadida» otherwise (design D4). Verify in the browser: a login of a new account from Ajustes says «Cuenta … añadida»; one of a known account says «Sesión de … guardada».
  - From Ajustes: s7 (new) gives «Cuenta s7 añadida» and a row `s7 ·1`; s3 (known) gives «Sesión de s3 guardada» and its one row goes to `·3`. Before the fix the s3 login said «Cuenta s3 añadida».

## 6. Tests, typecheck and lint (mandatory step 4)

- [x] 6.1 Run `pnpm --filter web typecheck`; it must pass. Run `ka scope` and the checks it lists (`ka features-check`, `ka docs-check`), reporting the ones that do not apply, and `openspec validate --strict account-spare-sessions`.
  - `pnpm --filter web typecheck`: exit 0. The branch also touches a server test, so `pnpm --filter server test` (472 pass) and `pnpm --filter server typecheck` (exit 0) were run too. `ka scope`: both checks apply, no E2E suite. `ka features-check`: in sync, 3 pending sections of this change for step 6. `ka docs-check`: no dead reference. `openspec validate --strict`: valid.
- [x] 6.2 Check the whole flow by hand against an isolated hub (its own `TMUX_TMPDIR`, `-L` socket and `-f /dev/null`, no `$TMUX`), with accounts whose spare counts are 0, 1 and 2, on a phone width and a wide one: the scenarios of the `claude-accounts` delta that do not need a real Claude login (the count, the menus, the dialogs' titles and emails). Record what was checked and what was not.
  - Hub on its own port with no machines (so no tmux server at all), a fake `HOME` and `TMUX_TMPDIR`, a seeded `accounts.json` and a fake Anthropic API loaded with `node --import` (tokens `at-<name>`, a pasted code `<name>` logs in as `<name>`), so the login flow ran end to end against it. Panel through Vite, driven with agent-browser at 1280×800 and 390×844. Checked: every scenario of the delta except the two below, with the results recorded in 3.2, 4.1, 5.1 and 5.2.
  - Not checked: «The count follows the hub» (a machine switching to an account needs a connected machine; the hub side is covered by `server/src/accounts.test.ts`, «a switch takes back what the machine had and gives it the spare login») and «A row for an account only a statusline knows» (see 5.1). The real Claude login page was not used.

## 7. Documentation and changelog (mandatory step 5)

- [x] 7.1 Run `/ka:update-docs`; the user-visible flow of adding an account changes, so add a changelog entry with `/ka:changelog`. Verify `ka docs-check` passes.
  - `README.md`, «Cuentas de Claude»: accounts are managed from the strip and Ajustes › Máquinas; a new account is added with «Añadir una cuenta de Claude»; a new bullet on the spare count and «Añadir una sesión de esta cuenta». `docs/dev-standards/web-standards.md`, Conventions › Accessibility: a glyph that carries meaning is `aria-hidden` and its words go in a `visually-hidden` span. Changelog: `changelogs/unreleased/20261120T215612897-feature-72-ver-las-sesiones-libres-de-cada-cuenta.json` (added, web, Issue #72). `ka docs-check`: no dead reference; «Añadir otra cuenta» is left only in this change's artifacts.

## 8. Feature catalogue (mandatory step 6, after the review loop's gate passes)

- [ ] 8.1 Run `/ka:update-features account-spare-sessions`, then `ka features-check --strict` with exit code 0, and commit with `/ka:commit`.

## 9. E2E pipeline (mandatory step 7)

- [ ] 9.1 The project has no E2E suite; this step does not apply. Record it here.

## 10. Human review (mandatory step 8)

- [ ] 10.1 Ask the owner with `AskUserQuestion` who reviews the pull request and record the answer here; do not archive before the approval or that answer.

## 11. features-check before the archive (mandatory step 9)

- [ ] 11.1 Run `ka features-check --strict` as the last task before `/opsx:archive`; the exit code must be 0.

## Workflow follow-up

- Between groups 7 and 8: `/opsx:verify`, `/ka:commit` with the pull request, and the bounded review loop. No adversarial review: no payload, wiring or migration changes.
- After the approval: `/opsx:archive`, `/ka:commit`, check the head, merge with `gh pr merge --squash --match-head-commit <sha>` on the owner's yes, follow the `deploy` run, and offer to comment on and close Issue #72 and to remove the worktree.
