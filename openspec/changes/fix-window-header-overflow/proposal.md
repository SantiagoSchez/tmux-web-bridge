# Proposal

Fixes [Issue #81](https://github.com/SantiagoSchez/tmux-web-bridge/issues/81).

## Why

On a phone, the header of an open window does not fit when the pane's repository has an OpenSpec change with tasks and changed files. Back, the title, one «☑ 116/121 (95 %)» button per change, the folder button, the «+18,8k −1,5k» button and «⋯» never shrink, so on a screen about 400 px wide the title gets no room, «⋯» goes past the right edge and cannot be pressed, and Chrome widens the whole page to fit the header. Every sheet opened over that page, such as «Ficheros cambiados», is then cut on the right.

## What Changes

- The window header never grows wider than the room it is given, so it no longer widens the page, and «⋯» always stays on screen.
- When the header is narrow, a change's button shows only «☑» and the percentage («☑ 95 %»). Its accessible name keeps the full count. A wide header shows «☑ 116/121 (95 %)» as today.
- When the header is narrow, the ± button shows its two counts on two short lines («+18,8k» over «−1,5k»), so it takes about half its width.
- The change buttons sit in a group that gives up its room before anything else: a button that does not fit whole cuts its text with «…», and a button with no room at all is left out of the header. Back, a minimum of the window's name, the folder, the ± button and «⋯» always show.
- A shared helper writes the percentage alone, «95 %», and `taskProgress` builds on it, so both forms round the same way.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `change-progress`: the requirement «The open window's header opens each change's tasks» gains the short label of a narrow header, and a new requirement guarantees that the header fits its width (with the ± button on two lines when narrow).

## Impact

- Layers: `web` (`web/src/components/WindowView.tsx`, `web/src/components/Files.tsx`, `web/src/styles.css`) and `server` only through `shared/change-progress.ts` and its test `server/src/change-progress.test.ts`.
- No API, payload, message, data model or environment variable changes. No external service is touched.

## Non-goals

- Changing what the folder button shows, the ± button's wide form, or moving any button into the «⋯» menu.
- Making the header wrap onto two lines.
- Changing the list's rows, the «Pendientes» cards or the hover tooltip, which keep the full «☑ 7/23 (30 %)».
