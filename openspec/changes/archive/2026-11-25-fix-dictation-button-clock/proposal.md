# Proposal

GitHub issue: [#85](https://github.com/SantiagoSchez/tmux-web-bridge/issues/85).

## Why

With the 🎤 button in its hold mode, the default, the button turns red and shows `● 0:00`, and the clock never moves while the owner talks. The recording itself works: on release the text reaches the terminal. The owner cannot tell how long they have been talking, nor that the button is listening at all past the first second.

After the release, while the hub transcribes and cleans up the text, the button shows a pulsing «…» that does not read as «processing». The owner asked for a loader in its place.

## What Changes

- The recording clock of the 🎤 button advances every second while a dictation records, in both button modes (hold and tap). Today only the tap mode's clock moves: the hold mode's button does not re-render on the clock's tick.
- While a dictation is being transcribed (from the release, or the tap that sends, until the text arrives or the dictation fails), the button shows a spinning ring in place of the 🎤, on the button's normal background, instead of the pulsing «…». It stays disabled, as now.
- When the dictation ends, the button shows its idle label again: 🎤, or the label the key bar configures.

## Capabilities

### New Capabilities

- `dictation-button`: what the 🎤 button of a window shows during a dictation: its recording clock and its transcribing state.

### Modified Capabilities

None. `keyboard-shortcuts` mentions dictation only for its shortcut, which this change does not touch.

## Non-goals

- The recording, the sending, the transcription and the cleanup themselves, which work.
- The dictation shortcut and the push-to-talk gesture on the keyboard.
- The button's look while recording (red with `● m:ss`) and the hold mode's «✕ suelta».
- A progress figure for the transcription: the hub sends none, and the ring says only that it is working.

## Impact

- Layers: `web` only (`web/src/components/Mic.tsx`, `web/src/styles.css`). No change to `server`, `shared`, `trello-extension` or `host-kit`.
- No contract change: no API or websocket payload, no hub setting, no environment variable, no stored data.
- No external service is touched.
