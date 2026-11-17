# Design

## Context

Two shell scripts that the hub runs on each machine read a project's harness configuration, both from `$top/.claude/koalarnes.json`, where `$top` is the repository's top level:

- `contextScript` in `server/src/project-refs.ts` prints the file on one line under the tag `K`. `parseContext` takes `platform.host`, `platform.repository` and `tracker.board` from it.
- `PROJECT_BASE` in `server/src/worktree-base.ts`, shared by `branchesScript` and the worktree preparation, pulls `git.baseBranch` out of the file with `sed`, without a JSON parser.

Both cap the read at 64 KiB (`MAX_CONFIG`) and treat a missing or malformed file as no configuration. `ka sync` renames the file to `.claude/ka.json` in each project as it is migrated. The owner's other projects move one by one, so for some time a machine holds projects with either name.

## Goals / Non-Goals

**Goals:**

- Both readers find a migrated project's configuration.
- A project still on `.claude/koalarnes.json` behaves exactly as today.
- The two readers always pick the same file.

**Non-Goals:**

- Changing what is read from the file or how it is parsed.
- Removing the old name.

## Decisions

### D1. The newer file wins as a whole, not key by key

**Context.** A project could hold both files: a half-finished migration, or an old file left behind.

**Decision.** The configuration is `.claude/ka.json` when that file exists, else `.claude/koalarnes.json`. The choice is made per file, before anything is parsed. A `.claude/ka.json` that lacks a key does not borrow it from `.claude/koalarnes.json`.

**Consequences.** It matches `ka sync`, which moves the file rather than copying it, and keeps the readers simple: one path, then the current code. A `.claude/ka.json` that is present but malformed hides a valid `.claude/koalarnes.json`, which is the same thing a malformed file does today.

### D2. One shell fragment chooses the file for both readers

**Decision.** A shared fragment in a small server module (`server/src/harness-config.ts`) sets `f` to the chosen path: `f="$top/.claude/ka.json"; [ -f "$f" ] || f="$top/.claude/koalarnes.json"; `. `contextScript` and `PROJECT_BASE` use it in place of their own `f=…` assignment, and `MAX_CONFIG` moves there too.

**Alternatives.** Repeating the two lines in each script: it is shorter, but the two readers could then disagree about which file counts, which is the drift this change exists to fix.

**Consequences.** Both scripts keep their shape, the extra `[ -f ]` test costs nothing measurable, and a future rename touches one place.

### D3. The old name stays readable

**Context.** The rule against keeping compatibility paths exempts what others depend on outside the repository. Each `.claude/koalarnes.json` lives in a project on the owner's machines, not in this repository.

**Decision.** Keep reading `.claude/koalarnes.json` as the fallback, with no end date.

**Consequences.** Projects that have not migrated keep their links and base branch. Removing the fallback later is a separate change, once no project uses the old name.

## Risks / Trade-offs

- [A project holds an outdated `.claude/ka.json` next to the current `.claude/koalarnes.json`] → `.claude/ka.json` wins (D1). `ka sync` never leaves the two that way, so this needs someone to create the new file by hand.
- [The terminal caches a project's links for five minutes] → a project migrated while a terminal is open shows the new configuration after that window, as with any other edit to the file today.
