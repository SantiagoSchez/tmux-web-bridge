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
- [x] 4.4 Add tests that run `pageFileScript(dir, rel)` for real with `/bin/sh` against a temporary folder, through a fake host as in `temp.test.ts` (D4): a regular file gives its size; a missing file, a folder, a symbolic link to a file inside the folder, a symbolic link to a file outside it and a file below a linked folder are each refused with their tag; `dir` reached through a symbolic link still serves its files; a name with spaces and quotes works. See them fail, then write `pageFileScript` and its parser (`statPageFile(host, dir, rel)`, throwing `FileError` 404) until they pass.
- [x] 4.5 Add a test for the folder a page is issued for: `pageFolderScript(path)` run with `/bin/sh` gives the physical path of the file's folder (`cd -P`), also when the folder is reached through a symbolic link. See it fail, then write it until it passes.
- [ ] 4.6 Commit the group with `/ka:commit` once `pnpm --filter server test` and `pnpm --filter server typecheck` pass.

## 5. The routes and the hook

- [ ] 5.1 Add `FilePageRequest` and `FilePage` to `shared/types.ts` (D8).
- [ ] 5.2 In `server/src/index.ts`, instantiate `PageTokens`, add `POST /api/files/page` (narrow the body, resolve as `/api/files` does, `pageFolderScript`, issue the token with `req.sessionId ?? null`, answer `FilePage`; errors through `fileError`) and `GET /api/page/:token/*` (token through `PageTokens.get`, `pagePath`, `statPageFile`, `streamHostFile`, the headers of D5 with `pageContentType`; an unknown or expired token, or a refused path, answers 404, the token's one with the Spanish «caducado» page of D2). Kill the stream when the browser closes the request, as `/api/files` does.
- [ ] 5.3 In the `onRequest` hook, count the matched route `/api/page/:token/*` as open in the password branch only (D3); in `closeSessions()`, call `pages.dropSessions(ids)` (D2). `pnpm --filter server typecheck` passes.
- [ ] 5.4 Boot smoke test: start the hub with an isolated `HOME`, `TMUX_TMPDIR` and data folder on a loopback port (no `TMUX`/`TMUX_PANE`, any `local` machine on its own socket with `-f /dev/null`), wait for its ready log line, then stop it. Record the line in this task.
- [ ] 5.5 Manual endpoint testing with `curl` against that hub, password login: `POST /api/files/page` without a session (401), with a foreign `Origin` (403), with an unknown machine (400) and a missing file (404), and with an HTML file (200, a `url`); `GET` of that `url` (200, `text/html`, every header of D5), of a sibling `estilo.css` (`text/css`), of `.env`, `.git/config`, `%2e%2e/x`, `..%2fx`, a link pointing out and a folder (404 each, no content), of an unknown token (404 with the «caducado» page); after logging out, the same `url` answers the «caducado» page. Record the results in this task.
- [ ] 5.6 Commit the group with `/ka:commit` once `pnpm --filter server test` and `pnpm --filter server typecheck` pass.

## 6. The viewer

- [ ] 6.1 In `web/src/components/Files.tsx`, make `fileKind` return `'html'` for `isHtml` names; in `useFile`, for that kind, read the text as now and also ask `POST /api/files/page`, keeping its `url` in `LoadedFile.page` (null until then, and on error, which shows like the other errors) (D8).
- [ ] 6.2 In `FileBody`, show `<iframe class="file-page" sandbox="allow-scripts" referrerpolicy="no-referrer" src={page}>` for the `html` kind when not raw (D6); in `FileView`, offer «Ver el texto» / «Ver renderizado» for `markdown` and `html`, and point «Abrir aparte» to `page` for an HTML file, disabled until it arrives. Add `.file-page` to `web/src/styles.css` (full width, filling the sheet's height, white background as a page expects, using a custom property). `pnpm --filter web typecheck` passes.
- [ ] 6.3 Check it by hand in a browser against an isolated hub (its own `HOME` and `TMUX_TMPDIR`, a tmux on its own socket started with `-f /dev/null`, never the user's tmux), at 411 px and at 1280 px, with a folder holding `informe.html` (heading, table, inline script drawing on a `<canvas>`, `estilo.css`, `img/logo.png`, `fetch('datos.json')`, a link to `otra.html`, a `<script>` from a CDN, a `fetch` to another site, reads of `document.cookie`, `window.parent.document` and `localStorage`, a `fetch` of `.env`), `.env` and `PORTADA.HTM`. Walk every scenario of `specs/file-viewer/spec.md`: rendered view, toggle, upper-case extension, «Abrir aparte», the explorer's preview, the blocked requests (DevTools console and the hub's log), the refused files. Record what was checked in this task.
- [ ] 6.4 Commit the group with `/ka:commit` once `pnpm --filter web typecheck` and `pnpm --filter server test` pass.

## 7. Run tests, typecheck and lint

- [ ] 7.1 Run `pnpm --filter server test`, `pnpm --filter server typecheck` and `pnpm --filter web typecheck`, all green; run `ka scope` and the checks it lists (`ka features-check`, `ka docs-check`), or record them as not applicable.

## 8. Update the documentation and the changelog

- [ ] 8.1 Run `/ka:update-docs` for the new API contract (`POST /api/files/page`, `GET /api/page/<token>/…`), the hook's new open route and the user-visible flow; the server standards' line on authentication names the page route's token as one more credential.
- [ ] 8.2 Add the changelog entry with `/ka:changelog --issue 83`: HTML files open rendered in the viewer and with «Abrir aparte», with their folder's files, isolated from the panel and without internet access.
- [ ] 8.3 Commit the group with `/ka:commit` once `pnpm --filter server test` and `pnpm --filter web typecheck` pass.

## 9. Review loop

- [ ] 9.1 Run `/opsx:verify` and fix what it reports through the artifacts.
- [ ] 9.2 Run `/ka:adversarial-review render-html-files`: it applies because the change adds a service to the composition root and changes the authentication hook (dependency wiring), and opens a new route that serves files of a machine to a token instead of the session.
- [ ] 9.3 Open the pull request with `/ka:commit --pr`.
- [ ] 9.4 Run `/ka:review-pr` in rounds as the bounded review loop says, recording each with `ka review-rounds record`; tick this task once `ka review-rounds gate` passes and the pending suggestions have gone through `ka-evaluator`.

## 10. Update the feature catalogue

- [ ] 10.1 Run `/ka:update-features render-html-files` for the added requirements of `file-viewer`.
- [ ] 10.2 Run `ka features-check --strict` with exit code 0.
- [ ] 10.3 Commit the catalogue with `/ka:commit`.

## 11. E2E pipeline

- [ ] 11.1 The project has no E2E suite; this step does not apply.

## 12. Human review

- [ ] 12.1 Ask the user with `AskUserQuestion` who reviews the pull request, and wait for the approval or record that the user takes it as good. The review includes opening a page in Safari on a Mac, the risk the design leaves open for `'self'`.

## 13. Feature catalogue check before the archive

- [ ] 13.1 Run `ka features-check --strict` with exit code 0 as the last task before `/opsx:archive`.

## Workflow follow-up

- Run `/opsx:archive`, commit the archive moves with `/ka:commit`, check the pull request's head matches `git rev-parse HEAD`, and merge with `gh pr merge --squash --match-head-commit <commit>` on the owner's yes.
- Follow the `deploy` run of the merge commit with `gh run watch`.
- Offer to comment and close Issue #83 and to remove the worktree with `/ka:git-worktree remove`.
