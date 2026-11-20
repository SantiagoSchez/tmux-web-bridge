# Design

## Context

See proposal.md for the motivation and specs/top-bar-views/spec.md for the behaviour.

`Header` (`web/src/components/Header.tsx`) draws the top bar of the list. Its `.views-group` holds two buttons: the windows view's (`IconGrid`, `toggleGrid`, highlighted with the `on` class and `aria-pressed` while `route.value.name === 'grid'`) and the narrow chevron (`.chevron-btn`, `aria-haspopup="menu"`), whose `viewsMenu()` opens a `menu` dialog (`Dialog` in `web/src/state.ts`) titled «Más vistas» with «Actividad» only. `toggleGrid` (`web/src/router.ts`) opens the grid or, when it is open, goes back to where the owner was. The windows view itself has «Volver a la lista» and «Cerrar la vista de ventanas», both calling `toggleGrid`.

## Goals / Non-Goals

**Goals:**

- One button narrower in the bar, with the same two views a tap further.

**Non-Goals:**

- No change to the router, the `menu` dialog or the windows view.

## Decisions

### D1. The chevron's menu opens the windows view through `toggleGrid`

**Context:** The menu entry must open the windows view or, while it is open, close it as the old button did.

**Decision:** `viewsMenu()` builds its first item from the route when the menu opens: `Vista de ventanas` with `IconGrid`, or `Cerrar la vista de ventanas` while `route.value.name === 'grid'`, both running `toggleGrid`, then «Actividad» as today. Turned down: a separate `openGrid`/`closeGrid` pair, which would duplicate the history handling `toggleGrid` already has.

**Consequences:** Closing from the menu behaves as the grid's own buttons do: back to where the owner was (the list when opened from it).

### D2. The chevron carries the pressed state and keeps its narrow width

**Context:** The owner chose to keep only the chevron, the narrowest of the two buttons, and to have it highlighted while the windows view is open.

**Decision:** The chevron takes over the old button's `on` class and `aria-pressed` while the grid is open, keeps `aria-label`/`title` «Más vistas» and `aria-haspopup="menu"`. `.views-group` and its negative margin go away (nothing sits next to the chevron any more); its width stays the one `.chevron-btn` has (22 px, 18 px on narrow screens). `IconGrid` stays in `icons.tsx` for the menu item.

**Consequences:** The bar saves the width of one button (32 px on a phone). The chevron's tap target is narrow; its height is the bar's full `--tap`. The highlight and the «Cerrar la vista de ventanas» entry show only on a computer, where the list's bar stays beside the windows view; on a phone the windows view covers the bar and closes with its own button, as it already did with the old grid button.

## Risks / Trade-offs

- [The windows view is one tap further] → it was the owner's choice; the menu opens with one tap and lists it first.
- [A narrow tap target] → the chevron keeps the bar's full height, and the owner chose it for its width; widening it later is a CSS change.

## Migration Plan

None: a panel-only change, deployed with the usual merge into `master`.
