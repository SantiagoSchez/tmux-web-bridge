# Proposal

GitHub issue: [Issue #70](https://github.com/SantiagoSchez/tmux-web-bridge/issues/70), «Llevar la vista de ventanas al menú «Más vistas» y dejar solo la flecha en la barra». The refinement in its body holds the decisions this proposal follows.

## Why

On a phone, the top bar of the list is full: the windows view's button, the «Más vistas» chevron, the bell, Trello, the connections and the settings. The windows view is opened rarely enough to live in the menu next to it, as «Actividad» already does, which frees the width of one button.

## What Changes

- The top bar loses the windows view's button (the grid icon); the «Más vistas» chevron is the only entry to the views.
- The «Más vistas» menu lists «Vista de ventanas» first and «Actividad» second. While the windows view is open, the first entry reads «Cerrar la vista de ventanas» and closes it, as the old button did.
- The chevron is highlighted while the windows view is open, as the old button was.
- The same on a phone and on a computer. The bell, Trello, the connections and the settings do not change.
- Contract changes: none. No API, message or job payload, data, migration or environment variable changes; the panel's `#grid` route stays.

## Capabilities

### New Capabilities

- `top-bar-views`: how the panel's top bar of the list gives access to the views that do not fit in it (the windows view and «Actividad») and shows which one is open.

### Modified Capabilities

None.

## Impact

- Layers: `web` only (`web/src/components/Header.tsx` and its styles in `web/src/styles.css`).
- Not touched: `server`, `shared`, `host-kit`, `trello-extension`. No external service.

## Non-goals

- Moving the bell, Trello, the connections or the settings into the menu.
- A keyboard shortcut for the windows view.
- Changes inside the windows view, which keeps its own «Volver a la lista» and «Cerrar la vista de ventanas» buttons.
