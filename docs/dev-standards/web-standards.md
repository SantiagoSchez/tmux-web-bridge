# web standards

The conventions of the `web` layer (web/**). The principles in [base-standards.md](base-standards.md) apply first; this document adds what is specific to this layer. Keep it short and concrete: a rule here is something a reviewer can check, and something the code does not already show. What the manifests, the directory tree or the linter say is left out, where it cannot go stale.

## Stack

- UI: `preact` with `@preact/signals` for shared state and `preact/hooks` for local state. No router, store or component library.
- Terminal: `@xterm/xterm` and its `@xterm/addon-*` packages.
- Markdown in the file viewer: `marked` + `dompurify`, loaded with a dynamic `import()` the first time a Markdown file is shown.
- Build: `vite` with `@preact/preset-vite`. In dev, Vite proxies `/api` and `/ws` to the hub at `HUB_URL`. The hub serves the built panel.
- PWA: `web/public/manifest.webmanifest` and a hand-written service worker `web/public/sw.js` (plain JS, not bundled): Web Push, notification actions, no offline cache.
- Styling: one hand-written stylesheet, `web/src/styles.css`, with Catppuccin Frappé (dark) and Latte (light) as CSS custom properties. No CSS framework, preprocessor or CSS-in-JS.

## Structure

- `web/src/components/`: one PascalCase `.tsx` file per screen or feature (`Settings.tsx`, `Machines.tsx`, `TerminalView.tsx`, `Trello.tsx`…), which may hold several related components. `icons.tsx` holds the inline SVG icons; `Sheet.tsx` holds `Sheet`, the bottom sheet or centred card every dialog and side panel uses (a screen opened over another of the same flow, as in the file viewer, is a second `Sheet` marked `stacked`, with the one below `inert`, so the one below keeps its state and scroll; record the focused element when the screen opens, before the one below turns inert, and focus it again with `preventScroll` when the screen closes, as `FileViewerSheet` does); `Dialogs.tsx` holds the dialog renderer and the toasts.
- `web/src/*.ts`: camelCase modules with the non-visual logic and global signals (`state.ts`, `ws.ts`, `prefs.ts`…).
- `web/public/`: files served as is (fonts with their licences, icons, manifest, `sw.js`).
- Types and pure logic shared with the hub come from `shared/` (`../../shared/types`, `../../../shared/keybar`…), imported without a file extension.
- Named exports only; no default exports.

## Conventions

- Code, identifiers and comments are in English; every text the user sees is in Spanish (es-ES, `tú`), written inline in the JSX (there is no i18n catalogue). UI names are quoted with «» and menu paths written `Ajustes › Máquinas`. `index.html` is `lang="es"`.
- Payloads and messages exchanged with the hub use the types of `shared/types.ts` (`ClientMessage`, `ServerMessage`, `ActionOp`, `HubSettings`, `MachinesInfo`…); none is redeclared here.
- Shared state lives in module-level signals (`signal`, `computed`) exported from `state.ts`, `prefs.ts`, `router.ts` or the feature module that owns them; components read `.value` during render and re-render on change. Component-local state uses `useState`.
- Hub state signals (`hosts`, `hubSettings`, `machinesInfo`, `accountsInfo`…) are written by `ws.ts` when a `ServerMessage` arrives. A component may update one optimistically right before sending the change (as `KeybarSettings.tsx` does); the hub's broadcast then confirms it.
- One app websocket, `hub` in `ws.ts`, reconnects on its own and re-sends the view, the presence and the push endpoint. Tree actions use `hub.action<T>(hostId, op)`, which returns the result and shows a failure as an error toast; account actions use `hub.account(op)`; hub settings are changed with `hub.send({ t: 'settings', settings: { … } })`, with no reply.
- REST calls (`/api/*`) use `fetch`. Components call them through `api<T>(path, body?)` of `web/src/api.ts`: GET without a body, POST with a JSON one, and on a non-OK status an `Error` with the server's `error` text (and the whole answer as `data`). Never a local copy of it. Query strings are built with `URLSearchParams` or `encodeURIComponent`.
- Errors reach the user as toasts: `toast(err.message, 'error')`; confirmations as `toast('…')`. Questions and choices use the `dialog` signal (`prompt`, `confirm`, `menu`…), rendered by `Dialogs.tsx`; side panels use the `sheet` signal and the `Sheet` component.
- Per-device preferences live in `prefs` (`prefs.ts`), persisted to `localStorage` under `tmux-web-bridge:prefs` and changed with `setPref(key, value)`; settings every device shares belong to the hub (`HubSettings`). Every `localStorage` access is wrapped in `try`/`catch` (private mode).
- Routing is the hash: `#/`, `#/grid`, `#/h/<host>/w/<window>[/p/<pane>]` (tmux ids without `@`/`%`); navigate with `navigate()`, `openWindow()` and `goHome()` from `router.ts`, which keep Android's back button natural.
- A window is opened with `openWindow()`, even the one already open: on a computer it hands the terminal the keyboard (`terminalFocus` with `pane: null`), unless a `Sheet` is open. A new place that opens a window calls it and adds no `focus()` of its own; `navigate()` moves no focus.
- The pane a window works on is `paneOf(window, routePane)` of `state.ts` (the route's pane, else the active one, else the first); whatever acts on the open pane (the terminal, the scratchpads' paste) uses it instead of its own rule.
- Layout follows `isDesktop` (`prefs.ts`, `min-width: 900px`) in code and media queries in CSS (`max-width: 600px`, `hover`/`pointer`). Touch targets use `--tap` (44px).
- CSS: colours, fonts, radius and safe areas come from the custom properties in `:root` (`var(--text)`, `var(--surface0)`, `var(--mono)`…), redefined for the light theme under `:root[data-theme='light']`, set by `theme.ts` (and by the inline script in `index.html` before first paint). Class names are kebab-case and set with `class`, never `className`. Inline `style` is for computed values only (positions, CSS variables such as `--per-row`).
- Accessibility: icon-only buttons carry `aria-label` or `title`; decorative SVGs and glyphs are `aria-hidden="true"`; custom widgets set their `role` (`tablist`, `tab`, `tooltip`…).
- HTML from content (rendered Markdown) is sanitised with DOMPurify before `dangerouslySetInnerHTML`; the only other uses are the hub's own QR SVG and that sanitised HTML.
- Fire-and-forget promises are marked with `void` (`void hub.action(…)`).
- Terminal link providers (`registerLinkProvider` in `TerminalView`) answer a tap synchronously: `linkAt()` asks every provider directly and opens the link inside the tap's gesture, so a new tab after an `await` would be blocked. Hub data a provider needs is read ahead (as `prefetchRefContext` does for every pane of the window when the terminal opens or its panes change); while that read is pending, the provider answers the mouse when it finishes, never with an early empty answer, because xterm keeps a row's answer while the mouse stays on it. A provider passes the screen cell where each link starts (`screenCell` of `web/src/fileLinks.ts`), and `TerminalView` resolves the link against the pane under it (`paneAt` of `shared/panes.ts`), not the selected one: the terminal shows the whole tmux window.
- Heavy code a screen rarely needs is loaded with a dynamic `import()` (as `marked` and `dompurify` in `Files.tsx`) (to confirm).
- No formatter or linter is configured: match the surrounding style (2-space indent, single quotes, semicolons, trailing commas, long single lines).

## Forbidden patterns

- Redeclaring a hub payload or message type in `web/`: import it from `shared/types.ts`.
- Opening a second app websocket or posting raw JSON to `/ws`: go through `hub` (`action`, `account`, `send`).
- Reimplementing logic the hub also runs (sanitising settings, keybar sequences, folder names, worktree names, copy clean-up): use the `shared/` module.
- A global store, context provider or state library for shared state: use a module-level signal.
- Keeping a setting every device should share in `localStorage`, or a per-device one in `HubSettings`.
- Hard-coded colours outside `:root`: add or reuse a custom property so both themes follow (to confirm: a couple of hard-coded shadows and one `#fff` remain).
- `className`, CSS-in-JS, or a stylesheet per component: use `class` and `styles.css`.
- `dangerouslySetInnerHTML` with content that has not gone through DOMPurify.
- `window.alert`/`confirm`/`prompt`: use `toast()` and the `dialog` signal.
- English text in the UI, or Spanish in identifiers and comments.

## Testing

- The levels this layer tests at and where each kind of test lives, following [testing-standards.md](testing-standards.md).
- The test, typecheck and lint commands are configured in `.claude/ka.json` and listed in step 4 of [the mandatory task steps](../../.claude/rules/ka-mandatory-steps.md); never copy them here, where they would go stale.
- `web` has no test runner and no tests: the typecheck is its only automated check, and `pnpm typecheck` and `pnpm test` (for the logic it shares) pass before every push.
- Pure logic the panel needs and that deserves a test lives in `shared/` and is tested from `server/src/<module>.test.ts` (`copy.ts`, `typing.ts`, `keybar.ts`, `paths.ts`, `refs.ts`, `panes.ts`, `stale-cache.ts`, `shortcuts.ts` (the panel's configurable shortcuts and the dictation's)).
- A UI change is checked by hand in a browser against a running hub (`vite` dev server proxying to `HUB_URL`), on a phone-sized viewport as well as a wide one. A hub started for that with a `local` machine runs tmux on this machine: give it its own `TMUX_TMPDIR` and no `TMUX`/`TMUX_PANE`, or it drives the user's real tmux server.

## Common workflows

- **A new tree action in a menu**: `shared/types.ts` (`ActionOp`) and `server/src/actions.ts` (see [server-standards.md](server-standards.md)), then `web/src/menus.ts` (or the component) calling `hub.action(host.id, { op: … })`.
- **A new hub setting with its control**: `shared/types.ts` and `server/src/settings.ts` (see [server-standards.md](server-standards.md)), then the control in the section component of `web/src/components/Settings.tsx` (or its own file), reading `hubSettings.value` and writing with `hub.send({ t: 'settings', settings: { … } })`.
- **A new per-device preference**: `web/src/prefs.ts` (a documented field of `Prefs` and its value in `DEFAULTS`), and the control in `DeviceSettings` of `web/src/components/Settings.tsx` using `setPref`.
- **A new configurable shortcut**: its id in `PANEL_SHORTCUT_IDS` of `shared/shortcuts.ts` (which gives `PanelShortcutId` and the order Ajustes › Atajos lists them in) and its entry in `PANEL_SHORTCUTS` (label, Mac and other defaults) and its action in `bindShortcuts` of `web/src/shortcuts.ts` through `matchesShortcut(e, shortcutOf(id))`. Ajustes › Atajos lists it on its own; a title that names it uses `shortcutLabel(id)`.
- **A new Settings section**: `web/src/state.ts` (`SettingsTab`), `web/src/components/Settings.tsx` (`SECTIONS` and the `SettingsSection` switch), and the section component in `web/src/components/<Feature>.tsx`; styles in `web/src/styles.css`.
- **A screen fed by a new REST endpoint**: the route and types on the server (see [server-standards.md](server-standards.md)), then `web/src/components/<Feature>.tsx` calling it through `api<T>()` (`web/src/api.ts`) and its styles in `web/src/styles.css`.
- **New hub state shown live**: a `ServerMessage` variant and its broadcast on the server, then a signal in `web/src/state.ts`, its `case` in `web/src/ws.ts`, and the component that reads it.
- **A new dialog or sheet**: a `Dialog` variant in `web/src/state.ts` rendered in `web/src/components/Dialogs.tsx`, or a value of the `sheet` signal in `web/src/state.ts` with its component mounted in `web/src/components/App.tsx`.
- **A new drawer or layer over the page on phones**: a drawer from a screen edge is an `EdgeDrawer` of `web/src/components/Drawer.tsx`, with the other edge's open signal as `other`; every layer's open signal is counted in `layers()` and closed in `closeTop()` of `web/src/backButton.ts`, so the back button closes it instead of leaving the page.
- **A new icon**: an `Icon…` component in `web/src/components/icons.tsx` (24px grid, `currentColor`, `aria-hidden`).
- **A new kind of terminal link**: the detection as pure logic in `shared/` (as `paths.ts` and `refs.ts`), tested from `server/src/<module>.test.ts`; a provider in `web/src/<kind>Links.ts` reading rows with `readRow` of `web/src/fileLinks.ts`; and its registration in `createTerminal()` of `web/src/components/TerminalView.tsx`, with the drag guard the other links use.
