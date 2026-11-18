# Proposal

GitHub issue: [Issue #48 — Enfocar el terminal al abrir un espacio o una ventana](https://github.com/SantiagoSchez/tmux-web-bridge/issues/48)

## Why

On a computer, clicking a window of the space already shown leaves the keyboard focus on the button that was clicked, so the owner has to click the terminal before typing into tmux. Clicking the window already open does nothing either. The terminal only takes the focus when it is created, and there is one terminal per space: switching windows inside a space only retargets it.

## What Changes

- On a computer, whenever the panel opens a window (the list of spaces and windows, the cards, the rail, the grid, the search, the activity, the usage limits bar, the pane tabs, the number shortcuts, a window just created), the terminal takes the keyboard focus, ready to type.
- Clicking the window already open gives the focus back to its terminal.
- On a touch device nothing changes: opening a window does not bring up the on-screen keyboard.

## Capabilities

### New Capabilities

- `terminal-focus`: when the panel's terminal takes the keyboard focus on its own. This change adds the opening of a window; the scratchpad paste and the quick note keep their own requirements in `scratchpads`.

### Modified Capabilities

None.

## Impact

- Layers: `web` only (`web/src/router.ts`, `web/src/state.ts`, `web/src/components/TerminalView.tsx`). No `server`, `shared`, `trello-extension` or `host-kit` change.
- Contracts: no API, websocket message, payload, data model or environment variable changes. The `terminalFocus` signal of `web/src/state.ts` is internal to the panel.
- External services: none.
- Documentation: a changelog entry (a flow the user sees changes), the feature catalogue (a new requirement) and a line in `docs/dev-standards/web-standards.md` saying that opening a window goes through `openWindow`, which hands the terminal the focus.

## Non-goals

- Bringing up the on-screen keyboard on phones and tablets when a window opens.
- Changing the focus when the route changes without `openWindow` (the browser's back and forward buttons, a hash typed by hand, a click on a push notification, which goes through `navigate`): these keep today's behaviour.
- Changing which pane of the window is selected, or the focus rules of the scratchpads, the quick note, the dictation or the file viewer.
