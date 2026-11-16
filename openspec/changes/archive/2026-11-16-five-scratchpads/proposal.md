# Proposal

## Why

Three scratchpads of 10 notes fall short for the owner, who keeps notes for several agents and projects at once ([Issue #24](https://github.com/SantiagoSchez/tmux-web-bridge/issues/24)). The number at the foot of the add field shows the notes, which the colour already shows, while what the owner cannot see is how close a long note is to the 4000-character limit.

## What Changes

- Two more scratchpads, yellow and purple, for five. On screen they go blue, green, yellow, orange, purple. The existing notes keep their colour: the new scratchpads are stored after the existing three.
- A scratchpad holds up to 20 notes instead of 10.
- The number at the foot of the add field becomes a character counter (`3600/4000`), shown only from 3500 characters on and counted without trailing whitespace, as the hub counts them, and the same counter shows while editing a note. The note count stays on each colour; a full scratchpad still disables the field and says it is full.
- The hub reads a file saved with three scratchpads as five, the last two empty.

## Non-goals

- Names for the scratchpads, configurable colours or a configurable number of them.
- A migration of the stored file.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `scratchpads`: five scratchpads instead of three, 20 notes instead of 10, and a character counter instead of the note count in the add field and in the note being edited. Two requirements are renamed so their names no longer carry the numbers.

## Impact

- Layers: `server` (the shared limits and the hub's store) and `web` (the panel). No external service.
- Contracts: the `scratchpads` WebSocket message carries five lists instead of three (the `Scratchpads` type), and `ScratchpadAddRequest.pad` accepts the storage positions 0 to 4. No new endpoint, environment variable or migration.
- `shared/scratchpads.ts` and `shared/types.ts`: the number of scratchpads, the note limit and the `Scratchpads` type.
- `server/src/scratchpads.ts` and its tests: five scratchpads, 20 notes, reading a three-scratchpad file.
- `web/src/components/Scratchpads.tsx`, `web/src/state.ts`, `web/src/styles.css`: the colours and their order, the counter.
- Stored data: `dataDir/scratchpads.json` in production holds three scratchpads; it is read as five without a migration.
- README, `docs/FEATURES.md`, changelog.
