# Proposal

GitHub issue: [Issue #36 «Nota rápida con atajo de teclado y sección de atajos en los ajustes»](https://github.com/SantiagoSchez/tmux-web-bridge/issues/36).

## Why

Adding a scratchpad note takes the mouse: click the field at the foot of the scratchpads, and first the colour tab when the note belongs to another one. While the owner works in the terminal, jotting something down breaks the flow. The panel's shortcuts are also fixed in code, and the only one the owner can change, the dictation's, sits alone in Ajustes › Dictado.

## What Changes

- A keyboard shortcut opens a «Nota rápida» dialog: a text field with the focus and the five colours. By default it is ⌃⌥N (Control+Option+N) on a Mac and Ctrl+Alt+N elsewhere: it types no character (the ñ through ⌥N+N keeps working), the browser does not reserve it and the owner's tmux does not use it.
- In the dialog, Alt+1…5 picks the colour in screen order (blue, green, yellow, orange, purple) without leaving the text; Tab reaches the colours, and the arrows move between them. The colour of the scratchpad shown is picked when it opens.
- Enter adds the note and closes the dialog, Shift+Enter is a new line, Escape closes it without adding anything. The focus goes back where it was (the terminal). The note remembers the open window, as notes added at the foot do, and the scratchpad shown switches to the note's colour.
- A new section «Atajos» in the settings lists every shortcut of the panel. The single-combination ones are changed there by pressing the new combination, each with «Restablecer»: search, fold the list, fold the scratchpads, quick note and dictation. The families Ctrl+1…9, Ctrl+Shift+1…9 and Ctrl+Shift+Alt+1…9 are listed, fixed.
- The panel's shortcuts are kept on each device. The dictation shortcut moves from Ajustes › Dictado to Atajos but stays in the hub, shared by every device, as now; Dictado names it and links to Atajos.
- A combination already used by another shortcut of the panel is refused, as are the ones refused today for the dictation (without Ctrl, Alt or Cmd, Ctrl with a letter alone, Ctrl with a number).
- The search gets Ctrl+Shift+K outside the Mac (⌘K on the Mac, as now); today it only answers Cmd/Win+K.
- The buttons' titles that name a shortcut (fold the list, fold the scratchpads) show the one configured on the device.
- **Contract**: no API, message or stored hub data changes. `HubSettings.dictationShortcut` keeps its format and meaning. The hub's check of the dictation shortcut stops refusing Cmd+K, as the search shortcut becomes configurable and the panel refuses clashes. The device preferences in the browser (`tmux-web-bridge:prefs`) gain the panel's shortcuts.

## Capabilities

### New Capabilities

- `keyboard-shortcuts`: the panel's configurable keyboard shortcuts, their defaults on a Mac and elsewhere, where each is kept, the clashes refused, and the «Atajos» section that lists and changes them.

### Modified Capabilities

- `scratchpads`: a quick note from the keyboard (new requirement), and the sidebar's fold shortcut becomes the configured one (modified requirement).

## Impact

- **Layers**: `web` (`web/src/shortcuts.ts`, `web/src/prefs.ts`, `web/src/dictation.ts`, `web/src/state.ts`, `web/src/components/Settings.tsx`, the new `ShortcutSettings.tsx` and `Sheet.tsx`, `Dialogs.tsx`, `Scratchpads.tsx`, `Mic.tsx`, the other users of `Sheet`, `Header.tsx`, `Rail.tsx`, `web/src/styles.css`) and `server` (`shared/`, where the shortcut logic moves from `shared/dictation.ts` to a new `shared/shortcuts.ts`, `server/src/settings.ts` and its tests). The `trello-extension` and `host-kit` layers are untouched.
- **External services**: none.
- **Data**: the browser's device preferences gain an optional field; a device without it uses the defaults. Nothing to migrate in the hub.

## Non-goals

- A button to open the quick note on a phone.
- Changing the families Ctrl+1…9, Ctrl+Shift+1…9 and Ctrl+Shift+Alt+1…9, or the terminal's own keys (the Mac's ⌘← and similar).
- Sharing the panel's shortcuts between devices, or keeping the dictation shortcut per device.
- Detecting combinations the operating system or the browser keeps for itself (such as ⌘⇧N in Chrome): the owner finds out by trying, and changes it.
