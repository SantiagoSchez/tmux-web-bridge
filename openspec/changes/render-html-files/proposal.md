# Proposal

## Why

When an agent shares an `.html` file and the user opens it in the panel, the file viewer shows its source, and «Abrir aparte» shows the same source in a new tab ([Issue #83](https://github.com/SantiagoSchez/tmux-web-bridge/issues/83)). `/api/files` serves anything that is not an image, a video, sound or a PDF as `text/plain` with `Content-Security-Policy: sandbox`, so that a file of a machine never runs with the hub's origin. Agents increasingly hand over reports, charts and prototypes as HTML, and reading them means copying the file to another computer.

## What Changes

- The file viewer shows an `.html` or `.htm` file rendered, in a sandboxed iframe, with the toggle the Markdown already has: «Ver el texto» shows its source and «Ver renderizado» goes back. The explorer's preview shows it rendered too, since it shows what the viewer shows.
- «Abrir aparte» on an HTML file opens the rendered page in a new tab.
- The page runs its JavaScript in a sandbox with an opaque origin (`sandbox allow-scripts`): it never reaches the hub's session, cookies or API.
- The page loads its relative resources (a stylesheet, a script, an image, a JSON file of its folder or a subfolder). Requests from an opaque-origin document never carry the session cookie (checked in Chromium), so the hub hands the panel a page URL carrying a random token of its own, scoped to the machine and the HTML's folder. The URL works only from the network address that opened it, for 24 hours after it was issued whether it is used or not, and, with password login, while the session that opened it lasts.
- When the HTML's folder is too broad to hand to a page (the root of the disk, the machine's home folder or one above it, or a temporary root such as `/tmp`), the URL serves only the HTML file itself.
- The hub refuses any request to `/api/` that comes from another site or from an opaque origin, with password login and through `tailscale serve` alike, except the page route, the Trello extension's routes and `/api/notify`, which carry tokens of their own. A page's script thus never reaches the API, even when the proxy adds the user's identity to its requests.
- The page route answers HTTP `Range` requests, so a video inside a page plays and seeks in every browser, Safari included.
- That URL never serves a file or folder whose name starts with a dot (`.env`, `.git`, `.ssh`), nor anything outside the HTML's folder, symbolic links included.
- A Content Security Policy keeps the page from loading or sending anything outside the hub: only its folder's files, inline code, `data:` and `blob:`. A library from a CDN does not load.
- Accepted risk, agreed with the owner: no browser lets a CSP stop a script from navigating its own frame to an external URL carrying data, so a malicious HTML could leak a normal file of its folder. Dotfiles stay out of its reach.
- `/api/files` keeps serving HTML as sandboxed text: it still feeds «Ver el texto».

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `file-viewer`: adds how an HTML file is shown (rendered, with its source on demand), what «Abrir aparte» opens for it, and what the rendered page can and cannot reach.

## Impact

- Layers: `server` (a new authenticated endpoint that issues a page URL, a new token-authenticated route that serves the folder's files, the token store, the `onRequest` hook, and `shared/` for the file-type helper and the new types) and `web` (`Files.tsx`: the rendered view, the toggle and «Abrir aparte»). `trello-extension` and `host-kit` are not touched.
- API contract: new `POST /api/files/page` (body and result as types in `shared/types.ts`) and new `GET /api/page/<token>/<path>`. `/api/files` does not change.
- The `onRequest` hook refuses (403) cross-site requests to `/api/` in both authentication modes. A link from another site to an `/api/` address (for instance a `/api/files` URL pasted in a chat and opened from the chat's web page) stops working; opening it from the panel, from the address bar or from an origin listed in `allowedOrigins` still works.
- No data model change, no migration, no new environment variable: tokens live in the hub's memory and die with it.
- No external service.

## Non-goals

- Running an HTML with access to the internet (CDN libraries, external fonts, APIs).
- Rendering other active formats (SVG documents as pages, Jupyter notebooks).
- Keeping a page URL alive across hub restarts, or sharing it with another person or device.
- Changing how the other kinds of files are served or shown.
