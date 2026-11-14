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
| [host-kit standards](./docs/dev-standards/host-kit-standards.md) | Before reading or changing the `host-kit` layer (`host-kit/**, server/src/kit.ts, scripts/test-kit-update.sh`). |
| [Testing standards](./docs/dev-standards/testing-standards.md) | Before writing or changing a test, or deciding which level one belongs at. |
| [Documentation standards](./docs/dev-standards/documentation-standards.md) | Before writing a comment, a docstring, an ADR, a standards document, a changelog entry or the feature catalogue. |
| [The koalarnes harness](./docs/dev-standards/koalarnes.md) | To pick the skill, the agent or the MCP server for a task, or to see the OpenSpec pipeline. |

A new standards document gets its row here, with the paths or the kind of task that call for it: a document the index does not announce is never opened.

## The koalarnes harness

The project works with the koalarnes plugin. [`.claude/rules/koalarnes-mandatory-steps.md`](./.claude/rules/koalarnes-mandatory-steps.md) holds the steps every `tasks.md` must include and each layer's commands, and is always applied. It and [`docs/dev-standards/koalarnes.md`](./docs/dev-standards/koalarnes.md) are generated from [`.claude/koalarnes.json`](./.claude/koalarnes.json): change the configuration and run `ka sync`, never edit them.

## Always in view

Beyond the index, this file takes only the instructions an agent would not go and look for when they apply: what to do at a moment no task announces, and the prohibitions any task can break at a high cost. Each takes one or two lines and links the standard that holds the detail.
