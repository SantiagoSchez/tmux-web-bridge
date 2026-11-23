# Design

## Context

The file viewer (`web/src/components/Files.tsx`) reads every non-media file through `GET /api/files`, which answers `text/plain` with `Content-Security-Policy: sandbox` and `X-Content-Type-Options: nosniff`, so no file of a machine ever runs as a page. `shared/file-types.ts` classifies `.html` and `.htm` as `code`, which gives them the code icon and the line-numbered view. «Abrir aparte» is a plain link to the same `/api/files` URL.

Authentication is centralised in the `onRequest` hook of `server/src/index.ts`. With `auth.method: password` the credential is the cookie `twb_session` (`HttpOnly; SameSite=Lax`); with `auth.method: tailscale` it is the `Tailscale-User-Login` header that `tailscale serve` adds to every request it proxies.

A throwaway experiment in Chromium (a page served with `Content-Security-Policy: sandbox allow-scripts; default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:`, loaded in a `sandbox="allow-scripts"` iframe and as a top-level tab) showed:

- every request the page made (stylesheet, image, `fetch`) went out with `Sec-Fetch-Site: cross-site` and **without** the `SameSite=Lax` cookie, in the iframe and in the tab alike;
- `'self'` matched the URL's origin (the hub), not the document's opaque origin: requests to the hub passed, and an image and a `fetch` to another origin were blocked with `securitypolicyviolation` events;
- `fetch` to the hub got `Origin: null`, so reading the response needs `Access-Control-Allow-Origin`.

Firefox and Safari were not tried.

## Goals / Non-Goals

**Goals:**

- A rendered page whose credential is a capability in its URL, not the session cookie, so that the panel's iframe and a tab of its own work the same way.
- One place on the hub that decides which paths of a machine a page can read.

**Non-Goals:**

- HTTP `Range` requests on the page route: a video inside a page plays from the start but cannot seek.
- Serving a symbolic link inside the page's folder, even one that points inside it.

## Decisions

### D1. Page URLs carry a token scoped to a machine and a folder

**Context.** An opaque-origin document never sends the session cookie, so a route under the session cannot serve a page's relative resources. Granting `allow-same-origin` would give the page the hub's origin, its cookies and its API.

**Decision.** `POST /api/files/page` (under the session, same-origin like every POST) resolves the path as `/api/files` does (`paneFolders()`, `resolvePath()`, `statHostFile()` with `findInReposScript()`), takes the physical path of its folder on the machine (`cd -P … && pwd -P`), and returns `/api/page/<token>/<file name>`. The token is 32 random bytes in base64url, kept in memory by a new `PageTokens` class in `server/src/pages.ts`, mapped to `{ host, dir, session, lastUsed }`. `GET /api/page/:token/*` serves the files below `dir` on that machine to anyone holding the token. Its path keeps the file name last, so the page's relative URLs resolve to siblings and subfolders under the same token.

**Consequences.** The URL is a bearer credential: anyone who gets it reads the folder (dotfiles excepted) until it expires. `Referrer-Policy: no-referrer` on every page response keeps it out of the `Referer` a link would send. Tokens die with the hub process; nothing is written to `dataDir`.

Alternatives considered: a signed URL (an HMAC of host, folder and expiry) survives restarts but cannot be revoked with the session; a cookie scoped to `/api/page/` with `SameSite=None` would still be refused by browsers blocking third-party cookies.

### D2. A token expires after 24 hours unused, with the hub, and with its session

`PageTokens.get()` refuses a token whose last use is more than 24 hours old and refreshes `lastUsed` otherwise. With password login the token records the session id that issued it, and `closeSessions()` in `index.ts` (logout, «Cerrar las demás», closing every session) also calls `pages.dropSessions(ids)`. The store keeps at most 500 tokens and drops the least recently used beyond that, so a panel opening pages for days cannot grow it without bound. The clock is injected so the tests drive it.

An unknown or expired token answers 404 with a small `text/html` page, sent with the same headers as a page, saying «Este enlace ha caducado. Vuelve a abrir el fichero desde el panel.»

### D3. The page route skips only the password session check

In the `onRequest` hook, the matched route `/api/page/:token/*` counts as open in the password branch, like `PUBLIC_API`; the handler checks the token. In the tailscale branch nothing changes: `tailscale serve` adds its identity header to the page's requests too, since it does not depend on cookies. The route is a GET, so the same-origin check for POSTs does not apply.

### D4. The hub validates the path, then the machine refuses symbolic links

**Context.** A page can ask for any path under its token, percent-encoded or not.

**Decision.** Two layers:

1. `pagePath(raw)`, pure, in `server/src/pages.ts`, takes the decoded wildcard parameter and refuses (404) an empty path, a NUL or line break, a backslash, an empty segment, and any segment that starts with a dot, which covers `.`, `..`, `.env` and `.git`. A path Fastify did not decode reaches the machine as a literal name (`%2e%2e`), which no file has.
2. `pageFileScript(dir, rel)` runs on the machine: `cd -P` into `dir`, then refuses when any prefix of `rel` is a symbolic link (`[ -L … ]`), and prints the size of a regular file, or a tag for a folder or a missing file. Only then does the handler stream it with `streamHostFile()`.

**Consequences.** Refusing every symbolic link below the folder is stricter than the spec needs, and portable to macOS without `realpath`. The page's own folder may be hidden or reached through a link: `dir` is fixed when the token is issued. A file swapped for a link between the check and the read needs write access to the machine, which is outside the threat this addresses.

Alternative considered: one script that checks and streams in a single SSH round trip. Two round trips over the ControlMaster connection cost a few milliseconds per resource and reuse `streamHostFile()` as it is.

### D5. Every page response carries the same security headers

| Header | Value | Why |
|---|---|---|
| `Content-Security-Policy` | `sandbox allow-scripts; default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; frame-ancestors 'self'` | Opaque origin with scripts, no popups, forms or top navigation; only the hub, inline code, `data:` and `blob:`; framed only by the panel. |
| `Content-Type` | by extension, see D7 | |
| `X-Content-Type-Options` | `nosniff` | A `.txt` is never run as a script. |
| `Referrer-Policy` | `no-referrer` | The token never leaves in a `Referer`. |
| `Access-Control-Allow-Origin` | `*` | The page's `fetch` of its own data files (it sends `Origin: null`); no credentials ride on it. |
| `Cache-Control` | `no-store` | The files change while an agent works. |

The CSP goes on every response of the route, the subresources included, so a sibling `.html` opened by a link or a frame is sandboxed the same way. `'self'` still admits `/api/files` and the rest of the API, which answer 401 without the session.

### D6. The panel's iframe adds its own sandbox

The viewer renders `<iframe sandbox="allow-scripts" referrerpolicy="no-referrer" src={page}>`. The browser applies the intersection of the attribute and the response's CSP sandbox, so the panel stays protected even if a later change loosens the header.

### D7. One content-type table for both file routes

The `MIME` table of `index.ts` moves to `server/src/content-types.ts` and grows the types a page uses: `html`/`htm`, `css`, `js`/`mjs`, `json`, `map`, `txt`, `csv`, `md`, `xml`, `wasm`, `woff`/`woff2`/`ttf`/`otf`, besides the images, video, sound and PDF it has. Text types carry `charset=utf-8`; an unknown extension is `application/octet-stream`. `/api/files` keeps its behaviour: it takes a type from the table only for images, video, sound and PDF, and sends everything else as `text/plain`.

### D8. `.html` keeps the code icon and gets a viewer kind of its own

`shared/file-types.ts` gains `isHtml(name)`: `.html` or `.htm` in any case, on the last part of the path. `FileType` does not change, so the explorer and «Ficheros cambiados» keep the code icon. `fileKind()` in `Files.tsx` returns `'html'` for those names. An HTML file is read as text, as now, for «Ver el texto» and the binary check; `useFile()` also asks `POST /api/files/page` and keeps the URL in `LoadedFile.page`. `FileBody` shows the iframe when the kind is `html` and the view is not raw; `FileView` offers the toggle for `markdown` and `html`, and its «Abrir aparte» points to `page` for an HTML file (disabled until the URL arrives). The explorer's preview uses `FileBody` without `raw`, so it renders the page with no change of its own.

The request and result are `FilePageRequest { host; window?; pane?; path }` and `FilePage { url; path; size }` in `shared/types.ts`; errors reuse `FilesError`.

### Flow

```
panel (web)                          hub (server)                          machine
FileView opens informe.html
  GET /api/files?…&max=2MB  ───────► statHostFile, streamHostFile ───────► wc, head
  POST /api/files/page {host,…,path} ► resolve as /api/files ────────────► stat, cd -P; pwd -P
                            ◄─────── { url: /api/page/<t>/informe.html }   PageTokens.issue
<iframe sandbox=allow-scripts src=url>
  GET /api/page/<t>/informe.html ──► hook: route open in password mode
                                      PageTokens.get(t) → {host, dir}
                                      pagePath('informe.html')
                                      pageFileScript ──────────────────────► cd -P dir; [ -L ]; wc
                                      streamHostFile ──────────────────────► cat
                            ◄─────── text/html + CSP sandbox allow-scripts
  GET /api/page/<t>/estilo.css ──────► same path
  GET /api/page/<t>/.env ────────────► pagePath refuses: 404
```

### Wiring

`PageTokens` is instantiated in `index.ts`, the hook changes and `closeSessions()` calls into it: the tasks include a boot smoke test of the hub.

## Risks / Trade-offs

- [A script navigates its own frame to another site with data in the URL; no CSP directive blocks navigation] → Dotfiles and everything outside the folder stay unreachable; the owner accepted the residual risk for normal files of the folder.
- [`'self'` in a sandboxed document behaves differently in Safari or Firefox, blocking the page's own files or letting others through] → Checked in Chromium only; the human review opens a page on the Mac's Safari. If `'self'` fails there, the CSP names the hub's origin explicitly instead.
- [A page URL copied out of the panel (a shared link, browser history) gives read access to the folder for 24 hours] → Same exposure as any open tab; it dies with the session and the hub.
- [Many resources per page mean many SSH round trips] → ControlMaster keeps them cheap; a page with dozens of files loads in parallel.
- [Refusing symbolic links breaks a page whose assets are linked in] → Accepted; such a page still shows what it has.

## Migration Plan

None: new routes, in-memory state. Rolling back removes them; open page URLs stop working.
