# Design

## Context

The hub already sends, for each account in `AccountsInfo`, a `ClaudeAccount.spare` count: the logins it keeps with no machine using them (`server/src/account-store.ts`, `info()`). Today the panel shows it only in the subtitle of the account's menu (`accountMenu` in `web/src/accounts.tsx`). The strip's row (`AccountRow` in `web/src/components/LimitsBar.tsx`) is a button with the account's label, its plan and a ⚠; on a phone the label is cut at 9 characters and the plan is hidden.

The login dialog (`ClaudeLoginDialog` in `web/src/components/Dialogs.tsx`, the `claudeLogin` variant of `Dialog`) already has the two modes this change needs: with `account` it names that account and its email, and warns when the login turns out to be of another one; without it, it asks for any account and an optional alias. The hub files a login under the account its profile names (`addLogin`), so a second login of a known account never creates a second row.

## Goals / Non-Goals

**Goals:**

- Reuse the existing dialog and hub operations: no change outside `web/`.

**Non-Goals:**

- Reworking the dialog's texts beyond what the two entry points need.

## Decisions

### D1. The spare count sits outside the account's button

The count is its own element in the row's account cell, right after the button, not inside it. The button cuts its text with an ellipsis (at 9 characters on a phone), which would hide a count placed inside it; outside, the count stays visible on a phone as well, where the plan is hidden. It is dimmed like the plan (`--overlay0`) and reads `·N`, with `title` giving the words («1 sesión libre», «N sesiones libres»). The same words join the button's `title`, so the row's tooltip says it too. A screen reader reads the words, not the glyph: the `·` is `aria-hidden` and a visually hidden span carries the text. The panel has no such class yet, so the change adds a `visually-hidden` class to `styles.css`.

Alternative considered: inside the button after the plan, as in the mock-up. Rejected for the phone, where it would be cut.

### D2. One helper gives the count's words

`spareLabel(n)` in `web/src/accounts.tsx` returns «1 sesión libre» or «N sesiones libres» (undefined for 0), used by the strip's row and by the menu's subtitle, which today builds the same text inline. The panel has no test runner, and the helper is two branches of display text: it stays in `web/`, not in `shared/`.

### D3. The menu's add item opens the dialog for its account

`accountMenu` pushes «Añadir una sesión de esta cuenta» (icon `＋`) when the account does not need a login, and «Iniciar sesión otra vez» when it does; both set `dialog.value = { kind: 'claudeLogin', account: acc.id }`. «Añadir otra cuenta» leaves the menu. The dialog's existing outcome toasts already cover both results: «Sesión de X guardada», and the warning when the login is of another account.

### D4. The new-account button lives in the «Cambio automático de cuenta» section

`AccountRotationSettings` gets a `btn` «Añadir una cuenta de Claude» at the end of the section, after the machines' switches, calling `addAccount()` from `web/src/accounts.tsx`, which already opens the dialog with no account. The section's text says that the number next to each account in the strip counts its spare logins, that the account's menu adds another, and that a new account is added with that button, and the hint of «Máquinas» in the settings list (`SECTIONS` in `web/src/components/Settings.tsx`) names «cuentas de Claude», so the owner finds it from there. `addAccount` keeps its other caller, the strip's rows for an account only a statusline knows. The section only renders when the hub has sent its settings, which is also when the panel can reach the hub's account operations.

Since this dialog now also takes a login of a known account, its confirmation no longer depends on whether it was opened for an account: it says «Sesión de X guardada» when the account the hub filed the login under (`account` in the `loginFinish` answer) was in the panel's list before the dialog sent it, and «Cuenta X añadida» otherwise. The list is read before sending, because the hub's broadcast may already list the new account when the answer arrives.

Found while checking the flow by hand: the dialog said «Cuenta s3 añadida» for a login of an account the strip already showed.

Alternative considered: a row «＋ Añadir cuenta» at the end of the strip. The owner chose Ajustes, keeping the strip for reading and switching.

## Risks / Trade-offs

- [The only panel entry to add an account moves to Ajustes, where it is less visible] → The section's text names it, and a `/login` on a machine still brings a new account to the hub.
- [The `web` layer has no automated tests] → Manual check in a browser against an isolated hub, on a phone width and a wide one, as `web-standards.md` asks.
