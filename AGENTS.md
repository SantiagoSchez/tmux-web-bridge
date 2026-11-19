# AGENTS.md

Entry point for AI coding agents working on this repository. Claude Code imports it from `CLAUDE.md`; other agents read it directly. It is loaded into every turn, so it holds only the index of the standards and the few instructions that must always be in view. Everything else belongs in the standards.

## Standards index

Every technical standard, convention and workflow rule lives under [`docs/dev-standards/`](./docs/dev-standards/). Open each document when its row applies, before you write anything:

| Open | When |
|---|---|
| [Base standards](./docs/dev-standards/base-standards.md) | Always: the principles, the language of each artifact and the workflow of a change. |
| [server standards](./docs/dev-standards/server-standards.md) | Before reading or changing the `server` layer (`server/**, shared/**`). |
| [web standards](./docs/dev-standards/web-standards.md) | Before reading or changing the `web` layer (`web/**`). |
| [trello-extension standards](./docs/dev-standards/trello-extension-standards.md) | Before reading or changing the `trello-extension` layer (`trello-extension/**`). |
| [host-kit standards](./docs/dev-standards/host-kit-standards.md) | Before reading or changing the `host-kit` layer (`host-kit/**, server/src/kit.ts, scripts/test-kit-update.sh, scripts/test-window-title.sh`). |
| [Testing standards](./docs/dev-standards/testing-standards.md) | Before writing or changing a test, or deciding which level one belongs at. |
| [Documentation standards](./docs/dev-standards/documentation-standards.md) | Before writing a comment, a docstring, an ADR, a standards document, a changelog entry or the feature catalogue. |
| [Release standards](./docs/dev-standards/release-standards.md) | Before cutting a release, and to know what a merge into `master` deploys. |
| [The koalarnes harness](./docs/dev-standards/ka.md) | To pick the skill, the agent or the MCP server for a task, or to see the OpenSpec pipeline. |

A new standards document gets its row here, with the paths or the kind of task that call for it: a document the index does not announce is never opened.

## The koalarnes harness

The project works with the koalarnes plugin. [`.claude/rules/ka-mandatory-steps.md`](./.claude/rules/ka-mandatory-steps.md) holds the steps every `tasks.md` must include and each layer's commands, and is always applied. It and [`docs/dev-standards/ka.md`](./docs/dev-standards/ka.md) are generated from [`.claude/ka.json`](./.claude/ka.json): change the configuration and run `ka sync`, never edit them.

## Always in view

- Never merge a pull request without the owner's yes in the chat. See [the workflow](./docs/dev-standards/base-standards.md#workflow).
- When a feature is merged, deployed and checked, propose a release: the version (`ka changelog release --dry-run`) and what it would hold. Cut it only on the owner's yes. See [the release standards](./docs/dev-standards/release-standards.md#cutting-a-release).
- Never run a bare `tmux`, or `host-kit/install.sh` by hand, in a test or a manual check: they reach the user's real tmux server. See [the host-kit standards](./docs/dev-standards/host-kit-standards.md#testing).
