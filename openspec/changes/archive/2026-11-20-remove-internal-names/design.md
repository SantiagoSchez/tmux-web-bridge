# Design

## Context

The names to remove are in four kinds of place: the capability specs (as examples in scenarios), the archived changes (as the machines where a fix was checked), the server tests (as fixture values) and the texts on GitHub (issue and pull request descriptions, the agent's comments). Production code holds none: its placeholders (`192.168.1.20`, `MacBook Air`) are generic. The feature catalogue holds none either.

This design, the proposal, the tasks and the spec deltas never write the original names: they would publish them again. The list of names and their replacements lives in a script outside the repository, in the session's scratchpad.

## Goals / Non-Goals

**Goals:**

- No tracked file and no text the agent controls on GitHub names the owner's machines, projects or network addresses.
- Every agent learns the rule before it writes the next artifact.

**Non-Goals:**

- The git history and GitHub's edit history (see the proposal's Non-goals).

## Decisions

### D1. Descriptive generic names, one per machine and per project

Each machine gets a name that says what it is: `linux-box` (the hub's Proxmox host, which the scheduled-messages scenarios use as an ordinary machine), `bot-box` (where the Telegram bot runs its own Claude Code), `dev-box` (the development container), `hub-box` (the hub's container). The owner's project becomes `shop`, its sessions `shop-platform` and `shop-generator`. The display name of a machine in the tests follows its id (`Linux-box`).

- Alternative: neutral names (`host-a`, `project-a`). Rejected by the owner: they say less about the role each machine plays in an example.

### D2. Example addresses outside the owner's networks

The tailnet address becomes `100.64.0.10` (the start of the shared address range that tailnets use), the LAN ones `192.168.50.x` and the internal ones `10.20.30.x`, keeping each last octet so the tests read the same. The invalid LAN address of the validation test keeps its invalid octet (`300`).

### D3. The specs change through MODIFIED deltas

The scenarios of `scheduled-messages`, `usage-limits` and `window-details` change only their example values, so no behaviour changes. They still go through MODIFIED deltas, with each requirement block whole, so the archive syncs them like any other change and the main specs are never edited by hand. `skip_specs: true` would leave the main specs with the old names, or edit them outside the archive.

### D4. The archive is edited in place

The archived changes are history, and the rule says not to rewrite them. Here the history itself is what must not stay published, so the names are replaced in place, with the same mapping, and nothing else in those files changes.

### D5. The rule lives in the base standards, with one line in AGENTS.md

A new principle in `docs/dev-standards/base-standards.md` says what never goes into anything published and what to write instead. `AGENTS.md` gets one line under «Always in view» that links it: the rule can be broken from any task, at a cost that cannot be undone, which is what that section is for.

## Risks / Trade-offs

- [A test asserts a value built from a replaced name, such as an error message that names the machine] → The same mapping applies to the fixture and to the expected text; the server tests must pass unchanged in count.
- [A name in a form the script does not match, such as another capitalization] → A case-insensitive search of every tracked file after the replacement must find none.
- [The names stay in the git history and in GitHub's edit history] → Out of scope by the owner's choice; the owner can delete edit revisions on GitHub.

## Migration Plan

None. The merge into `master` deploys the hub with no code change; nothing reaches the machines.
