# Proposal

GitHub issue: [Issue #41](https://github.com/SantiagoSchez/tmux-web-bridge/issues/41), from suggestion R1-03 of the review of PR #40.

## Why

When a screen of the file viewer closes, the element that had the focus goes away with it and the focus falls to the page. A keyboard or screen reader user who opened a diff from «Ficheros cambiados» has to find their place in the list again after every diff. Since the screens now stack (PR #40), the screen below is still mounted, and the element that opened the closed screen is still there to get the focus back.

## What Changes

- Closing a screen of the file viewer, by any means, gives the focus back to the element that had it when that screen was opened: the file of «Ficheros cambiados» that opened a diff, or «Ver el fichero» in the diff that opened a file.
- The screen below does not scroll when it gets the focus back.
- When nothing had the focus as the screen opened (a browser that does not focus a button on click, as Safari does), nothing is focused on closing.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `file-viewer`: a new requirement, «Going back gives the focus back to what opened the screen».

## Impact

- Layers: `web` only (`web/src/components/Files.tsx`).
- No API, payload, shared type, data model or environment variable changes. No external service is touched.

## Non-goals

- Giving the focus back when the whole viewer closes (to the «+12 −3» button of the window's header, or to the terminal a path was opened from).
- Moving the focus into a screen when it opens.
