# Proposal

GitHub issue: [Issue #12](https://github.com/SantiagoSchez/tmux-web-bridge/issues/12).

## Why

Agents write references such as `Trello #470`, `PR #123`, `Issue #42` or `pipeline #1987` in the terminal, and Claude Code shows attached images as `[Image #1]`. In the panel they are plain text: the owner has to look the card, the pull request or the image up by hand, often from a phone. The panel already turns URLs and file paths into links; these references are the next most common thing an agent points at.

## What Changes

- The panel's terminal turns `PR #N`, `Issue #N` and `pipeline #N` into links to the pull request, the issue or the Bitbucket Pipelines run of the pane's repository (GitHub or Bitbucket). `pipeline #N` is linked only on Bitbucket.
- The terminal turns `Trello #N` into a link to the card whose short number is N on the board of the pane's project. The hub looks the card's URL up with the Trello account of Ajustes › Trello.
- The repository and the board come from the `.claude/koalarnes.json` of the pane's project (`platform.host`, `platform.repository`, `tracker.board`). Without that file, pull requests, issues and pipelines fall back to the `origin` remote; `Trello #N` is linked only when the project names a board. A reference the pane's project cannot resolve is not underlined.
- Clicking or tapping a reference opens its page in a new tab.
- The terminal turns `[Image #N]` into a link that opens that image in the panel's file viewer, with the same preview on mouse hover as file paths. The image is the file Claude Code itself writes for each pasted image, sent or not, under `<tmp>/claude-<uid>/<project>/<session>/images/<N>.<ext>` on the pane's machine. The session is the one in the `@claude_session` tmux option the host kit already sets.
- New hub endpoints, all under the existing password session:
  - `GET /api/refs/context`: what the pane's project lets the panel link (repository host and path, Trello board).
  - `GET /api/trello/card-url`: the URL of a Trello card from its board and short number.
  - `GET /api/claude-image`: the path, on the pane's machine, of the image behind `[Image #N]`.
- New shared types in `shared/types.ts` for those payloads (`RefContext`, `TrelloCardUrl`, `ClaudeImageResult`). No existing payload, message or stored file changes, and no environment variable is added.

## Capabilities

### New Capabilities

- `terminal-links`: which text of the panel's terminal becomes a link, where each kind of link leads, and when a link is not offered. Covers the new reference and image-placeholder links; the existing URL and file-path links are left for a later change to describe.

### Modified Capabilities

None: `openspec/specs/` has no capabilities yet.

## Impact

- Layers: `server` (the three endpoints, the image lookup, the Trello lookup, and the pure detection and URL logic in `shared/`) and `web` (a link provider for references, a link provider for image placeholders, both wired in `TerminalView`). `host-kit` is read, not changed: the hub relies on `@claude_session`.
- External services: the Trello REST API (one card lookup per click on a `Trello #N`). GitHub and Bitbucket are only linked to, never called.
- Machines: the hub runs two new read-only shell scripts on the pane's machine (project context, image lookup) and writes nothing there.
- Dependency on Claude Code internals: the `images/` folder is Claude Code's own layout, not a documented API. If a Claude Code release moves it, or the machine empties its temporary folder, `[Image #N]` answers «not found» until this change is adapted.
- Contracts: three new REST endpoints and their types; nothing existing changes.

## Non-goals

- Showing the title of a card, pull request or issue on hover.
- Linking `pipeline #N` on GitHub Actions, where the run number does not form the URL.
- Linking other wordings (`card #N`, `#N` alone, `PRs #1 and #2`) or the labels a project sets in `changelog.refs`.
- Describing the existing URL and file-path links in the new capability spec.
- Reading images from the session transcript (`*.jsonl`) when Claude Code's `images/` file is gone.
