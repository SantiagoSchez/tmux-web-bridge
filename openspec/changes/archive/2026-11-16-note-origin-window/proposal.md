# Proposal

GitHub issue: [Issue #33 «Las notas muestran la ventana en la que se crearon»](https://github.com/SantiagoSchez/tmux-web-bridge/issues/33).

## Why

A scratchpad note does not say which window it was written in. With several windows and Claude Code sessions open, the owner cannot tell which piece of work a note belongs to, nor get back to it quickly.

## What Changes

- A note added while a window is open remembers that window. Below its text, a small line names it as «máquina · sesión · ventana» (for example, «Local · demo · 1 claude»).
- While that window is still open, the line shows its current names (also after renaming the window or its session) and opens it when pressed; on a phone it also closes the scratchpads drawer.
- Once the window is closed, or while its machine is not answering, the line keeps the names it had when the note was added, dimmed and without a link; its tooltip says which of the two.
- Pasting is unchanged: «Pegar» types the note into the window open now, not the one it came from.
- A note added outside a window, and every note saved before this change, has no line. Editing, pinning or pasting a note does not change its origin.
- **Contract**: `ScratchpadAddRequest` (`POST /api/scratchpads/notes`) gains an optional `origin: { host, window }` with the ids of the open window. `ScratchpadNote` gains an optional `origin` (`ScratchpadNoteOrigin`: the host and window ids, the session's id and creation time, plus the host, session and window names and the window index, as the hub saw them). `SessionInfo` gains `created`, the session's creation time, so the panel can tell the session apart after a rename or a tmux restart. The hub fills the names from its own view of the machine; an origin it does not know is dropped and the note is still added. The `scratchpads` WebSocket message and `dataDir/scratchpads.json` carry the new field; files saved before keep loading as they are.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `scratchpads`: a note remembers and shows the window it was added in, and that line opens the window.

## Impact

- **Layers**: `server` (`server/src/scratchpads.ts`, `shared/scratchpads.ts`, the add route in `server/src/index.ts`, `shared/types.ts`) and `web` (`web/src/components/Scratchpads.tsx`, `web/src/styles.css`). The `trello-extension` and `host-kit` layers are untouched.
- **External services**: none.
- **Data**: `scratchpads.json` gains an optional field per note. No migration: notes without it load as before. Rolling back to an older hub drops the field the next time it saves.

## Non-goals

- Pasting into the window a note came from.
- Setting or changing a note's origin by hand, or showing an origin for notes saved before this change.
- Moving or sorting notes by window, or filtering a scratchpad by the open window.
- Following a window moved to another session: its notes read as closed.
