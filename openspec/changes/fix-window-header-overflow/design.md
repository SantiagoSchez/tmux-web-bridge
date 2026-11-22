# Design

## Context

`WindowView.tsx` renders the header `.wv-head` as one flex row: back (`.icon-btn`), the title (`.wv-title`, `flex: 1; min-width: 0`), one `.changes-btn.wv-change` per change with tasks, `FolderButton`, `ChangesButton` and the «⋯» `.icon-btn`. Every button has `flex-shrink: 0` and `white-space: nowrap` (`styles.css`, `.changes-btn` and `.icon-btn`). The header's minimum width is therefore the sum of its buttons. When that sum passes the screen width, the header overflows `.wv`, the document becomes wider than the viewport, and mobile Chrome widens its layout viewport to fit it. `.sheet-backdrop` is `position: fixed; inset: 0`, so every sheet takes that wider width too (see proposal.md, Why).

On the reported phone (411 px wide), the buttons measured: back 44, «☑ 116/121 (95 %)» about 137, folder 44, «+18,8k −1,5k» about 115, «⋯» 44, plus 4 gaps of 4 px and 12 px of padding, about 412 px before the title.

## Goals / Non-Goals

**Goals:**

- The header can never add width to the page, whatever it holds.
- The short label depends on the header's own width, not on the device type, so a narrow window view on a computer gets it too.

**Non-Goals:**

- A JavaScript measurement of the header (`ResizeObserver`): CSS alone covers it.

## Decisions

### D1. The header is a size container and its change buttons switch label by container query

- **Context**: the label has to change with the header's width. The panel already uses a container query for the explorer's two columns, rather than `isDesktop`.
- **Decision**: `.wv-head` gets `container-type: inline-size`. Each change button renders two spans, the full progress («116/121 (95 %)») and the percentage alone («95 %»). `@container (max-width: 560px)` hides the full one and shows the short one. 560 px is the width at which the full label with one change, the ± button and a title of about 100 px still fit (about 510 px).
- **Consequences**: inline-size containment also makes the header's width independent of its content, so it can no longer push the page wider even if a later button is added. This is the guarantee of the new requirement, and it holds without the label switch.
- **Alternatives**: a media query on the screen width (wrong on a computer with a narrow window view); `isDesktop` in the component (same problem, and a re-render on resize).

### D2. The change buttons are the only buttons that shrink

- **Context**: with two changes, or a screen of 360 px, even the short labels may not fit.
- **Decision**: `.wv-change` gets `flex-shrink: 1; min-width: 0` and its text span `overflow: hidden; text-overflow: ellipsis`. `.wv-title` gets a minimum width of 64 px, so the change buttons give up their room before the name disappears. Back, folder, ± and «⋯» keep `flex-shrink: 0`.
- **Consequences**: in the worst case a change button shows only «☑ …». Its accessible name and `title` keep the change's name and full progress, so nothing is lost for a screen reader or a hover.
- **Alternatives**: `overflow: hidden` on the header alone would keep the page narrow but cut «⋯» off, which is the button the owner needs most.

### D3. The percentage alone comes from `shared/change-progress.ts`

- **Context**: `taskProgress` writes «7/23 (30 %)» and rounds down. Writing «30 %» in the component would copy that rounding.
- **Decision**: a new `taskPercent(tasks)` in `shared/change-progress.ts` returns «30 %», and `taskProgress` uses it. It is tested from `server/src/change-progress.test.ts`, as the web standards ask for shared logic.
- **Consequences**: both labels always agree on the rounding.

## Risks / Trade-offs

- [Container queries need Chrome 105 or Safari 16] → the explorer already relies on them; older browsers keep the full label, and only the shrink rules of D2 protect the page there.
- [The 560 px threshold is an estimate from one phone] → the manual check at 360, 411 and a wide width in tasks.md confirms it; it is one CSS value to adjust.
