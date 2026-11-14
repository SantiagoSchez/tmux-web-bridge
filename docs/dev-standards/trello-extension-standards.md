# trello-extension standards

The conventions of the `trello-extension` layer (trello-extension/**). The principles in [base-standards.md](base-standards.md) apply first; this document adds what is specific to this layer. Keep it short and concrete: a rule here is something a reviewer can check, and something the code does not already show. What the manifests, the directory tree or the linter say is left out, where it cannot go stale.

## Stack

- A Chrome extension, Manifest V3 (`static/manifest.json`): a content script on `https://trello.com/*`, a service worker and an options page. No runtime dependencies.
- Vite through `scripts/build.mjs`: one self-contained IIFE per entry (`content`, `background`, `options`), target `chrome120`, not minified, into `dist/`. Content scripts cannot load modules, so the entries must not share chunks.
- Tests with `node:test` and `node:assert/strict`, run by `tsx`.
- A pnpm workspace package (`trello-extension`). It is not deployed: it is built by hand or by `.github/workflows/trello-extension.yml` on each release tag, and loaded unpacked in `chrome://extensions`.

## Structure

- `src/styles.ts`: the CSS as strings (`PAGE_CSS` for the card button, `DIALOG_CSS` for the shadow root), built on Trello's `--ds-*` tokens with light-theme fallbacks.
- The hub side lives in the server layer: the routes and their auth hook in `server/src/index.ts`, the token store in `server/src/ext.ts`, the launch in `server/src/tasks.ts`, Trello in `server/src/trello.ts`. The API is documented in the root `README.md` («API de la extensión de Trello») and the extension in `trello-extension/README.md`.

## Conventions

- **One version for hub and extension.** `static/manifest.json` carries `"version": "0.0.0"`; `build.mjs` writes the repo's `VERSION` into `dist/manifest.json`. The extension is released with the hub, and its zip is attached to the GitHub release of the same tag.
- **The API contract lives in `shared/types.ts`.** Request and response shapes of `/api/ext/*` are `Ext*` (and `TrelloCardContext`) types there, used by the server and the extension alike. Shared imports in the extension omit the `.js` extension (`'../../shared/types'`), and type-only imports use `import type`.
- **The extension never talks to Trello.** Since 1.18 the hub holds the Trello key and token, reads the card, moves it to Doing and comments; the extension only calls the hub.
- **Hub calls go through the service worker.** `content.ts` sends a typed `Request` with `ask<T>()` (`chrome.runtime.sendMessage`) and gets a `Reply<T>` (`{ ok: true, data }` or `{ ok: false, error, setup? }`); `background.ts` dispatches it in `handle()` and returns `true` from the listener to answer asynchronously. The options page's own connection checks (`checkHub`, `checkTrello`) are the one place that fetches the hub elsewhere.
- **Errors are Spanish sentences that say what to do.** A problem fixed in the options page (no URL or token, no host permission, a 401) is a `SetupError`, sent as `setup: true` so the dialog offers to open the options. A 404 from the hub means a hub older than the extension and says so. The hub's own `{ error }` body is shown as is.
- **Host permission only for the hub's origin, only on a user gesture.** The manifest declares `optional_host_permissions`; the options page requests `hubPattern(hubUrl)` on the save click, and `hub()` checks `chrome.permissions.contains` before each call. `TWB_EXTRA_HOSTS` at build time is only for headless tests.
- **Storage through `settings.ts`.** Only `chrome.storage.local`, under the keys `settings` and `memory`; every loader defaults each missing field, so data saved by an older version still loads.
- **DOM built with `el()`.** Elements are created with the `el()` helper in `content.ts` and filled with `textContent`; `innerHTML` is used only for the static `ICON` constant. The dialog's markup and CSS stay inside the shadow root; the page gets only the card button's CSS.
- **Card scanning is idempotent.** A `MutationObserver` schedules `scan()` with a timer (not `requestAnimationFrame`, which stalls in background tabs), and `decorate()` skips cards that already have the button.
- **Updates are announced, not applied.** When the kit has put a newer `manifest.json` on disk, the service worker shows a `↑` badge and the dialog and options point to `chrome://extensions`. The extension never reloads itself.
- **Languages.** Code, identifiers and comments in English; UI strings, error messages and the extension's README in Spanish (Spain, «tú»).

## Forbidden patterns

- Calling the Trello API, or storing Trello credentials, in the extension: add what is needed to the hub's `/api/ext/*` instead.
- Fetching the hub from `content.ts`: add a `Request` variant and handle it in `background.ts`.
- Declaring the hub or wide hosts in the manifest's `host_permissions`: request the hub's origin at runtime with `chrome.permissions.request`.
- Redeclaring an `/api/ext/*` payload in `src/types.ts`: define or extend the `Ext*` type in `shared/types.ts` and re-export it.
- Copying logic the panel also uses (template, Doing list, destinations, worktree names) into the extension: put it in `shared/trello.ts` or `shared/worktree.ts` and re-export it from `logic.ts`.
- Using `chrome.*` or the DOM in `logic.ts`: it must stay importable from Node so its tests run.
- `innerHTML`, `insertAdjacentHTML` or `outerHTML` with card or hub data: build nodes with `el()` and `textContent`.
- Setting the version in `static/manifest.json` or `package.json`: bump `VERSION` in a release.
- `chrome.runtime.reload()` to apply an update: in tests it left the extension disabled.
- `localStorage` or `chrome.storage.sync` for the extension's state: use `chrome.storage.local` through `settings.ts` (to confirm that `sync` is excluded on purpose).

## Testing

- The levels this layer tests at and where each kind of test lives, following [testing-standards.md](testing-standards.md).
- The test, typecheck and lint commands are configured in `.claude/koalarnes.json` and listed in step 4 of [the mandatory task steps](../../.claude/rules/koalarnes-mandatory-steps.md); never copy them here, where they would go stale.
- Unit tests live next to the code as `src/*.test.ts` and cover the browser-free logic of `logic.ts`, including the `shared/trello.ts` and `shared/worktree.ts` functions it re-exports, with no mocks.
- The hub side of `/api/ext/*` (token, targets, launch) is tested in the server layer, `server/src/ext.test.ts`.
- `content.ts`, `background.ts` and `options.ts` have no automated tests in the repo: a change to them is checked in Chrome against a local hub, building with `TWB_EXTRA_HOSTS` for a headless browser (to confirm the expected level for UI changes).
- The `trello-extension` workflow runs typecheck, tests and build again on every release tag before it attaches the zip.

## Common workflows

- **A new field or route in `/api/ext/*`** (one commit for both sides): the `Ext*` type in `shared/types.ts`; the route in `server/src/index.ts` and its logic in `server/src/tasks.ts` or `server/src/trello.ts`; a test in `server/src/ext.test.ts`; the extension's use in `src/background.ts` (and `src/content.ts` or `src/types.ts`); the API table in the root `README.md`; a changelog entry. New request fields stay optional so an older extension keeps working with the new hub (to confirm).
- **A new message between the dialog and the service worker:** a variant of `Request` in `src/types.ts`, its `case` in `handle()` in `src/background.ts`, and the `ask<T>()` call in `src/content.ts` (or `chrome.runtime.sendMessage` in `src/options.ts`).
- **A new option:** the field in `Settings` (`src/types.ts`), its default in `DEFAULTS` and `loadSettings()` (`src/settings.ts`), `FIELDS` in `src/options.ts`, and the input in `static/options.html` (styles in `static/options.css`).
- **Dialog logic shared with the panel:** the function in `shared/trello.ts` or `shared/worktree.ts`, re-exported from `src/logic.ts`, tested in `src/logic.test.ts`; the panel's `web/src/components/Trello.tsx` imports the same function.
- **A manifest change** (permission, match, icon): `static/manifest.json` (and `static/icons/`); `build.mjs` overrides `version` and appends `TWB_EXTRA_HOSTS` to `host_permissions`. After building, reload the extension by hand in `chrome://extensions`, and remind the user to do the same.
- **Shipping:** a push of `trello-extension/**` deploys nothing. The release tag starts the `trello-extension` workflow, which attaches `twb-trello-extension-vX.Y.Z.zip` to the draft release; publish the release only once the zip is there, because kits with the extension turned on download it when they update.
