# Design

## Context

See proposal.md for the motivation and specs/ for the behaviour.

The window list (`web/src/components/Tree.tsx`) renders three kinds of rows: `SessionGroup`'s header, `WindowRow` and `SoloSession`. Only `WhereLine` (the second line) carries native `title`s; the rail (`web/src/components/Rail.tsx`) puts the same text in each pane button's `aria-label` and `title`. The panel already has one fixed-position tooltip, `LimitTip` of `LimitsBar.tsx`, which measures itself in a layout effect, clamps itself inside the screen and closes on pointerdown elsewhere, Escape, scroll and resize. `web` has no test runner: pure logic it needs and that deserves a test lives in `shared/` and is tested from `server/src/<module>.test.ts`.

Launching on a card goes through `launchFromRequest` in `server/src/index.ts` for both `/api/ext/launch` (extension) and `/api/trello/launch` (panel drawer). The request carries the card's id, not its title. `launchTask` (`server/src/tasks.ts`) prepares the worktree (bounded at 25 s), creates the window with the requested name and pins it (`@name_pinned`), and types `taskCommand(...)` with the prompt into the shell. After it, `TrelloService.afterLaunch` reads the card (`trello.card`, 15 s timeout per Trello call), moves it to Doing and comments. Chrome drops the extension's call at 30 s. The host kit never renames a pinned window (`tmux-window-title.sh`, `cmd_refresh`).

## Goals / Non-Goals

**Goals:**

- One tooltip mechanism, mounted once, that any row of the list or the rail can use.
- The tooltip's content and placement as pure functions in `shared/`, so they are unit-tested.
- The card read before launching never makes a card launch slower than the slowest of the card read and the worktree preparation.

**Non-Goals:**

- A general tooltip component for the rest of the panel (buttons keep their native `title`).
- Changing `LimitTip`.

## Decisions

### D1. One hover tooltip driven by a module-level signal

**Context.** Four places need the same delayed tooltip, and each row re-renders often (every tree broadcast).

**Decision.** A new `web/src/components/HoverTip.tsx` holds a module-level signal `hoverTip` (`{ key, anchor: DOMRect, render: () => ComponentChildren } | null`), a hook `useHoverTip(key, render)` that returns `onPointerEnter` / `onPointerLeave` handlers, and the `HoverTip` component, mounted once in `App.tsx` next to `Dialogs`. `onPointerEnter` starts a 1000 ms timer only when `e.pointerType === 'mouse'`; when it fires, it stores the target's rect and the render function. `onPointerLeave` clears the timer and, when the open tip is its own `key`, closes it. The handlers go on the row's container (`li.win-row`, `.session-head`, the solo row's `.win-row`, the rail's button), so the tip stays open over the row's action buttons.

**Alternatives.** A tooltip per row (as `LimitTip` per meter): a timer and listeners in every row of the list for one visible tip. `matchMedia('(hover: hover)')` alone: hybrid laptops with a touch screen report hover, and Android Chrome sends compatibility mouse events after a tap; `pointerType` tells the actual input.

**Consequences.** Only one tip can be open; a new one replaces the old one.

### D2. The tooltip resolves what it shows at render time, by id

**Decision.** The render function captures the host id and the window (or session, or pane) id, not the objects, and looks them up in `hosts` each render. `HoverTip` reads that signal, so it re-renders on every broadcast (requirement «The details stay current»); when the lookup finds nothing, it closes. Times use `ago()` of `time.ts`, which follows `clock`.

**Alternatives.** Capturing the `WindowInfo` at hover time: the tip would show a stale state until the mouse moves.

### D3. The details as a pure model in `shared/window-details.ts`

**Decision.** `windowDetails(window, opts: { home, hostName? })` returns `{ name, state?: { icon, label, since? }, host?, panes: { index, active, command, place?: { kind: 'worktree' | 'branch', name }, path, account? }[] }` and `spaceDetails(session)` returns `{ name, windows }`. The components only render it. `homePath` (`shared/folders.ts`) shortens the folder; the state labels move from `web/src/state.ts` (`STATE_LABEL`) into `shared/` so the model can use them, and `state.ts` re-exports them. A single-pane window omits the active mark. Tested in `server/src/window-details.test.ts`.

**Alternatives.** Building the lines inside the JSX: no way to test which details show and which are left out.

### D4. Placement: beside the anchor, clamped to the screen

**Decision.** `tipPosition(anchor, size, viewport)` in `shared/tip-position.ts` puts the tip 8 px to the right of the anchor, aligned with its top; when it does not fit on the right, to the left; then clamps it vertically and horizontally with an 8 px margin. `HoverTip` renders hidden, measures in `useLayoutEffect` (as `LimitTip`) and then places it. The tip is `position: fixed`, `pointer-events: none`, `role="tooltip"`, and wraps long words (`overflow-wrap: anywhere`) inside a `max-width` so nothing is cut. Tested in `server/src/tip-position.test.ts`.

### D5. Closing

**Decision.** Besides `onPointerLeave`, `HoverTip` closes on `pointerdown` (capture, anywhere), `keydown` Escape, `scroll` (capture) and `resize`, as `LimitTip` does, and on the window's `blur` (switching to another app leaves no tip behind). `pointer-events: none` means a click lands on the row below and opens the window as today.

### D6. Native titles removed where the tip covers

**Decision.** `WhereLine` loses both `title`s; the rail's pane buttons keep `aria-label` and lose `title`; the session header's toggle loses `title` (its `aria-expanded` already states the fold). Icon-only buttons inside the rows (`+`, `…`, `×`) keep theirs: they do not cut text and stay out of the tip's anchor's text.

### D7. The hub reads the card in parallel with the launch and passes the title to `launchTask`

**Context.** Reading the card after the 25 s worktree preparation would push a slow Trello call past Chrome's 30 s.

**Decision.** A new `TrelloService.readCard(id)` returns `Promise<CardRead>`, `{ card: TrelloCard } | { error: string }`, and never rejects. `launchFromRequest` starts it without awaiting it and passes `launchTask` a new optional third argument, `opts: { card?: Promise<TrelloCard | null> }` (the read mapped to its card, or `null` when it failed). `launchTask` awaits it only right before typing the command, after the worktree is prepared and the window created, so the launch takes the longer of the two, not their sum. `afterLaunch(read, result)` then takes that same `CardRead` instead of the id: with an error it returns the warning «No se pudo leer la tarjeta: …» as it does today, so that case stays tested in `trello.test.ts`. The argument is internal to the hub: `ExtLaunchRequest` does not change, and automations and the panel's `launchTask` op pass nothing.

**Alternatives.** Adding the card's title to `ExtLaunchRequest`: a payload change for the extension, which would need a rebuild and a new release, and a title the client could forge. Reading the card before `launchTask`: the sum of both timeouts can exceed 30 s.

### D8. The rename instruction

**Decision.** `cardRenameInstruction(title)` in `server/src/tasks.ts` returns, in Spanish:

> Antes de nada, cambia el nombre de la ventana de tmux en la que estás por un resumen del título de esta tarjeta de Trello: «<title>». Sin el número de la tarjeta y de 30 caracteres como máximo. Ejecuta: tmux rename-window -t "$TMUX_PANE" '<resumen>'

The title has its control characters replaced by spaces and is cut to 200 characters (Trello titles can reach 16 384). `launchTask` joins it and the prompt with a blank line; with an empty prompt it is typed alone. `MAX_PROMPT` still applies to the user's prompt only. `$TMUX_PANE` is a literal in the typed text (`shellWord` quotes it) and is expanded by Claude's own shell, so the target is the pane Claude runs in and tmux resolves its window. The window is already pinned by the launch, so the kit keeps the agent's name.

**Alternatives.** `tmux-window-title.sh rename`: the agent would need the kit's path, which differs per machine. Plain `tmux rename-window` with no target: renames the client's current window, which may be another one when the owner is looking elsewhere.

## Risks / Trade-offs

- [Without «Saltar permisos», Claude asks permission before running `tmux rename-window`] → the first action of every card task waits for one approval; the owner can allow `Bash(tmux rename-window:*)` in their Claude settings. Documented in the changelog entry.
- [Claude's sandbox or a missing `TMUX_PANE` makes the command fail] → the window keeps its launch name, as today; nothing else depends on the rename.
- [The agent ignores or delays the instruction] → same fallback; the instruction comes first in the prompt to make it the first step.
- [The card read now happens on every card launch before the command is typed] → it was already made after every launch; it runs in parallel with the worktree preparation, so it adds time only when Trello is slower than the preparation, at most 15 s.
- [A tip anchored to a row that re-renders] → the anchor rect is taken once when the timer fires; the list does not move under a resting mouse except on scroll, which closes the tip.

## Migration Plan

No data or contract migration. The hub deploys from `master`; the extension needs no new build. Rolling back is reverting the merge.
