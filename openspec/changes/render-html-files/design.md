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

- Serving a symbolic link inside the page's folder, even one that points inside it.
- Framing a page of the folder inside another: `frame-ancestors 'self'` refuses it, because the outer page's origin is opaque.

## Decisions

### D1. Page URLs carry a token scoped to a machine and a folder

**Context.** An opaque-origin document never sends the session cookie, so a route under the session cannot serve a page's relative resources. Granting `allow-same-origin` would give the page the hub's origin, its cookies and its API.

**Decision.** `POST /api/files/page` (under the session, same-origin like every POST) resolves the path as `/api/files` does (`paneFolders()`, `resolvePath()`, `statHostFile()` with `findInReposScript()`), follows the file itself when it is a symbolic link (`readlink`, one level at a time, at most 40), takes the physical path of the real file's folder on the machine (`cd -P … && pwd -P`) with `pageTarget()`, and returns `/api/page/<token>/<real file name>`. A page opened through a link is the file it points to, rendered next to that file's own resources. The token is 32 random bytes in base64url, kept in memory by a new `PageTokens` class in `server/src/pages.ts`, mapped to `{ host, dir, only, session, ip, issued }` (`only`: see D4). `GET /api/page/:token/*` serves the files below `dir` on that machine to a request that holds the token and comes from `ip`. Its path keeps the file name last, so the page's relative URLs resolve to siblings and subfolders under the same token.

**Consequences.** The URL is a bearer credential bound to a network address: whoever gets it and shares the address that opened it (the same device, or the same NAT) reads the folder (dotfiles excepted) until it expires. A page's script can read its own URL and send it out by navigating (see Risks); the binding to `ip`, the absolute lifetime and the session check of D2 keep a token sent out that way from serving the folder to the outside. `Referrer-Policy: no-referrer` on every page response keeps it out of the `Referer` a link would send. Tokens die with the hub process; nothing is written to `dataDir`.

Alternatives considered: a signed URL (an HMAC of host, folder and expiry) survives restarts but cannot be revoked with the session; a cookie scoped to `/api/page/` with `SameSite=None` would still be refused by browsers blocking third-party cookies.

### D2. A token lives 24 hours from its issue, only from its address, and only with its session

**Context.** The adversarial review showed that a renewal on every use lets a malicious page keep its own token alive forever: its script reads `location.href`, sends it out, and an outside party polls it. On a hub with password login behind a public proxy, that party reads the folder from anywhere, and an idle session that expires inside `SessionStore.check()` never reached `dropSessions()`.

**Decision.** `PageTokens.get(token, ip)` refuses a token:

- issued more than 24 hours ago (`issued`, set once, never renewed);
- asked for from an address other than the `ip` that `POST /api/files/page` saw (`req.ip`, which follows `trustProxy`);
- whose session (password login) no longer exists: `PageTokens` takes a `sessionAlive(id)` callback, which `index.ts` wires to a new `SessionStore.alive(id)`, true while the session exists and has not passed its idle limit, without refreshing it.

`closeSessions()` in `index.ts` (logout, «Cerrar las demás», closing every session) still calls `pages.dropSessions(ids)`, which frees the memory at once. The store keeps at most 500 tokens and drops the least recently used beyond that. The clock is injected so the tests drive it.

**Consequences.** A tab opened with «Abrir aparte» stops working 24 hours after it opened, even in use; reopening the file from the panel gives a new address. A phone that changes networks (Wi-Fi to mobile data) gets the «caducado» page on its next request, and the same reopening fixes it. With `trustProxy` misconfigured, `req.ip` is the proxy's address for everyone and the binding protects nothing, though it refuses nobody either.

Alternatives considered: a renewal cap (renew on use, at most N times) still lets an outside party keep the token for N periods; binding the token to the browser's user agent adds nothing an attacker in control of the page cannot copy.

An unknown, expired or refused token answers 404 with a small `text/html` page, sent with the same headers as a page, saying «Este enlace ha caducado. Vuelve a abrir el fichero desde el panel.» It does not say which check failed.

### D3. The page route skips the password session check, and no other site reaches the API

In the `onRequest` hook, the matched route `/api/page/:token/*` counts as open in the password branch, like `PUBLIC_API`; the handler checks the token. The route is a GET, so the same-origin check for POSTs does not apply.

**Context.** `tailscale serve` adds its identity header (`Tailscale-User-Login`) to every request it proxies, the page's included, since that header does not depend on cookies. Without another check, a page's `fetch('/api/files?…')` in tailscale mode is served as the user's (its response is unreadable without CORS, but an `<img>` of the hub's API loads).

**Decision.** Before either authentication branch, and after the early returns of `/api/notify` and `/api/ext/*`, the hook refuses with 403 a request to `/api/` (by its matched route, or by its URL when no route matched) other than the page route, when it comes from another site: `Origin: null`, or `Sec-Fetch-Site: cross-site` with an `Origin` not listed in `allowedOrigins`. A pure `fromAnotherSite(headers, allowedOrigins)` in `server/src/auth.ts` decides it, so it is tested without a server. The panel's own requests are `same-origin`, a URL typed in the address bar is `none`, and a development server on another port of the same host is `same-site`: none of them is refused.

**Consequences.** It holds in both authentication modes. A link to an `/api/` address from another site's page stops working (proposal, Impact). A browser too old to send `Sec-Fetch-Site` still sends `Origin: null` on a sandboxed page's `fetch`, but not on its `<img>`; every browser the panel supports sends `Sec-Fetch-Site`.

### D4. The hub validates the path, then the machine refuses symbolic links

**Context.** A page can ask for any path under its token, percent-encoded or not.

**Decision.** Two layers:

1. `pagePath(raw)`, pure, in `server/src/pages.ts`, takes the decoded wildcard parameter and refuses (404) an empty path, a NUL or line break, a backslash, an empty segment, and any segment that starts with a dot, which covers `.`, `..`, `.env` and `.git`. A path Fastify did not decode reaches the machine as a literal name (`%2e%2e`), which no file has.
2. `statPageFile(host, dir, rel)` runs a script on the machine: `cd -P` into `dir`, then refuses when any prefix of `rel` is a symbolic link (`[ -L … ]`), and prints the size of a regular file, or a tag for a folder or a missing file. Only then does the handler stream it with `streamHostFile()`.

**Consequences.** Refusing every symbolic link below the folder is stricter than the spec needs, and portable to macOS without `realpath`. The page's own folder may be hidden or reached through a link, and the page file itself may be a link: `dir` and the file name are resolved when the token is issued (D1), so its address names the real file. A page whose resolved name starts with a dot is refused like any hidden file.

**A broad folder serves only the page.** `pageTarget()` also reports whether the real folder is too broad to hand to a page: `/`, the machine's home folder or a folder above it (`cd -P ~ && pwd -P`), or a temporary root (`/tmp`, `/var/tmp`, and `$TMPDIR` when the machine sets it, each resolved with `cd -P`, so macOS's `/private/tmp` counts). The token is then issued with `only` set to the file's name, and the route refuses every other path (404). Such a page renders without its relative resources. A subfolder of any of them (`~/informes`, `/tmp/claude-…/scratchpad`) is served whole, as before. A file swapped for a link between the check and the read needs write access to the machine, which is outside the threat this addresses.

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
| `Accept-Ranges` | `bytes` | A `<video>` or `<audio>` of the page asks for parts of its file; Safari plays nothing without it. |

The route answers a `Range` header with `parseRange()` of `files.ts`, as `/api/files` does: 206 with `Content-Range` and `Content-Length`, or 416 for a range past the end. The size comes from `statPageFile()`.

The CSP goes on every response of the route, the subresources included, so a sibling `.html` opened by a link is sandboxed the same way. A sibling page cannot be framed by another: `frame-ancestors 'self'` does not match the outer page's opaque origin. `'self'` still admits `/api/files` and the rest of the API, which answer 401 without the session.

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
  POST /api/files/page {host,…,path} ► resolve as /api/files ────────────► stat
                                      pageTarget ──────────────────────────► readlink; cd -P; pwd -P
                            ◄─────── { url: /api/page/<t>/informe.html }   PageTokens.issue(ip)
<iframe sandbox=allow-scripts src=url>
  GET /api/page/<t>/informe.html ──► hook: route open in password mode
                                      PageTokens.get(t, ip) → {host, dir, only}
                                      pagePath('informe.html')
                                      statPageFile ────────────────────────► cd -P dir; [ -L ]; wc
                                      streamHostFile ──────────────────────► cat
                            ◄─────── text/html + CSP sandbox allow-scripts
  GET /api/page/<t>/estilo.css ──────► same path
  GET /api/page/<t>/.env ────────────► pagePath refuses: 404
```

### Wiring

`PageTokens` is instantiated in `index.ts` with `sessions.alive` as its `sessionAlive` (in tailscale mode no token has a session, so it is never called), the hook gains the cross-site check of D3, and `closeSessions()` calls into it: the tasks include a boot smoke test of the hub.

## Risks / Trade-offs

- [A script navigates its own frame to another site with data in the URL; no CSP directive blocks navigation. Some browsers also let a script open a WebRTC connection or trigger DNS lookups (`<link rel=dns-prefetch>`) outside `connect-src`] → Dotfiles and everything outside the folder stay unreachable; the owner accepted the residual risk for normal files of the folder. The page's own address sent out that way is useless from another network address (D2).
- [`'self'` in a sandboxed document behaves differently in Safari or Firefox, blocking the page's own files or letting others through] → Checked in Chromium only; the human review opens a page on the Mac's Safari. If `'self'` fails there, the CSP names the hub's origin explicitly instead.
- [A page URL copied out of the panel (a shared link, browser history) gives read access to the folder for 24 hours from the same network address] → Same exposure as any open tab; it dies with the session and the hub.
- [A page in a broad folder (`~`, `/tmp`) loses its stylesheet and images] → Accepted: the alternative hands the whole home or `/tmp` to the page's scripts. Moving the report into a folder of its own restores them.
- [A device that changes network address mid-use sees «caducado»] → Reopening the file from the panel issues a new address.
- [Many resources per page mean many SSH round trips] → ControlMaster keeps them cheap; a page with dozens of files loads in parallel.
- [Refusing symbolic links breaks a page whose assets are linked in] → Accepted; such a page still shows what it has.
- [Escape does not close the viewer while the focus is inside the page: the keys go to the iframe's document, which has another origin, and the sheet listens on the panel's window] → Accepted by the owner, as with the PDF iframe: «Atrás», a tap outside, dragging the sheet down and the phone's back button still close it.

## Migration Plan

None: new routes, in-memory state. Rolling back removes them; open page URLs stop working.
