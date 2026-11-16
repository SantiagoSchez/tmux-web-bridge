# Proposal

GitHub issue: [#21 Tres scratchpads de colores en la barra lateral derecha](https://github.com/SantiagoSchez/tmux-web-bridge/issues/21) (refined in its body).

## Why

While Claude works, the owner often thinks of something to tell an agent later and has nowhere quick to put it, so it gets forgotten. A few fixed, coloured scratchpads (in the spirit of Tot on macOS) next to the terminal, holding short notes that go into a pane with one click, keep those thoughts at hand on every device.

## What Changes

- Three scratchpads, told apart by colour only (no names), stored by the hub and shown identically and live on every device.
- Each scratchpad holds up to 10 plain-text notes. A field at its foot adds a note (Enter saves, Shift+Enter inserts a new line) and shows the count `n/10`.
- A click on a note's text edits it; emptying it deletes it. Each note has three buttons: paste, pin, delete.
- «Pegar» types the note into the active pane of the open window as a paste, without Enter. An unpinned note is removed when pasted; a pinned one stays. A new note is unpinned.
- On a wide screen, a new right sidebar holds the scratchpads. It folds into a narrow strip with the three colour dots, remembers its state per device, and toggles with ⌘. (Mac) or Ctrl+Shift+. (Linux, Windows).
- On a phone, a drawer that opens by swiping from the right edge, mirroring the list's drawer on the left.
- New hub state and REST endpoints (see Impact). No existing behaviour or contract changes.

## Capabilities

### New Capabilities

- `scratchpads`: the three coloured scratchpads and their notes: storage and live sync, adding, editing, pinning, deleting and pasting notes into a pane, and where they are shown on wide screens and phones.

### Modified Capabilities

None.

## Non-goals

- Rendered Markdown, names for the scratchpads, more than three scratchpads, reordering notes.
- Pasting with Enter, or into a pane other than the active pane of the open window.
- Keeping a history of deleted or pasted notes.

## Impact

- Layers: `server` (with `shared/`) and `web`. No external service; no change to `host-kit` or `trello-extension`.
- Data: a new store file `scratchpads.json` in the hub's `dataDir`. It starts empty; no migration.
- Contracts (all new, in `shared/types.ts`):
  - Types `ScratchpadNote` and `Scratchpads`.
  - A `ServerMessage` variant `scratchpads`, sent in the `/ws` snapshot and broadcast on every change.
  - REST endpoints: `POST /api/scratchpads/notes` (add), `POST /api/scratchpads/notes/:id` (edit text or pin), `POST /api/scratchpads/notes/:id/delete`, `POST /api/scratchpads/notes/:id/paste`.
- No new environment variable or `config.yaml` option.
- Per-device preference `scratchpadsCollapsed` in `web/src/prefs.ts` (localStorage).
- The phone's left drawer gesture is shared with the new right drawer, so `web/src/components/Drawer.tsx` changes shape.
