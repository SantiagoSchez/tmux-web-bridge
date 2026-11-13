# AGENTS.md

Entry point for AI coding agents working on this repository. Claude Code imports it from `CLAUDE.md`; other agents read it directly.

## Single source of truth

Every technical standard, convention and workflow rule lives under [`docs/dev-standards/`](./docs/dev-standards/). Read [`docs/dev-standards/base-standards.md`](./docs/dev-standards/base-standards.md) before writing anything: it holds the principles and the index of every other standard, including the [testing standards](./docs/dev-standards/testing-standards.md) and the [documentation standards](./docs/dev-standards/documentation-standards.md).

## The koalarnes harness

The project works with the koalarnes plugin. [`docs/dev-standards/koalarnes.md`](./docs/dev-standards/koalarnes.md) lists its skills, its MCP servers and the OpenSpec pipeline every change follows; [`.claude/rules/koalarnes-mandatory-steps.md`](./.claude/rules/koalarnes-mandatory-steps.md) holds the steps every `tasks.md` must include and each layer's commands. Both are generated from [`.claude/koalarnes.json`](./.claude/koalarnes.json): change the configuration and run `ka sync`, never edit them.
