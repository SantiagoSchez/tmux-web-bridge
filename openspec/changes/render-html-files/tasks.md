# Tasks

## 1. Create the branch

- [x] 1.1 Create `feature/83-renderizar-los-ficheros-html-en-el-visor` from `master` in its own worktree with `/ka:git-worktree create`; check with `git branch --show-current`.

## 2. Review the existing tests

- [x] 2.1 Read the tests of every module the change touches and write one line per module saying «tests up to date» or «tests updated/added in this change»: `shared/file-types.ts` (`server/src/file-types.test.ts`), `server/src/files.ts` (`server/src/files.test.ts`), the new `server/src/pages.ts` and `server/src/content-types.ts`, `server/src/index.ts` (route handlers have no tests: say so), and `web/src/components/Files.tsx` (the web layer has no test suite: say so).
  - `shared/file-types.ts`: tests updated/added in this change (`isHtml`, group 3); the existing `fileType` tests still hold, `.html` stays `code`.
  - `server/src/files.ts`: tests up to date; the change reuses `resolvePath`, `statHostFile` and `streamHostFile` without changing them.
  - `server/src/content-types.ts`, `server/src/pages.ts`: new modules, tests added in this change (groups 3 and 4).
  - `server/src/index.ts`: route handlers have no tests; the behaviour behind the routes is tested in `pages.ts` and `content-types.ts`, the routes by the boot smoke test and `curl` (5.4, 5.5).
  - `web/src/components/Files.tsx`: no tests (the web layer has no test suite); checked by hand in 6.3.

## 3. HTML names and content types (test-first)

- [x] 3.1 Add to `server/src/file-types.test.ts` a test for `isHtml` of `shared/file-types.ts` (D8): `informe.html`, `PORTADA.HTM` and `docs/a.htm` are HTML; `a.html.txt`, `html`, `.html` and `notas.md` are not; `fileType('informe.html')` stays `code`. Run `pnpm --filter server test` and see it fail because `isHtml` does not exist.
- [x] 3.2 Write `isHtml(name)` until `pnpm --filter server test` passes.
- [x] 3.3 Add `server/src/content-types.test.ts` (D7): `pageContentType` gives `text/html; charset=utf-8` for `a.HTML`, `text/css; charset=utf-8` for `a.css`, `text/javascript; charset=utf-8` for `a.mjs`, `font/woff2` for `a.woff2`, `image/png` for `a.png` and `application/octet-stream` for `a.bin` and `LICENSE`; `filesContentType` gives the media types for `a.png` and `a.pdf` and `text/plain; charset=utf-8` for `a.html`, `a.js` and `a.svgz`. See it fail.
- [x] 3.4 Write `server/src/content-types.ts` with one table and both functions; replace the `MIME` table of `index.ts` with `filesContentType` in `/api/files`. `pnpm --filter server test` and `pnpm --filter server typecheck` pass.
- [x] 3.5 Commit the group with `/ka:commit` (with the change's OpenSpec artifacts) once `pnpm --filter server test` and `pnpm --filter server typecheck` pass.

## 4. Page tokens and path checks (test-first)

- [x] 4.1 Add `server/src/pages.test.ts` for `PageTokens` with an injected clock (D2): an issued token gives back its host, folder and session; a token unused for 24 hours is refused, and one used every 23 hours keeps working; `dropSessions([id])` refuses the tokens of that session and keeps the others; a token issued without a session survives `dropSessions`; past 500 tokens the least recently used is refused; an unknown token is refused. See them fail.
- [x] 4.2 Write `PageTokens` in `server/src/pages.ts` (tokens of 32 random bytes in base64url, kept in memory) until the tests pass.
- [x] 4.3 Add tests for `pagePath` (D4): `informe.html`, `img/logo.png` and `a b/c.css` pass as they are; an empty path, `.env`, `.git/config`, `img/.hidden.png`, `..`, `../notas.txt`, `a/../b`, `./a`, `a//b`, `a/`, `a\\b` and a path with a NUL or a line break are refused. See them fail, then write `pagePath` until they pass.
- [x] 4.4 Add tests that run `statPageFile(host, dir, rel)` for real with `/bin/sh` against a temporary folder, through a fake host as in `temp.test.ts` (D4): a regular file gives its size; a missing file, a folder, a symbolic link to a file inside the folder, a symbolic link to a file outside it and a file below a linked folder are each refused with their tag; `dir` reached through a symbolic link still serves its files; a name with spaces and quotes works. See them fail, then write `statPageFile` (its script and its parser, throwing `FileError` 404) until they pass.
- [x] 4.5 Add a test for the folder a page is issued for: `pageFolder(path)` (replaced by `pageTarget` in 4.7) run with `/bin/sh` gives the physical path of the file's folder (`cd -P`), also when the folder is reached through a symbolic link. See it fail, then write it until it passes.
- [x] 4.6 Commit the group with `/ka:commit` once `pnpm --filter server test` and `pnpm --filter server typecheck` pass.
- [x] 4.7 From `/opsx:verify` (the owner chose to open the real file): replace the tests of `pageFolder` with tests of `pageTarget(host, path)` run with `/bin/sh` (D1): a regular file gives its physical folder and name; a symbolic link to a file in another folder gives that folder and that file's name; a chain of two links is followed; a relative link target resolves from the link's folder; a loop of links and a missing file are refused (404). See them fail.
- [x] 4.8 Write `pageTarget` (replacing `pageFolder`) until the tests pass.
- [x] 4.9 In `POST /api/files/page`, issue the token for `pageTarget`'s folder and answer the URL with its file name. `pnpm --filter server typecheck` passes; check with `curl` against the isolated hub that a link `ultimo.html` to `informes/informe.html` answers a URL ending in `/informe.html` whose sibling `estilo.css` loads. Record it here.
  - `POST /api/files/page` for `~/ultimo.html`, a link to `informes/informe.html`: the URL ends in `/informe.html`; the page answers 200 with the real file's HTML and its sibling `estilo.css` 200 with `h1 { color: navy }`.
- [x] 4.10 Commit the fix with `/ka:commit` once `pnpm --filter server test` and `pnpm --filter server typecheck` pass.
- [x] 4.11 From the adversarial review (D2): in `server/src/pages.test.ts`, replace the renewal test of `PageTokens` with: a token asked for every hour stops working 24 hours after its issue; a token asked for from another address than the one it was issued for is refused, and still works from its own; a token whose session `sessionAlive` reports gone is refused, one without a session is never checked. See them fail.
- [x] 4.12 Change `PageTokens` (`issued` and `ip` in the grant, `get(token, ip)`, the `sessionAlive` callback, no renewal) until the tests pass.
- [x] 4.13 Add `server/src/auth.test.ts` (D2, D3): `SessionStore.alive(id)` is true for a created session, false after `revoke` and false past its idle limit, and does not refresh the session; `fromAnotherSite(headers, allowed)` is true for `Origin: null` and for `Sec-Fetch-Site: cross-site` with a foreign or missing `Origin`, and false for `same-origin`, `same-site`, `none`, no header, and `cross-site` from an origin of `allowed`. See them fail, then write both until they pass.
- [x] 4.14 Add tests for the broad folders of `pageTarget` (D4), with the test's own `HOME` and `TMPDIR`: a page in `HOME`, in a folder above it and in `TMPDIR` comes back marked broad; a page in a subfolder of `HOME` or of `TMPDIR` does not. See them fail, then make `pageTarget` report it until they pass.
- [x] 4.15 Commit the group with `/ka:commit` once `pnpm --filter server test` and `pnpm --filter server typecheck` pass.

## 5. The routes and the hook

- [x] 5.1 Add `FilePageRequest` and `FilePage` to `shared/types.ts` (D8).
- [x] 5.2 In `server/src/index.ts`, instantiate `PageTokens`, add `POST /api/files/page` (narrow the body, resolve as `/api/files` does, `pageTarget` (4.9), issue the token with `req.sessionId ?? null`, answer `FilePage`; errors through `fileError`) and `GET /api/page/:token/*` (token through `PageTokens.get`, `pagePath`, `statPageFile`, `streamHostFile`, the headers of D5 with `pageContentType`; an unknown or expired token, or a refused path, answers 404, the token's one with the Spanish «caducado» page of D2). Kill the stream when the browser closes the request, as `/api/files` does.
- [x] 5.3 In the `onRequest` hook, count the matched route `/api/page/:token/*` as open in the password branch only (D3); in `closeSessions()`, call `pages.dropSessions(ids)` (D2). `pnpm --filter server typecheck` passes.
- [x] 5.4 Boot smoke test: start the hub with an isolated `HOME`, `TMUX_TMPDIR` and data folder on a loopback port (no `TMUX`/`TMUX_PANE`, any `local` machine on its own socket with `-f /dev/null`), wait for its ready log line, then stop it. Record the line in this task.
  - Hub on 127.0.0.1:17691 with its own `HOME`, `TMUX_TMPDIR` and data folder, `auth.method: password`, one `local` machine whose `tmux` is a wrapper running `tmux -f /dev/null -L <own socket>`. It logged `tmux-web-bridge escuchando en http://127.0.0.1:17691 (1 máquinas, config …/config.yaml)` and nothing else; kept running for 5.5 and 6.3, then stopped.
- [x] 5.5 Manual endpoint testing with `curl` against that hub, password login: `POST /api/files/page` without a session (401), with a foreign `Origin` (403), with an unknown machine (400) and a missing file (404), and with an HTML file (200, a `url`); `GET` of that `url` (200, `text/html`, every header of D5), of a sibling `estilo.css` (`text/css`), of `.env`, `.git/config`, `%2e%2e/x`, `..%2fx`, a link pointing out and a folder (404 each, no content), of an unknown token (404 with the «caducado» page); after logging out, the same `url` answers the «caducado» page. Record the results in this task.
  - `POST /api/files/page`: no session 401; foreign `Origin` 403; unknown machine 400 «Máquina desconocida»; missing file 404 «No existe en linux-box»; `web/informe.html` 200 with `url` `/api/page/<43-character token>/informe.html`, its whole `path` and `size`.
  - `GET` of the `url`: 200 with `content-type: text/html; charset=utf-8`, `content-security-policy: sandbox allow-scripts; default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; frame-ancestors 'self'`, `x-content-type-options: nosniff`, `referrer-policy: no-referrer`, `access-control-allow-origin: *`, `cache-control: no-store`.
  - `estilo.css` 200 `text/css; charset=utf-8`; `img/logo.svg` 200 `image/svg+xml`.
  - 404 with 0 bytes: `.env`, `.git/config`, `%2eenv`, `..%2fsecreto.txt`, `%2E%2E%2Fsecreto.txt`, `clave` (a link to `../secreto.txt`), `img` and `sub` (folders), `falta.css`, and `../secreto.txt` sent as is (`curl --path-as-is`).
  - `%2e%2e/secreto.txt`: `curl` folds the encoded dot segment before sending, so the request leaves the token's route and the hub answers 401 «Inicia sesión»; nothing of the file is served.
  - Unknown token: 404 with the «Este enlace ha caducado. Vuelve a abrir el fichero desde el panel.» page. `/api/files` without the cookie: 401.
  - After `POST /api/logout` of the session that issued it, the same `url` answers 404 with the «caducado» page.
- [x] 5.6 Commit the group with `/ka:commit` once `pnpm --filter server test` and `pnpm --filter server typecheck` pass.
- [x] 5.7 From the adversarial review, in `server/src/index.ts`: build `PageTokens` with `sessions.alive` (D2); in `POST /api/files/page`, issue the token with `req.ip` and, for a broad folder, `only` set to the file's name (D4); in `GET /api/page/:token/*`, pass `req.ip` to `get`, refuse any path other than `only` when it is set, and answer `Range` with `parseRange`, `Accept-Ranges`, 206 and 416 (D5); in the hook, refuse with 403 the requests to `/api/` from another site with `fromAnotherSite`, except the page route (D3). `pnpm --filter server typecheck` passes.
  - The token's own wiring (`sessions.alive`, `req.ip` at issue and use) went with the commit of group 4, so that it compiled. The hook refuses an `/api/` request by its matched route or its URL: an unknown `/api/` path matches the static `/*` route, which the first try missed (`/api/nada` cross-site answered 404 instead of 403).
- [x] 5.8 Boot smoke test and `curl` against the isolated hub, as in 5.4 and 5.5, and record the results here: the page from another `X-Forwarded-For` (the hub trusts loopback) answers «caducado»; `Range: bytes=0-3` answers 206 with 4 bytes and `Content-Range`, a range past the end 416; a page in the test `HOME` serves itself and refuses its sibling; `/api/files` and `/api/session` with `Sec-Fetch-Site: cross-site` or `Origin: null` answer 403, with `same-origin` as before; the page route with `Sec-Fetch-Site: cross-site` still answers 200. Then, with the hub in `auth.method: tailscale` and a `Tailscale-User-Login` header, `/api/files` with `Sec-Fetch-Site: cross-site` answers 403 and without it 200.
  - Boot smoke test: the hub logged only `tmux-web-bridge escuchando en http://127.0.0.1:17691 (1 máquinas, …)` and the login.
  - The page's address: 200 from the address that opened it; with `X-Forwarded-For: 203.0.113.9`, 404 with the «Este enlace ha caducado…» page.
  - `Range: bytes=0-3` of `datos.json`: 206, `content-range: bytes 0-3/30`, `content-length: 4`, body `{ "t`; `bytes=9000-`: 416 with `content-range: bytes */30`; without `Range`: 200 with `accept-ranges: bytes`.
  - `~/raiz.html` (the test `HOME`): its URL ends in `/raiz.html` and answers 200; `estilo.css`, `notas.txt` and `web/datos.json` under the same token 404 with 0 bytes. The page of `~/web` still serves its `estilo.css` (200).
  - Password mode: `/api/files` with `Sec-Fetch-Site: cross-site` 403, `Origin: null` 403, `same-origin`, `none` and `same-site` 200; `/api/session` cross-site 403; `/api/nada` cross-site 403; the page route cross-site with `Origin: null` 200; `/` cross-site 200; `/api/notify` cross-site without its token 401, as before.
  - Tailscale mode (a second hub on 17692, `allowedLogins` with the test login): `/api/files` with the identity header 200, adding `Sec-Fetch-Site: cross-site` 403, adding `Origin: null` 403; `POST /api/files/page` issues the page, whose `datos.json` cross-site answers 200.
- [x] 5.9 Check in Chromium against the isolated hub that a page with a `<video>` of its folder plays and seeks (Safari goes to the human review, 12.1). Record it here.
  - No `ffmpeg` on this machine, so the page holds a 10-second WAV in an `<audio>`, which asks for parts of its file as a `<video>` does. Opened in headless Chromium at its page address: `duration` 10, `seekable` up to 10, after setting `currentTime = 8` and `seeked` it stays at 8, no media error. `play()` was not tried: Chromium's autoplay policy refuses it without a user gesture.
- [x] 5.10 Commit the group with `/ka:commit` once `pnpm --filter server test` and `pnpm --filter server typecheck` pass.

## 6. The viewer

- [x] 6.1 In `web/src/components/Files.tsx`, make `fileKind` return `'html'` for `isHtml` names; in `useFile`, for that kind, read the text as now and also ask `POST /api/files/page`, keeping its `url` in `LoadedFile.page` (null until then, and on error, which shows like the other errors) (D8).
- [x] 6.2 In `FileBody`, show `<iframe class="file-page" sandbox="allow-scripts" referrerpolicy="no-referrer" src={page}>` for the `html` kind when not raw (D6); in `FileView`, offer «Ver el texto» / «Ver renderizado» for `markdown` and `html`, and point «Abrir aparte» to `page` for an HTML file, disabled until it arrives. Add `.file-page` to `web/src/styles.css` (full width, filling the sheet's height, white background as a page expects, using a custom property). `pnpm --filter web typecheck` passes.
- [x] 6.3 Check it by hand in a browser against an isolated hub (its own `HOME` and `TMUX_TMPDIR`, a tmux on its own socket started with `-f /dev/null`, never the user's tmux), at 411 px and at 1280 px, with a folder holding `informe.html` (heading, table, inline script drawing on a `<canvas>`, `estilo.css`, `img/logo.png`, `fetch('datos.json')`, a link to `otra.html`, a `<script>` from a CDN, a `fetch` to another site, reads of `document.cookie`, `window.parent.document` and `localStorage`, a `fetch` of `.env`), `.env` and `PORTADA.HTM`. Walk every scenario of `specs/file-viewer/spec.md`: rendered view, toggle, upper-case extension, «Abrir aparte», the explorer's preview, the blocked requests (DevTools console and the hub's log), the refused files. Record what was checked in this task.
  - Setup: the hub of 5.4 serving the built panel, password login, headless Chromium (agent-browser), a tmux session of the test machine in `~/web` (wrapper with `-f /dev/null` and its own socket). `informe.html` as described, `estilo.css` (green heading), `img/logo.svg`, `datos.json`, `otra.html`, `PORTADA.HTM`, `.env`, `.git/config` and a link `clave` to a file above.
  - 411 px: the explorer's preview of `informe.html` shows the page in a `file-page` iframe (`sandbox="allow-scripts"`, 346×430): green heading from `estilo.css`, the blue `img/logo.svg`, the red rectangle the script draws on the `<canvas>`, «datos cargados» from `fetch('datos.json')`. «Abrir» opens it in the viewer (364×602) with «Ver el texto» and «Abrir aparte» pointing to `/api/page/<token>/informe.html`; the page is 411 px wide, no cut notice.
  - «Ver el texto» shows the HTML with line numbers and turns into «Ver renderizado», which brings the page back.
  - «Abrir aparte»'s address in a tab of its own: `self.origin` is `null`; heading `rgb(0, 128, 0)`; «datos cargados»; `document.cookie` and `localStorage` throw `SecurityError`; `typeof Chart` is `undefined` (the CDN script did not load); `fetch` of `.env` and `.git/config` 404; `fetch` of `/api/session`, `/api/files?…` and `https://example.com/` fail with `TypeError`.
  - 1280 px, in the viewer's iframe: the page prints «cookie=bloqueada parent=bloqueado storage=bloqueado chart=undefined» (`window.parent.document` refused). Tapping «otra» shows «Otra página» rendered in the same iframe.
  - `PORTADA.HTM` renders in the explorer's preview; `.html` files keep the code icon.
  - A page in `~/.cache/informes` (hidden folder) is served `text/html` and its `estilo.css` loads (200).
  - The hub's log shows only its ready line and the two logins: no error.
  - Not checked here: the 24-hour expiry (covered by `pages.test.ts`), Firefox and Safari (Safari goes to the human review, 12.1).
- [x] 6.4 Commit the group with `/ka:commit` once `pnpm --filter web typecheck` and `pnpm --filter server test` pass.

## 7. Run tests, typecheck and lint

- [x] 7.1 Run `pnpm --filter server test`, `pnpm --filter server typecheck` and `pnpm --filter web typecheck`, all green; run `ka scope` and the checks it lists (`ka features-check`, `ka docs-check`), or record them as not applicable.
  - `pnpm --filter server test`: 516 pass, 0 fail; `pnpm --filter server typecheck` and `pnpm --filter web typecheck`: clean. `ka scope`: features-check and docs-check apply; `ka features-check` exit 0 (7 sections pending, for group 10); `ka docs-check` exit 0, no dead reference.

## 8. Update the documentation and the changelog

- [x] 8.1 Run `/ka:update-docs` for the new API contract (`POST /api/files/page`, `GET /api/page/<token>/…`), the hook's new open route and the user-visible flow; the server standards' line on authentication names the page route's token as one more credential.
- [x] 8.2 Add the changelog entry with `/ka:changelog --issue 83`: HTML files open rendered in the viewer and with «Abrir aparte», with their folder's files, isolated from the panel and without internet access.
- [x] 8.3 Commit the group with `/ka:commit` once `pnpm --filter server test` and `pnpm --filter web typecheck` pass.
- [x] 8.4 From the adversarial review, run `/ka:update-docs` again: the server standards say that the hook refuses cross-site requests to `/api/` and that a page token is bound to its address, its session and 24 hours from its issue; the README says that a page in the home folder or in `/tmp` shows without its folder's files. Update the changelog entry if its description no longer holds. Commit with `/ka:commit`.

## 9. Review loop

- [x] 9.1 Run `/opsx:verify` and fix what it reports through the artifacts.
- [ ] 9.2 Run `/ka:adversarial-review render-html-files`: it applies because the change adds a service to the composition root and changes the authentication hook (dependency wiring), and opens a new route that serves files of a machine to a token instead of the session.
  - First run: one HIGH (a page's script can send its own token out and keep it alive by renewal; an idle-expired session did not stop it), two MEDIUM (a page in `~`, `/tmp` or `/` exposes the whole folder; in tailscale mode the page's requests to `/api/` carry the user's identity) and five LOW. The owner chose: token bound to its address, its session and 24 hours from issue; only the page for a broad folder; refuse cross-site requests to `/api/`; add `Range`. Fixed through 4.11 to 4.15, 5.7 to 5.10 and 8.4; the LOW ones on WebRTC and DNS, the false «or a frame» claim and the stale script names were fixed in the design and these tasks.
  - The fix changes the authentication hook and the wiring of `PageTokens`, so the review runs again; tick this task when that run has no CRITICAL, HIGH or MEDIUM finding left.
- [ ] 9.3 Open the pull request with `/ka:commit --pr`.
- [ ] 9.4 Run `/ka:review-pr` in rounds as the bounded review loop says, recording each with `ka review-rounds record`; tick this task once `ka review-rounds gate` passes and the pending suggestions have gone through `ka-evaluator`.

## 10. Update the feature catalogue

- [ ] 10.1 Run `/ka:update-features render-html-files` for the added requirements of `file-viewer`.
- [ ] 10.2 Run `ka features-check --strict` with exit code 0.
- [ ] 10.3 Commit the catalogue with `/ka:commit`.

## 11. E2E pipeline

- [x] 11.1 The project has no E2E suite; this step does not apply.

## 12. Human review

- [ ] 12.1 Ask the user with `AskUserQuestion` who reviews the pull request, and wait for the approval or record that the user takes it as good. The review includes opening a page in Safari on a Mac, the risk the design leaves open for `'self'`.

## 13. Feature catalogue check before the archive

- [ ] 13.1 Run `ka features-check --strict` with exit code 0 as the last task before `/opsx:archive`.

## Workflow follow-up

- Run `/opsx:archive`, commit the archive moves with `/ka:commit`, check the pull request's head matches `git rev-parse HEAD`, and merge with `gh pr merge --squash --match-head-commit <commit>` on the owner's yes.
- Follow the `deploy` run of the merge commit with `gh run watch`.
- Offer to comment and close Issue #83 and to remove the worktree with `/ka:git-worktree remove`.
