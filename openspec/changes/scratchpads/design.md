# Design

## Context

See proposal.md for the motivation and specs/scratchpads/spec.md for the behaviour.

What the change builds on:

- The hub keeps panel-edited state in one JSON store per feature under `dataDir`, emits `change`, and `index.ts` broadcasts it to every browser and sends it in the `/ws` snapshot (server-standards, «New hub state pushed to every browser»).
- `pasteText(host, pane, text)` in `server/src/index.ts` already types text into a pane as a paste without Enter (`load-buffer -` from stdin, then `paste-buffer -p -r -d`). Uploads and dictation use it.
- The desktop layout is a CSS grid with two columns (list or rail, then `main`) and two optional rows above them (limits strip, update notice).
- On phones, `Drawer.tsx` opens the list from the left edge with a touch gesture in the capture phase; it is mounted only on the window screen.
- The pane the panel treats as current is `WindowView`'s: the route's pane, else the window's active pane, else its first pane.

## Goals / Non-Goals

**Goals:**

- One source of truth for the notes (the hub), with every mutation decided there, so concurrent devices cannot exceed the limits or paste a note twice.
- Reuse `pasteText` and the drawer gesture rather than a second copy of either.

**Non-Goals:**

- Offline editing or conflict merging: an edit is last-write-wins per note.
- Undo of a pasted or deleted note.

## Decisions

### Data model and limits

`shared/types.ts`:

```ts
export interface ScratchpadNote { id: string; text: string; pinned: boolean }
/** The three scratchpads, in colour order (blue, green, orange). */
export type Scratchpads = [ScratchpadNote[], ScratchpadNote[], ScratchpadNote[]];
```

Pure validation lives in `shared/scratchpads.ts` (`SCRATCHPAD_COUNT = 3`, `SCRATCHPAD_MAX_NOTES = 10`, `SCRATCHPAD_MAX_CHARS = 4000`, `noteText(raw)` that trims trailing whitespace and refuses empty or too-long text, `sanitizeScratchpads(raw)` used on load). The panel imports the limits from there to disable the field and show `n/10`.

Ids are `randomUUID()` from the hub. The colour of each scratchpad is its position, so no colour is stored.

### Store

`server/src/scratchpads.ts`, class `ScratchpadStore` (Events: `'change' (Scratchpads)`), file `dataDir/scratchpads.json`, written through a temporary file and `renameSync` (same as `automations.ts`; mode `0o600` because notes may hold private text). Methods: `add(pad, text)`, `edit(id, { text?, pinned? })` (empty text deletes), `remove(id)`, and `paste(id, send)` for the paste (see «Paste flow»). Errors are `ScratchpadError` with an HTTP `status` (400 bad input, 404 gone, 409 full or already being pasted, 502 the machine failed), like `FileError`.

Alternative considered: keep the notes inside `HubSettings`. Rejected: settings are configuration, are sanitised and broadcast as a whole on every change, and notes change far more often.

### Transport: REST for mutations, websocket for state

Following server-standards (hub state every device shows is broadcast; everything else is REST):

| Request | Body | Result |
|---|---|---|
| `POST /api/scratchpads/notes` | `{ pad: 0..2, text }` | `{ id }` |
| `POST /api/scratchpads/notes/:id` | `{ text?, pinned? }` | `{ ok: true }` |
| `POST /api/scratchpads/notes/:id/delete` | none | `{ ok: true }` |
| `POST /api/scratchpads/notes/:id/paste` | `{ host, pane }` | `{ ok: true }` |

The `ServerMessage` variant `{ t: 'scratchpads'; pads: Scratchpads }` goes in the `/ws` snapshot and is broadcast on `change`. The panel never updates its signal optimistically: the broadcast arrives within the same round trip and keeps every device identical.

Alternative considered: websocket messages for the mutations. Rejected: the panel needs an answer for each one (full, gone, the machine failed), which REST already gives with `api<T>()` and a Spanish `error`.

### Paste flow

```
panel                        hub                                   machine
POST …/notes/:id/paste ───▶  check host, pane (^%\d+$, findPane)
                             note = store.startPaste(id) (404 if gone or being pasted)
                             pasteText(host, pane, note.text) ───▶ load-buffer (stdin) + paste-buffer -p
                             ◀─── ok / error (502, note kept)
                             store.finishPaste(id, ok) (removes it if ok and unpinned)
                             emit change ──▶ broadcast { t: 'scratchpads' } to every browser
◀── { ok: true }
```

The store owns the whole sequence in `paste(id, send)`, where `send(text)` is the route's call to `pasteText` (it turns a machine failure into a 502 `ScratchpadError` naming the machine). To paste a note once when two devices press at the same time, `paste` marks the note as being pasted (an in-memory set) before awaiting `send`: a second call finds the mark and gets 409 «Esa nota ya se está pegando», pinned or not; a note that is gone gets 404. When `send` resolves, the note goes unless it is pinned (a note deleted meanwhile is not brought back); when it rejects, the mark is released, the note stays and the error goes up. Node runs the synchronous part without interleaving, so the mark is in place before the second request reads it.

The note's text reaches tmux through stdin only, never on a command line. Logs name the note id and where it was pasted, never its text.

### Target pane in the panel

A helper `paneOf(window, paneId)` in `web/src/state.ts` holds the rule `WindowView` uses to pick the pane it shows (the route's pane, else the active one, else the first). `WindowView` uses it, and `Scratchpads.tsx` derives its paste target from the route with it (`{ host, pane }`, or null outside the window screen), so the two cannot drift. Paste buttons are disabled when the target is null.

### Layout on wide screens

The desktop grid gets a third column for `<aside class="pads-side">`: `340px minmax(0, 1fr) 320px` (as `--list-w` and `--pads-w`), and `56px` for the folded strip (both for the list's own fold). The limits strip and the update notice span all columns. The preference `scratchpadsCollapsed: boolean` in `prefs.ts`, toggled by `toggleScratchpads()`, and the shortcut in `shortcuts.ts` next to Cmd+B: `⌘.` when `navigator.platform` is a Mac, else `Ctrl+Shift+.` (matched on `e.code === 'Period'`, so a keyboard layout where Shift+. is `:` still works). The sidebar shows on every screen, home included.

### Drawer on phones

The edge-swipe logic of `Drawer.tsx` becomes a component `EdgeDrawer` (`side`, `open`, `other`) used by the list's drawer (left) and a new scratchpads drawer (right). Each drawer listens only to touches starting on its own edge and does not start while the other is open, so they never compete; the window header's swipe between windows ignores touches that start on either edge. The phone's back button closes the scratchpads drawer like the list's (`backButton.ts` counts `scratchpadsOpen` as a layer). A successful paste from the drawer closes it, so the terminal with the pasted text is in view. Neither drawer starts while a sheet, a dialog, the palette or the file viewer is open, since those sit above the drawers. The scratchpads drawer is mounted on every phone screen; `drawerOpen` keeps its meaning for the list and a new signal `scratchpadsOpen` is added for the right one.

### Fields, buttons and focus

The fields never cut the text (no `maxLength`): a note over 4000 characters reaches the hub, which refuses it with a message, and the text stays in the field (or the note stays open) for the owner to shorten. The add field ignores Enter while its request is in flight, so a repeated Enter cannot add the note twice. The note buttons are 30 px on a mouse and `--tap` (44 px) under `pointer: coarse`, as the web standards ask. After a paste on a computer the terminal of that pane takes the keyboard back (a `scratchpadPasted` signal in `state.ts`, read by `TerminalView` like `dictationEnded`), so Enter sends the text instead of pressing the paste button again.

### Components

`web/src/components/Scratchpads.tsx`: `Scratchpads` (the three colour tabs, the selected scratchpad's notes and the add field), `NoteRow` (text that turns into a `textarea` on click, and the paste, pin and delete buttons with `aria-label`s), `ScratchpadsRail` (the folded strip); `ScratchpadsDrawer` sits in `Drawer.tsx` beside the list's drawer. The selected scratchpad is per device (`prefs.scratchpad`, a `number` read as 0 to 2, anything else showing the first). Colours come from `--blue`, `--green` and `--peach` in `:root`, both themes.

## Risks / Trade-offs

- [The right edge swipe collides with the browser's own edge gestures on some phones] → the same threshold as the left drawer, which already works on the owner's Android phone; checked by hand on a phone-sized viewport and on the phone.
- [A paste succeeds on tmux but the hub restarts before saving the removal] → the note reappears; harmless, and pinned-or-not is the user's to fix.
- [Last-write-wins on concurrent edits of the same note] → acceptable for a single owner; the broadcast shows the winning text at once.
- [A third grid column narrows the terminal on 900-1200px screens] → the sidebar folds to 56px and remembers it.

## Migration Plan

No data to migrate: `scratchpads.json` is created on the first change. Rollback is a revert; the file is left behind and ignored.

Wiring changes in `server/src/index.ts` (a new store instantiated and wired to broadcasts) need a boot smoke test: start the hub on its own `TMUX_TMPDIR` and port, wait for the ready line, and stop it.
