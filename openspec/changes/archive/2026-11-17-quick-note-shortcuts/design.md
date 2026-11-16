# Design

## Context

See proposal.md for the motivation. Today the panel's shortcuts are fixed in `bindShortcuts()` (`web/src/shortcuts.ts`), a keydown listener on `window` in the capture phase registered at start-up: ⌘K toggles `paletteOpen` (Cmd only, so outside the Mac it is Win+K), ⌘B or Ctrl+Shift+B folds the list, ⌘. or Ctrl+Shift+. folds the scratchpads (both only while `isDesktop`), and the Ctrl(+Shift)(+Alt)+1…9 families move between windows, spaces and machines. The buttons' titles read the fixed strings `SIDEBAR_KEY` and `SCRATCHPADS_KEY` of `web/src/prefs.ts` (used in `Header.tsx`, `Rail.tsx` and `Scratchpads.tsx`).

The dictation shortcut is the only configurable one: `HubSettings.dictationShortcut`, a string such as `ctrl+shift+Space` (`shared/dictation.ts`: `Shortcut`, `parseShortcut`, `serializeShortcut`, `shortcutProblem`), validated again by the hub in `server/src/settings.ts` and tested in `server/src/shortcut.test.ts`. `ShortcutSetting` in `web/src/components/Settings.tsx` records a new one: while `recordingShortcut` (`web/src/dictation.ts`) is true, a capture listener takes the next combination, and the dictation does not act. The dictation itself is answered by `dictationKeyDown` from `WindowView.tsx`, so only with a window open.

Device preferences live in `prefs` (`web/src/prefs.ts`, localStorage `tmux-web-bridge:prefs`). Dialogs are variants of the `dialog` signal (`web/src/state.ts`) rendered by `Dialogs.tsx`; settings sections are `SettingsTab` values listed in `SECTIONS` of `Settings.tsx`. A note is added by `AddField` in `Scratchpads.tsx` with `POST /api/scratchpads/notes` and the open window as `origin`.

## Goals / Non-Goals

**Goals:**

- One definition of every configurable shortcut (its id, label and defaults on a Mac and elsewhere) used by the key handler, the settings section and the buttons' titles.
- The rules that refuse a combination, and the clash check, as pure code in `shared/`, tested from `server/src/shortcut.test.ts`.

**Non-Goals:**

- See the proposal's Non-goals.

## Decisions

### Shortcut logic moves to `shared/shortcuts.ts`

- **Decision**: `Shortcut`, `parseShortcut`, `serializeShortcut` and `shortcutProblem` move from `shared/dictation.ts` to a new `shared/shortcuts.ts`, which also holds:
  - `PANEL_SHORTCUT_IDS`, in the order the settings list them, and `PANEL_SHORTCUTS`, a `Record<PanelShortcutId, { label, mac, other }>`, for `search` (`meta+KeyK` / `ctrl+shift+KeyK`), `foldList` (`meta+KeyB` / `ctrl+shift+KeyB`), `foldPads` (`meta+Period` / `ctrl+shift+Period`) and `quickNote` (`ctrl+alt+KeyN` on both, which a Mac shows as ⌃⌥N).
  - `panelShortcut(id, saved, mac)`: the saved combination when it parses, else the default of the device's kind.
  - `matchesShortcut(event, sc)`: same `code` and the same four modifiers.
  - `shortcutClash(sc, taken)`: the label of the first entry of `taken` with the same combination, or null.
  - `shortcutRefusal(sc, taken)`: why a combination cannot be set, a change or a «Restablecer» alike: what `parseShortcut` refuses (with `shortcutProblem`'s reason), else a clash, else null.
  - `formatShortcut(sc, mac)`: on a Mac the symbols in the system's order (⌃⌥⇧⌘ then the key: «⌃⌥N», «⌘.»), elsewhere «Ctrl+Alt+N», with the key names `web/src/dictation.ts` has today.
- `shortcutProblem` drops its Cmd+K rule: the search becomes configurable and the clash check covers it. It gains one: Alt with only 1…5 chooses a colour in the quick note dialog, so no shortcut can take it. `DEFAULT_DICTATION_SHORTCUT` stays in `shared/dictation.ts`, with `dictationShortcutOf(raw)`: the hub's combination, or the default when it is missing or not valid, used wherever the panel reads it. Every importer (`server/src/settings.ts`, `web/src/dictation.ts`, `Settings.tsx`, the tests) moves to the new module; nothing is re-exported from the old one.
- **Alternatives**: keeping the helpers in `shared/dictation.ts` would leave the panel's shortcuts depending on the dictation module.

### Panel shortcuts per device, dictation in the hub

- **Decision**: `Prefs` gains `shortcuts: Partial<Record<PanelShortcutId, string>>` (serialized combinations); a missing or unparsable entry means the default. «Restablecer» deletes the entry. The dictation shortcut keeps `HubSettings.dictationShortcut` and its route.
- `web/src/shortcuts.ts` exports `shortcutOf(id)` (resolved from `prefs` and `isMac`) and `shortcutLabel(id)`, with `shortcutFromEvent(e)` and `shortcutText(sc)` (the device's way of writing a combination), which move there from `web/src/dictation.ts`. `SIDEBAR_KEY` and `SCRATCHPADS_KEY` are removed; their three users call `shortcutLabel`. `recordingShortcut` moves from `web/src/dictation.ts` to `web/src/shortcuts.ts` and holds the id of the row waiting for a combination (null otherwise); `bindShortcuts` returns at once while it is set, as `dictationKeyDown` already does: `bindShortcuts` is registered first, so its capture listener runs before the recorder's.
- **Alternatives**: keeping every shortcut in the hub would share them, but a Mac and a Linux computer need different keys.

### Clash check at recording time

- **Decision**: the recorder refuses a combination with `shortcutRefusal` against the other panel shortcuts of the device and the hub's dictation shortcut (and, when recording the dictation, against the panel shortcuts). «Restablecer» checks the default the same way, so restoring one never leaves two shortcuts on one combination; the refusal stays under the row while its reason holds, and goes for good once it no longer does. The recorder's listener depends only on whether the row is waiting, and reads the taken combinations from a ref, so a hub broadcast that re-renders the section does not stop it. The hub only applies `shortcutProblem`, as it cannot see a device's shortcuts. If a clash appears anyway (the dictation changed on another device), `bindShortcuts` answers first and stops the event, so the panel shortcut wins; the «Atajos» row of the dictation then shows the clash in a line under it.

### The «Atajos» section

- **Decision**: a `SettingsTab` `'shortcuts'` labelled «Atajos» (hint «Búsqueda, plegar, nota rápida y dictado»), placed after «Dispositivo». It lists `PANEL_SHORTCUTS` and the dictation, each with its `kbd`, «Cambiar» and, when not the default, «Restablecer», each a `ShortcutRow` of the new `web/src/components/ShortcutSettings.tsx` (it takes the label, the value, the default, the taken list and `onChange`), which replaces the dictation's `ShortcutSetting` of `Settings.tsx`. The dictation row says that it applies to every device. Below, the three number families as fixed rows. «Dictado» replaces its shortcut block with a line naming the shortcut and a button that opens «Atajos».

### The quick note dialog

- **Decision**: a `Dialog` variant `{ kind: 'quickNote' }` rendered by `QuickNoteDialog`, which lives in `Scratchpads.tsx` with the rest of the scratchpads and is mounted from `Dialogs.tsx` inside a `Sheet` titled «Nota rápida». `Sheet` moves from `Dialogs.tsx` to its own `web/src/components/Sheet.tsx`, so `Scratchpads.tsx` and `Dialogs.tsx` do not import each other. `bindShortcuts` opens it when no dialog is open, closing the search first if it is open, so the dialog is not hidden under it; it records `document.activeElement` and gives it the focus back on close (Enter after adding, Escape, the sheet's close), once: a note the hub answers after Escape closed the dialog does not close it again. When that element is gone (the search's field), the open window's terminal takes the focus through the signal a pasted note already uses, renamed `terminalFocus` (`web/src/state.ts`), which `TerminalView` answers on a computer.
- The text field is a `textarea` with the focus and the `CharCount` of the foot field. The colours are a `role="radiogroup"` of five `role="radio"` buttons in screen order (`PADS`), with a roving `tabindex`: Tab from the text lands on the chosen one, the arrows move and choose. Alt+1…5 (by `event.code` `Digit1`…`Digit5`, so ⌥1 on a Mac does not type «¡») chooses from anywhere in the dialog.
- Adding goes through one helper shared with `AddField`, `addNote(pad, text)`, which sends `origin` from the route as today and returns the hub's reason for a refusal, or null. With 20 notes in the chosen scratchpad the dialog says it is full without calling the hub; a refusal keeps the dialog open with the text and the hub's reason; an empty text does nothing. After adding, `setPref('scratchpad', pad)` shows that scratchpad.
- **Alternatives**: opening the scratchpads and focusing the foot field would need the sidebar unfolded and does not let the colour be picked from the keyboard; a phone has no room for a second field.

## Risks / Trade-offs

- [The browser or the OS keeps a combination the owner sets] → the shortcut never arrives; the owner changes it (proposal Non-goals).
- [⌃⌥N reaches the terminal on a device where the panel is not focused] → nothing changes: the shortcut only acts while the panel has the keyboard.
- [Ctrl+Shift+K outside the Mac is a new key] → it was free (the panel answered Win+K, which the OS usually takes); a shell or Claude Code that wanted it no longer gets it while the panel is focused, and the owner can change it.

## Migration Plan

Nothing to migrate: a device without `prefs.shortcuts` uses the defaults, and the dictation keeps its hub setting. The one stored value the change could invalidate is a dictation shortcut of Alt+1…5 alone: the hub refuses it from now on and the panel reads it as the default, Ctrl+Shift+Space. The owner confirmed their hub does not keep one. Rolling back ignores the new preference.
