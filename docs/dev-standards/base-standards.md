# Base standards

The single source of truth for how AI agents and humans work on this codebase. `AGENTS.md`, `CLAUDE.md` and `openspec/config.yaml` point back here. This file was generated once by the koalarnes plugin; the project owns it now, so edit it freely.

## The principles

1. **Languages are fixed per artifact.** Code, identifiers and code comments are in English. OpenSpec artifacts (proposal, design, specs, tasks), standards documents and test descriptions are in `en`; the full list is under [Languages](#languages). When a skill writes into content that already exists (a tracker card, a manual chapter), it matches that content's language.
2. **The spec-driven flow is mandatory.** Every change starts with OpenSpec artifacts, not code: features, bug fixes, hotfixes, chores and documentation alike. The only exceptions are the release commit, the harness's own setup or update, and a dependency bump that changes no code ([the mandatory task steps](../../.claude/rules/ka-mandatory-steps.md)). See [Workflow](#workflow).
3. **Tests first.** Write a failing test before the implementation and order `tasks.md` that way: failing test, minimal implementation, refactor. Tests follow the [testing standards](./testing-standards.md).
4. **No escape hatches.** Do not silence the type checker, the linter or a failing test to get past a problem (untyped values, unchecked casts, ignore comments, skipped tests). Surface the problem and ask before reaching for one. A runtime guard that receives an untyped value and narrows it before use is the one honest exception.
5. **Reuse before invention.** Before adding a helper, look for one in the shared packages, then in the layer's own utilities. A second copy of a helper is a future divergence.
6. **Cross-layer awareness.** A contract shared by several layers (an HTTP payload, a message or job payload, a shared type) has producers and consumers that drift apart. A change to one audits every call site. A change to dependency wiring or bootstrap needs a boot smoke test: typecheck and unit tests miss it.
7. **Docs co-evolve with code.** A behaviour change updates its capability spec under `openspec/specs/` (through a change under `openspec/changes/`). A change to an API contract, the data model, a payload, an environment variable or a user-visible flow updates the standards documents here and adds a changelog entry. See the [documentation standards](./documentation-standards.md).
8. **The repository is public.** Nothing published names the owner's own machines (hostnames, container ids), other projects (repository or tmux session names), people or network addresses. Published means every tracked file (specs, OpenSpec artifacts, tests, docs), commit messages, and the texts of issues, pull requests and their comments. Use generic names: `linux-box`, `dev-box` or `mac` for machines, `shop` or `my-app` for projects, and example addresses such as `192.168.50.10`. Check before each commit, issue, pull request or comment. A real name in a tool's output or a log stays out of what you publish.

## Standards index

The index of every standards document, with when to open each, is in [`AGENTS.md`](../../AGENTS.md), which every agent has in view in every turn. A new standards document gets its row there.

## Debugging an elusive failure

When a failure does not explain itself at the first try (a test that fails at random, a result that differs between runs, anything that depends on a browser, a GPU or a third-party library), do not chain experiments of your own. After the first experiment that does not confirm the hypothesis:

1. **Read the tool's whole log** for warnings, fallbacks and degraded modes (`grep -iE "warn|fallback|slower|did not|unavailable|deprecated"`), not only its result line.
2. **Search the web for similar reports**: the library's issue tracker, the browser's bug tracker, forums. Note what they say and cite them.
3. Only then design the next experiment, and tell the user what the search and the log showed.

A cause the tool states in its own log, unread, costs every experiment run before reading it.

## Where to find what

- OpenSpec changes, capability specs and archived changes: `openspec/`.
- Standards documents (this file and its siblings): `docs/dev-standards/`.
- The product feature catalogue: `docs/FEATURES.md`, derived from the capability specs with `/ka:update-features`, never edited first.
- The changelog: `CHANGELOG.md`, compiled from the entries under `changelogs/unreleased/`.
- The harness configuration: `.claude/ka.json` (`ka config` prints it merged with the defaults).

## Languages

| What | Language |
|---|---|
| Code, identifiers, code comments | English |
| OpenSpec artifacts, standards documents, project skills | `en` |
| Commit messages | `en` (a history consistently in another language wins) |
| Pull request titles (a Conventional Commits subject, since a squash merge turns the title into the commit) | `en` |
| Pull request descriptions and review comments | `es-ES` |
| Tracker cards and issues | `es-ES` |
| Feature catalogue | `es-ES` |
| Changelog descriptions | `es-ES` |

## Workflow

Two alternative routes lead to a change whose artifacts are ready:

- **Route A, fast path** (the scope is clear): `/ka:refine` → `/opsx:propose`.
- **Route B, exploratory path** (several designs are plausible): `/ka:refine` → `/opsx:explore` → `/opsx:new <change>` → `/opsx:continue` once per artifact (proposal, specs, design, tasks).

From there the path is shared:

```
/opsx:apply                          implement the tasks in order, marking [x] as you go;
                                     each task group ends with its commit (/ka:commit)
/opsx:verify                         completeness, correctness, coherence
/ka:adversarial-review   when its task in tasks.md says it applies: red-team the change before the PR
/ka:commit --pr          open the pull request
/ka:review-pr            automated review of the pull request, in a fresh context; ka review-rounds record
  blockers open?                     the agent edits the artifacts, then apply → verify → commit → review-pr again
                                     (at most 3 rounds; then the user decides)
ka review-rounds gate                no open blocker on the reviewed commit; suggestions scored, follow-ups offered
/ka:update-features      when a requirement changed, then commit
human review                         a person reviews (findings reopen the loop above), or the user takes it as good
/opsx:archive                        after the approval, then commit the archive moves
the agent merges                     into master
post-merge actions                   the project's own (pullRequests.afterMerge), in order, once the merge shows on the platform
```

This repository has a single developer, its owner: when step 8 of the mandatory task steps asks who reviews the pull request, the reviewer is the owner, or the owner takes it as good. The agent then merges with `gh pr merge <n> --squash --delete-branch`, and the pull request's English title becomes the squash commit's subject. The [release standards](./release-standards.md) hold the deployment and release steps.

`/opsx:explore` only thinks: it reads code and compares approaches, and never writes application code. `/opsx:continue` creates the next artifact of a new change; it never amends existing artifacts. Review findings and late change requests are applied by editing the artifacts directly, then re-implementing, so the archived spec always matches the code. The detail of each gate lives in the [mandatory task steps](../../.claude/rules/ka-mandatory-steps.md).

Every `/opsx:*` command takes an optional change name and infers it when only one change is active. With several active changes, always pass it; `openspec list` shows them.
