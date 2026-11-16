# Design

## Context

See proposal.md for the motivation. Notes live in `ScratchpadStore` (`server/src/scratchpads.ts`), saved to `dataDir/scratchpads.json`, read back through `sanitizeScratchpads` (`shared/scratchpads.ts`) and broadcast whole as `{ t: 'scratchpads', pads }` on every change. The panel adds a note with `POST /api/scratchpads/notes` (`ScratchpadAddRequest { pad, text }`) from `AddField` in `web/src/components/Scratchpads.tsx`. The window the panel shows is in the route (`route.value.name === 'window'`, with the host id and the window id such as `@3`); `findWindow(host, window)` in `web/src/state.ts` finds it with its session and host, and `openWindow(host, window)` in `web/src/router.ts` opens it. On the hub, `HostMonitor.findWindow(windowId)` (`server/src/host.ts`) finds a window and its session in the machine's last snapshot.

## Goals / Non-Goals

**Goals:**

- The hub, not the panel, decides the names stored with a note, from its own view of the machine.
- Notes saved before keep loading unchanged; nothing to migrate.

**Non-Goals:**

- Following a window across a tmux server restart, or across a session rename (see Risks).

## Decisions

### The panel sends ids; the hub stores ids and names

- **Context**: the line must keep naming the window after it closes, and the names come from the machine.
- **Decision**: `ScratchpadAddRequest` gains `origin?: { host: string; window: string }`, filled by `AddField` from the route when it shows a window. The add route resolves it with `originOf(host, windowId)`, a new function in `server/src/scratchpads.ts` that takes the `HostMonitor` (its `id`, `name` and `findWindow`) and returns a `ScratchpadNoteOrigin` `{ host, window, hostName, session, index, name }`, or `undefined` when the machine or the window is unknown. `ScratchpadStore.add(pad, text, origin?)` stores it on the note. `edit` and `paste` copy the note as it is, so they keep it.
- **Alternatives**: the panel could send the names, but then a client could store any text as a window name; storing only the ids would leave nothing to show once the window closes.
- **Consequences**: the WebSocket `scratchpads` message and `scratchpads.json` carry the new optional field. A hub rolled back drops it at its next save.

### Loading keeps only well-formed origins

- **Decision**: `sanitizeScratchpads` reads `origin` through a new `noteOrigin(raw)` in `shared/scratchpads.ts`: an object whose `host`, `window`, `hostName`, `session` and `name` are strings of at most 200 characters and whose `index` is a non-negative integer, else no origin. A malformed origin never drops the note.

### The panel decides open or closed

- **Decision**: a new `OriginLine` in `Scratchpads.tsx` looks the window up with `findWindow(origin.host, origin.window)` and treats it as open only when it is found in a session whose name is the stored `session`. Open: a `<button class="pads-origin">` with the current names («`host.name` · `session.name` · `window.index` `window.name`») that calls `openWindow` and, on a phone, sets `scratchpadsOpen` to false. Closed: a `<span class="pads-origin closed">` with the stored names, dimmed, `title` «Ventana cerrada». The note's layout becomes a column for the text and its line, with the action buttons beside it as today.
- **Alternatives**: trusting the window id alone would show another window's names, and open it, after a tmux server restart reuses the id; comparing session ids has the same problem, as tmux restarts those from `$0` too.

### Flow

1. The panel, showing window `@3` of `local`, sends `POST /api/scratchpads/notes { pad, text, origin: { host: 'local', window: '@3' } }`.
2. The route resolves the origin with `originOf(hosts.get('local'), '@3')` and calls `scratchpads.add(pad, text, origin)`.
3. The store saves the file and emits `change`; the hub broadcasts `{ t: 'scratchpads', pads }` with the origin on the note.
4. Every panel renders the note and its `OriginLine` against its own `hosts` signal, which the hub keeps up to date.

## Risks / Trade-offs

- [The machine's tmux server restarts and a new window reuses the id in a session with the same name] → the line shows and opens that new window. Accepted (proposal Non-goals); restarts are rare and the line still points at a window of the same session.
- [A session is renamed] → its notes' lines read as closed, with the old names. Accepted: the names stay true to where the note was written.
- [The window closes between the panel sending the note and the hub adding it] → `originOf` finds nothing and the note is added without a line, as the spec says.

## Migration Plan

Nothing to migrate. The hub and the panel deploy together; a note added from a panel that is not yet reloaded comes without an origin. Rolling back drops the origins at the next save of `scratchpads.json`.
