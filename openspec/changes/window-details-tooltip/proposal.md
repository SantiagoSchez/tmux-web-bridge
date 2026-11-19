# Proposal

GitHub issue: [#57 Tooltip con los detalles de la ventana y nombre descriptivo al lanzar desde Trello](https://github.com/SantiagoSchez/tmux-web-bridge/issues/57).

## Why

The panel's window list cuts window names, branches, worktrees and space names with «…», and there is no way to read them whole: only the second line has a native `title`, and the window name, the part that gets cut most, has none. Windows launched from a Trello card make it worse: they are named after the card's worktree slug (`feat/481-permitir-reintentar-…`), which says little and is cut after a few words.

## What Changes

- Resting the mouse for 1 s on a window of the list shows a tooltip with its full details: the window's full name, its state with its icon and since when, and, for each pane, its command, its git worktree or branch, its folder and its Claude account when it has one.
- The same tooltip shows on a space of a single window (with the space's name), on a space's header (its full name and number of windows) and on the pane buttons of the folded list (the rail).
- The tooltip replaces the native `title` of the window's second line (branch, worktree or folder), of the rail's pane buttons and of a space header's fold button, so two tooltips never show at once.
- It shows only with a mouse; touch screens keep today's behaviour.
- Every launch that carries a Trello card (from the Chrome extension or from the panel's Trello drawer) adds an instruction to the prompt: before anything else, the agent renames its own tmux window with a summary of the card's title, without its number, of at most 30 characters. Until then the window keeps the name it is launched with. Launches without a card do not change.
- The hub reads the card before launching, to put its title in that instruction, and reuses that read to move the card to Doing and comment on it.

## Capabilities

### New Capabilities

- `window-details`: the details of a window, a space or a pending pane the panel shows on hover: what they hold, where they show, when they open and close.
- `trello-card-launch`: what a task launched on a Trello card gets from the card: the instruction to rename its window after the card's title.

### Modified Capabilities

None.

## Impact

- Layers: `web` (`web/src/components/Tree.tsx`, `web/src/components/Rail.tsx`, a new hover tooltip component mounted in `web/src/components/App.tsx`, `web/src/styles.css`) and `server` (`server/src/tasks.ts`, `server/src/index.ts` `launchFromRequest`, `server/src/trello.ts` `afterLaunch`).
- External services: Trello's REST API (the card is read once per launch, as before, but before the launch instead of after it). Claude Code on the machine runs `tmux rename-window` on its own pane.
- Contracts: no API payload changes. `ExtLaunchRequest` and `ExtLaunchResult` stay as they are; the text typed into the new window changes when a card is attached. No message payload, migration or environment variable changes.
- The Trello extension is not rebuilt: the change lives in the hub.

## Non-goals

- A tooltip on touch screens (long press) or on the grid view's tiles.
- The hub summarising the title itself (with the dictation LLM or otherwise): the agent does it.
- Renaming windows launched without a card, by automations or by «Nuevo espacio».
- Making the rename instruction editable in Ajustes › Trello.
- Changing the name a card's window is launched with, or the comment left on the card (it still names the window as launched).
