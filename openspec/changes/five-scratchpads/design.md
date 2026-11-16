# Design

## Context

See proposal.md for the motivation and specs/scratchpads/spec.md for the behaviour.

The scratchpads (capability `scratchpads`) store their notes by position in `dataDir/scratchpads.json`: an array of three arrays, blue, green and orange. `shared/scratchpads.ts` holds `SCRATCHPAD_COUNT = 3` and `SCRATCHPAD_MAX_NOTES = 10`, and `sanitizeScratchpads()` always returns three lists. The panel maps each position to a colour in `PADS` of `web/src/components/Scratchpads.tsx`, remembers the shown one as that position (`prefs.scratchpad`), and shows `n/10` at the foot of the add field.

## Goals / Non-Goals

**Goals:**

- Five scratchpads and 20 notes each, with the production file read as it is.
- A character counter where the note count was, and in the note being edited.

**Non-Goals:**

- Names for the scratchpads, configurable colours or a configurable number of them.

## Decisions

### Storage order differs from screen order

The new scratchpads go after the existing ones in storage: positions 0 to 4 are blue, green, orange, yellow and purple. The screen order (blue, green, yellow, orange, purple) is a list of positions in `PADS`, each entry carrying its storage position, colour and name. So the production file, with three lists, keeps every note in its colour, and a device that remembers position 2 still opens orange.

Alternative considered: store in screen order and migrate the file on load (move orange from 2 to 3). Rejected: a migration for an ordering preference, plus every device's remembered `prefs.scratchpad` would point at the wrong colour.

### Reading a three-scratchpad file

`sanitizeScratchpads()` builds `SCRATCHPAD_COUNT` lists from the stored array, taking a missing position as empty, as it already does for anything malformed. No version field or migration: the file is rewritten with five lists at its next change.

### Limits and type

`SCRATCHPAD_COUNT = 5` and `SCRATCHPAD_MAX_NOTES = 20` in `shared/scratchpads.ts`. `Scratchpads` in `shared/types.ts` becomes a five-element tuple, and `SCRATCHPAD_COUNT` is declared with `satisfies Scratchpads['length']`, so the constant and the tuple cannot drift apart. The hub's refusal message already takes the limit from the constant.

### Character counter

A constant `SCRATCHPAD_COUNTER_FROM = 3500` in `shared/scratchpads.ts`, next to the 4000 it relates to. The add field and the note editor show `length/4000`, where `length` is the text without trailing whitespace (what `noteText()` measures and the hub stores), on a line of its own under the field, right-aligned, once the text reaches 3500 characters, in the warning colour (`--peach`) above 4000, and nothing below 3500. The counter sits under the field and not over its corner because, over the corner, it covered the last line of text and the scrollbar of a long note. The editor, a `textarea` without a wrapper today, gets one so the counter can sit under it, as in the add field. The note count leaves the field: it stays on each colour (the badge, and `n/20` in its tooltip).

### Five tabs in the header

Five 40 px tabs and the fold button fit in the 320 px column; the folded strip takes five dots; the phone drawer has no fold button. No layout change beyond the extra entries.

## Risks / Trade-offs

- [A device on the previous panel version, still open when the hub updates, receives five lists and shows the first three] → harmless: its three colours still match positions 0 to 2, and the update notice reloads it.
- [Rolling the hub back to 1.24.0 after notes were added to yellow or purple] → that version reads positions 0 to 2 only and, at its next write, rewrites the file without positions 3 and 4, so those notes are lost. Accepted: a rollback is not planned; before one, copy `dataDir/scratchpads.json`.
