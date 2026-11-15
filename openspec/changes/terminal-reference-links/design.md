# Design

## Context

See `proposal.md` for the motivation and `specs/terminal-links/spec.md` for the required behaviour.

What exists today:

- `web/src/components/TerminalView.tsx` registers two kinds of xterm links: `WebLinksAddon` for URLs and `fileLinkProvider` (`web/src/fileLinks.ts`) for file paths, whose detection is the pure `findPathsInRows` of `shared/paths.ts`. A tap on a touch device goes through `linkAt()`, which asks every registered provider **synchronously** and activates the first link under the finger inside the tap's gesture.
- File links open in the panel's viewer through `openFile(origin, path)` (`web/src/components/Files.tsx`) and preview on hover through `peekFile(origin, path, line, e)` (`web/src/components/FilePeek.tsx`). Both read the file with `GET /api/files`, which accepts absolute paths on the pane's machine.
- `POST /api/upload` (`server/src/index.ts`) writes a file to `/tmp/twb-uploads/` on the pane's machine and pastes its path into the pane. Claude Code turns a pasted image path into `[Image #N]`.
- The host kit sets the pane option `@claude_session` (`host-kit/tmux-window-title.sh`); the hub already reads it into `PaneInfo.claudeSession` (`server/src/host.ts`).
- Claude Code writes every pasted image, as soon as it is pasted, to `<tmp>/claude-<uid>/<encoded cwd>/<session>/images/<N>.<ext>` (`png`, `jpg`…). Checked with Claude Code 2.1.325 on this machine (`/tmp/claude-1000/…`): the files stay after the message is sent and six of seven were byte-identical to the image stored in the transcript; the seventh is consistent with a renumbered image overwriting an older one. The third-party plugin `paste-preview` reads the same folder. It is Claude Code's internal layout, not an API. The numbering is per Claude Code process and can start again at 1 in the same session, so `<N>.<ext>` holds the latest image with that number. One session can have folders under several `<encoded cwd>` when its folder changed.
- `TrelloService` (`server/src/trello.ts`) calls the Trello REST API with the account of Ajustes › Trello and throws `TrelloSetupError` when there is none or Trello rejects it. Routes answer `setup: true` for it.
- A koalarnes project's `.claude/koalarnes.json` has `platform: { host, repository }` and, for Trello, `tracker: { kind: "trello", board: "<shortLink>" }`.

## Goals / Non-Goals

**Goals:**

- A tap on a reference opens its page inside the tap's gesture, so the browser does not block the new tab.
- Detection and URL building are pure functions in `shared/`, unit-tested from `server/`.
- No new persisted state, no change to existing payloads, no host-kit change, nothing written on the machines.

**Non-Goals:**

- Caching Trello lookups on the hub.
- Looking for images of Claude Code sessions other than the one in `@claude_session`.

## Flow

```text
Terminal opens / pane folder changes
  web  ── GET /api/refs/context?host&window&pane ──▶ hub
  hub  ── shell script in the pane's folder (koalarnes.json + origin) ──▶ machine
  hub  ◀── K\t<json> / O\t<url> ── machine
  web  ◀── RefContext { repo?: { host, path }, trelloBoard? } ── hub
  (web keeps it per host+folder; the reference provider links only what it supports)

Tap on "PR #12" / "Issue #3" / "pipeline #9"
  web: refUrl(ref, context) ──▶ window.open(url)            (no request)

Tap on "Trello #470"
  web: w = window.open('about:blank')                        (inside the gesture)
  web  ── GET /api/trello/card-url?board&n ──▶ hub ── GET /1/boards/{board}/cards/{n} ──▶ Trello
  web  ◀── { url } ── hub        → w.location = url
       ◀── 4xx { error, setup? } → w.close(), error toast

Tap or hover on "[Image #N]"
  web  ── GET /api/claude-image?host&pane&n ──▶ hub
  hub: pane.claudeSession → shell script on the machine:
       ls -t <tmp>/claude-$(id -u)/*/<session>/images/<N>.* → newest path
  web  ◀── { path } → openFile(origin, path) / peekFile(origin, path)
       ◀── 404 { error } → error toast
```

## Decisions

### D1. Resolve the project context ahead of the tap, build URLs in the browser

**Context.** `linkAt()` asks providers synchronously, and a new tab opened after an `await` is blocked on phones. The URL of a pull request, issue or pipeline depends only on the repository host and path.

**Decision.** The web fetches a `RefContext` once per host and pane folder (`GET /api/refs/context`) and keeps it in memory for five minutes. The reference provider builds links only for references the context supports, with the pure `refUrl()` of `shared/refs.ts`. `TerminalView` reads the context as soon as the terminal opens or moves to another pane, so it is usually there before the first tap. Until it arrives, the provider answers the mouse once the read finishes: xterm keeps a row's answer while the mouse stays on it, so an early empty answer would hide the links until the mouse left the row (seen in the manual check). A tap only uses a context already read.

**Alternatives.** Resolving each reference on click through the hub: needs a blank tab trick for every kind and underlines references that then fail. Adding the remote to `PaneGit` in `GitScanner`: broadcasts it to every device every 15 s for a value read on demand only.

**Consequences.** A reference written in a project whose context changes (a new `koalarnes.json`) picks the change up within five minutes or when the terminal is reopened.

### D2. koalarnes.json first, `origin` second

The context script runs in the pane's folder: it prints the top level's `.claude/koalarnes.json` (tag `K`) and `git remote get-url origin` (tag `O`). The hub parses both: `platform.host` (`github` or `bitbucket`) with `platform.repository` (`owner/repo`) wins; otherwise the pure `parseRemote()` of `shared/refs.ts` reads `git@`, `ssh://` and `https://` remotes of `github.com` and `bitbucket.org`, with or without `.git` and a user. `tracker.board` is taken only from koalarnes.json. Any other host or a malformed file gives no `repo`, and nothing is linked.

### D3. `Trello #N` opens a blank tab first

**Context.** The card's URL (`shortUrl`) needs a Trello API call, which cannot finish inside the tap's gesture.

**Decision.** On activation the web opens `about:blank` synchronously, then asks `GET /api/trello/card-url?board=<shortLink>&n=<N>`. On success it sets the tab's location; on error it closes the tab and shows the hub's message as an error toast. `TrelloService.cardUrl(board, n)` calls `GET /1/boards/{board}/cards/{n}?fields=shortUrl`. The board is checked against `^[A-Za-z0-9]{8}$|^[0-9a-f]{24}$` and N against `^\d{1,7}$` before the call.

**Verified:** the route accepts the short number as `{n}`. With the owner's account on board `0mGPkF10`, cards 1 and 12 answer 200 with their `shortUrl` and number 9999999 answers 404 «Could not find the card». The fallback of listing every card of the board was not needed.

### D4. `[Image #N]` is Claude Code's own `images/<N>` file

**Context.** Claude Code already writes every pasted image to disk, sent or not (see Context). The alternatives were a hub-side record of the panel's uploads, which guesses the number and misses images pasted by other means, and decoding the base64 block out of the session transcript.

**Decision.** `GET /api/claude-image?host&pane&n` answers `ClaudeImageResult { path }` or 404. The hub takes `pane.claudeSession` (checked against `^[0-9a-f-]{36}$`; no session is 404) and N (`^\d{1,4}$`), and runs one read-only script on the machine. It looks in `claude-$(id -u)` under each candidate temporary folder (`$TMPDIR`, `/tmp`, and on macOS `getconf DARWIN_USER_TEMP_DIR`), matches `*/<session>/images/<N>.*`, and prints the most recently modified match (`ls -t`). The web opens that absolute path with `openFile` and `peekFile`, which read it through `GET /api/files` unchanged. The owner chose this folder as the only source, without the transcript as a fallback.

**Consequences.** Nothing is written on the machine and no state is kept on the hub. The feature depends on an undocumented Claude Code layout: if a release moves the folder, or the machine empties its temporary folder (a reboot), the link answers «No encuentro la imagen N». The newest file wins when a session has folders under several working directories.

**Verified on Linux, pending on macOS:** on this machine Claude Code 2.1.325 writes to `/tmp/claude-<uid>/`, which the script finds. The owner moved the macOS check to after the deploy: a `[Image #N]` of a Claude Code on the Mac is tapped in the deployed panel, and a miss is fixed in a `bugfix/` branch by adjusting the candidate list above.

### D5. Two link providers, one module for detection

`shared/refs.ts` holds `findRefs(text)` (references and image placeholders with their ranges in a row), `parseRemote(url)` and `refUrl(kind, n, repo)`. `web/src/refLinks.ts` holds `refLinkProvider` (references) and `imageLinkProvider` (placeholders), registered in `TerminalView` next to `fileLinkProvider`, reusing its row reading. A reference broken across two rows is not linked.

### D6. New shared types

`RefRepo { host: 'github' | 'bitbucket'; path: string }`, `RefContext { repo?: RefRepo; trelloBoard?: string }`, `TrelloCardUrl { url: string }` and `ClaudeImageResult { path: string }` go in `shared/types.ts`. No wiring or bootstrap changes: the routes are added to `index.ts` under the HTTP API section; no boot smoke test is needed beyond the usual dev start.

## Risks / Trade-offs

- [Claude Code moves or stops writing the `images/` folder in a future release] → `[Image #N]` answers «not found»; the references are unaffected. The folder layout is pinned in one place (the script of D4), so adapting it is a one-function change.
- [The machine empties its temporary folder while a session is still open] → Older images of that session answer «not found». Accepted by the owner over keeping the transcript as a fallback.
- [The Trello route may not accept the short number] → Fallback in D3, verified with a real call before the task is closed.
- [A blank tab flashes and closes when the Trello lookup fails] → Only on error; the toast explains it.

## Migration Plan

None: new endpoints and new links only. Rolling back is reverting the change.
