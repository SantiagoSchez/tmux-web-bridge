# Design

## Context

`WindowView.tsx` renders the header `.wv-head` as one flex row: back (`.icon-btn`), the title (`.wv-title`, `flex: 1; min-width: 0`), one `.changes-btn.wv-change` per change with tasks, `FolderButton`, `ChangesButton` and the «⋯» `.icon-btn`. Every button has `flex-shrink: 0` and `white-space: nowrap` (`styles.css`, `.changes-btn` and `.icon-btn`). The header's minimum width is therefore the sum of its buttons. When that sum passes the screen width, the header overflows `.wv`, the document becomes wider than the viewport, and mobile Chrome widens its layout viewport to fit it. `.sheet-backdrop` is `position: fixed; inset: 0`, so every sheet takes that wider width too (see proposal.md, Why).

On the reported phone (411 px wide), the buttons measured: back 44, «☑ 116/121 (95 %)» about 137, folder 44, «+18,8k −1,5k» about 115, «⋯» 44, plus 4 gaps of 4 px and 12 px of padding, about 412 px before the title.

## Goals / Non-Goals

**Goals:**

- The header can never add width to the page, whatever it holds.
- The short label depends on the header's own width, not on the device type, so a narrow window view on a computer gets it too.

**Non-Goals:**

- Showing every change button on any screen: D2 leaves out those with no room.
- A JavaScript measurement of the header (`ResizeObserver`): CSS alone covers it.

## Decisions

### D1. The header is a size container and its change buttons switch label by container query

- **Context**: the label has to change with the header's width. The panel already uses a container query for the explorer's two columns, rather than `isDesktop`.
- **Decision**: `.wv-head` gets `container-type: inline-size`. Each change button renders two spans, the full progress («116/121 (95 %)») and the percentage alone («95 %»). `@container (max-width: 560px)` hides the full one and shows the short one. 560 px is the width at which the full label with one change, the ± button and a title of about 100 px still fit (about 510 px).
- **Consequences**: containment alone does not stop the page from widening: content that overflows a container still adds to the document's scrollable width (measured at 360 px with two changes: the page was 422 px wide). The header also gets `overflow: hidden` as the last guard, so whatever a later button does, the page keeps the screen's width. D2 and D4 make the buttons fit, so that guard cuts nothing in the cases the specs list.
- **Alternatives**: a media query on the screen width (wrong on a computer with a narrow window view); `isDesktop` in the component (same problem, and a re-render on resize).

### D2. The change buttons sit in a group that gives up its room first

- **Context**: at 360 px, even with every change button at its 44 px touch target, the header did not fit (measured: one change about 20 px over, two changes 62 px over).
- **Decision**: the change buttons go in a `.wv-changes` group, rendered only when there is at least one. The group is a flex item with `flex: 0 1 auto; min-width: 0`, and a wrapping flex row one button high with `overflow: hidden`, so a button that does not fit on the first line wraps to a hidden one and is left out whole, never shown in half. Inside it, `.wv-change` keeps `flex-shrink: 1` and the `--tap` minimum width of `.changes-btn`, and its text span `min-width: 0; overflow: hidden; text-overflow: ellipsis`, so a lone button wider than the group cuts its text. `.wv-title` keeps `flex: 1` with a minimum width of 64 px: since its basis is 0, the group shrinks before the name does. Back, folder, ± and «⋯» keep `flex-shrink: 0`.
- **Consequences**: on a very narrow screen with several changes, some change buttons are not in the header; their progress still shows in the list's row and the «Pendientes» cards. A shown button keeps its accessible name and `title` with the change's name and full progress.
- **Alternatives**: one «☑ 2» button opening a menu of the changes (more work, and a different way to open the tasks on a phone); a horizontally scrolling group (it would fight the header's swipe between windows).

### D3. The percentage alone comes from `shared/change-progress.ts`

- **Context**: `taskProgress` writes «7/23 (30 %)» and rounds down. Writing «30 %» in the component would copy that rounding.
- **Decision**: a new `taskPercent(tasks)` in `shared/change-progress.ts` returns «30 %», and `taskProgress` uses it. It is tested from `server/src/change-progress.test.ts`, as the web standards ask for shared logic.
- **Consequences**: both labels always agree on the rounding.

### D4. A narrow header shows the ± counts on two lines

- **Context**: «+18,8k −1,5k» takes about 108 px, the widest fixed button.
- **Decision**: `ChangesButton` (`Files.tsx`) gives its counted form the class `changes-lines`. Under the same `@container (max-width: 560px)` it stacks the two counts in a column, with a smaller font and line height, about 63 px wide.
- **Consequences**: on a phone the button reads «+18,8k» over «−1,5k». Its accessible name does not change. The clean form (the diff icon) is already 44 px and is not affected.

## Risks / Trade-offs

- [Container queries need Chrome 105 or Safari 16] → the explorer already relies on them; older browsers keep the long forms, and the group of D2 and the header's `overflow: hidden` still keep the page at the screen's width.
- [The 560 px threshold is an estimate from one phone] → the manual check at 360, 411 and a wide width in tasks.md confirms it; it is one CSS value to adjust.
