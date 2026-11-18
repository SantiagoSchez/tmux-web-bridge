# Design

## Context

`WindowView` mounts one `TerminalView` per space (`key={host.id}:{session.id}`). `TerminalView` calls `term.focus()` once, at the end of `createTerminal()`, and only when `isTouch` is false. Switching to another window or pane of the same space runs the retarget effect, which sends `sel` over the terminal's socket and does not touch the focus. The click on the list's button has already moved the focus to that button, so it stays there.

Every place that opens a window on a user's action calls `openWindow(host, window, pane?, replace?)` of `web/src/router.ts`: `Tree.tsx` (windows and cards), `Rail.tsx`, `Grid.tsx`, `Palette.tsx`, `Activity.tsx`, `LimitsBar.tsx`, `Assist.tsx`, `Automations.tsx`, `Scratchpads.tsx`, `WindowView.tsx` (pane tabs and the window that follows a closed one), `shortcuts.ts` (Ctrl+1…9) and `menus.ts` (`openWindowWhenReady`, `openSessionWhenReady`, used after creating a window or a space and from Trello). `openWindow` returns early when the hash is already the target, which is why a click on the window already open does nothing.

The panel already has a way to hand the terminal the focus: the `terminalFocus` signal of `web/src/state.ts` (`{ pane, at }`), which the scratchpads set after a paste and which `TerminalView` follows with `if (refocus?.pane === pane.id && !isTouch) termRef.current?.focus()`. The `at` timestamp makes every request a new value, so the same pane can be asked twice in a row.

Push notifications and the browser's back and forward buttons change the route through `navigate()` or `popstate`, not `openWindow`; they stay out of this change (see the proposal's non-goals).

## Goals / Non-Goals

**Goals:**

- One place decides that opening a window focuses the terminal, so a new caller of `openWindow` gets it without doing anything.
- Reuse `terminalFocus` and the `isTouch` check it already has, instead of a second focus path.

**Non-Goals:**

- Focusing the terminal on routes changed through `navigate()` or `popstate`.
- Any change to the terminal's mount, sockets or retarget logic.

## Decisions

### D1. `openWindow` requests the focus through `terminalFocus`

`openWindow` sets `terminalFocus.value = { pane: null, at: Date.now() }` on every call, including the call whose hash is already the target, before its early return. `TerminalView` follows it as it does today; the request reaches whichever terminal is shown once the route has changed.

Alternatives considered:

- Focusing in the retarget effect of `TerminalView` (on `window.id`/`pane.id` change). It misses the click on the window already open, where nothing changes, and it would also fire on route changes through `popstate`, which are out of scope.
- Calling `focus()` in each caller's `onClick`. Fourteen call sites to keep in step, and a new one would forget it; the terminal is not mounted yet when the call is made.

Consequences: `router.ts` imports `terminalFocus` from `state.ts`. `state.ts` does not import `router.ts`, so there is no import cycle.

### D2. `terminalFocus.pane` accepts `null` for "the terminal shown"

The signal's type becomes `{ pane: string | null; at: number } | null`. `null` means the terminal of the window the panel shows, whatever its pane; a pane id keeps targeting that pane, as the scratchpads need. `TerminalView`'s effect focuses when `refocus && (refocus.pane === null || refocus.pane === pane.id) && !isTouch`. `openWindow` cannot always name the pane (most callers pass none, and `paneOf` decides it at render time), and only one `TerminalView` is mounted at a time, so `null` is unambiguous.

Alternative considered: a second signal for window openings. It would duplicate the effect and the `isTouch` guard for the same outcome.

### D3. The terminal mounted for another space keeps focusing itself

When the window belongs to another space, `WindowView` mounts a new `TerminalView`. Its `terminalFocus` effect runs at mount, before `createTerminal()` (which waits for the fonts), finds no terminal and does nothing; `createTerminal()` then focuses the terminal as it does today. No change is needed there, and the stale value the signal keeps is harmless for the same reason.

### D4. An open sheet or dialog keeps the focus

A window-opening request (`pane: null`) is skipped while a sheet or a dialog is open, that is, while the document holds an element with `aria-modal="true"`: every sheet and dialog of the panel is a `Sheet`, which renders `role="dialog" aria-modal="true"`. The page below a `Sheet` is not `inert`, so without this check the terminal would take the keys typed into a sheet the owner opened while `openWindowWhenReady` was still waiting for the window. The callers that open a window from a sheet (the search, Automations, Trello, the new window and new space dialogs) close it before calling `openWindow`, and the render that removes it runs before the effect, so they still get the focus. The same check applies to the focus the terminal takes at the end of `createTerminal()`, which is how a window of another space gets it (D3); both go through one helper of `TerminalView`. Pane requests (`pane` set by the scratchpads) keep today's behaviour.

Alternative considered: reading the `sheet`, `dialog` and `paletteOpen` signals. The file viewer's screens and the quick note have their own state, and a new layer would have to be added to the list; the `aria-modal` attribute covers every `Sheet` at once.

## Risks / Trade-offs

- [`openWindowWhenReady` opens the window up to 5 s after the request, and the focus moves with it] → It only runs for a window the owner just asked to create or launch, where typing into it is the next step; a sheet or dialog opened in the meantime keeps the focus (D4).
- [A touch laptop counts as touch (`isTouch` includes `navigator.maxTouchPoints > 0`) and gets no focus] → Same rule the terminal already follows when it is created; changing it is out of scope.
- [`web` has no test runner, so no automated test covers the focus] → The behaviour is checked by hand in a browser against an isolated hub (tasks), on a wide viewport with a mouse and on a phone-sized touch viewport.

## Migration Plan

None: a panel change shipped with the next deploy; rolling back is reverting the commit.
