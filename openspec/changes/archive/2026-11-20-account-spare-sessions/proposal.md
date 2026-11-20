# Proposal

GitHub issue: [Issue #72](https://github.com/SantiagoSchez/tmux-web-bridge/issues/72).

## Why

The automatic account switch only moves a machine to an account the hub keeps a spare login of, yet the panel hides how many spare logins each account has inside the account's menu. Adding another login of an account the hub already knows goes through «Añadir otra cuenta», which reads as if it would add a second row to the limits strip.

## What Changes

- Each account's row in the limits strip shows how many spare logins the hub keeps of it: a small dimmed number after the name and the plan (`·2`), with the full text («2 sesiones libres», «1 sesión libre») in the row's tooltip. An account with no spare login shows no number.
- An account's menu replaces «Añadir otra cuenta» with «Añadir una sesión de esta cuenta», which opens the Claude login dialog for that account: it names the account's email, and a login of another account is kept under its own account without switching anything, with the warning the dialog already shows. While the account needs a new login, its menu offers «Iniciar sesión otra vez» in place of the new item, as today.
- A new account is added from Ajustes › Máquinas: the «Cambio automático de cuenta» section gets a button «Añadir una cuenta de Claude» that opens the login dialog with no account, and the hint of «Máquinas» in the settings list names «cuentas de Claude». The rows of the strip for an account only a statusline knows keep opening that dialog too.
- The login dialog's confirmation says «Sesión de X guardada» when the login's account was already in the panel and «Cuenta X añadida» only for a new one. Today it chooses by whether the dialog was opened for an account, so a login of a known account from the generic dialog says «Cuenta X añadida».

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `claude-accounts`: adds three requirements about how the panel shows and adds the logins the hub keeps: the spare count in the account's row, adding a login of a known account from its menu, and adding a new account from Ajustes › Máquinas.

## Impact

- Layers: `web` (`web/src/components/LimitsBar.tsx`, `web/src/accounts.tsx`, `web/src/components/AccountRotation.tsx`, `web/src/components/Dialogs.tsx`, `web/src/components/Settings.tsx`, `web/src/styles.css`), plus one new test in `server/src/accounts.test.ts` that pins the hub behaviour the new requirements rely on (a second login of a known account stays in that account). No server code changes. No external service beyond the Claude login the dialog already opens.
- Documentation: `README.md` («Cuentas de Claude») and the accessibility convention of `docs/dev-standards/web-standards.md`.
- Contracts: none. The count comes from `ClaudeAccount.spare`, which the hub already sends in `AccountsInfo`; the dialog uses the existing `loginStart` and `loginFinish` account operations. No HTTP endpoint, message or job payload, data migration or environment variable changes.

## Non-goals

- Removing a single spare login, or listing the logins one by one.
- Any change to how the hub stores, refreshes or hands out logins, or to the automatic switch's decision.
- Warning in the strip when an account has no spare login.
