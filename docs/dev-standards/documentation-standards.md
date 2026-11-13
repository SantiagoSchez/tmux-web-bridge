# Documentation standards

Pre-requisite reading: [`base-standards.md`](./base-standards.md).

## Comments

Write code that explains itself. Comments are the exception, not the default.

A comment is worth adding when:

- a constraint is hidden (a regulatory requirement, an external API quirk, a workaround for a known upstream bug);
- a non-obvious invariant must be preserved for correctness;
- the behaviour would surprise and mislead a future reader.

Never:

- narrate what the code does (`// increment the counter`);
- mention the current task, ticket, pull request or author. That belongs in git history and the pull request;
- write multi-paragraph essays. A long explanation goes in a docstring or in the design of the change.

Code comments are in English.

## Docstrings

Document (JSDoc, docstrings, doc comments, whatever the layer's language uses):

- exported functions, classes and types that other modules consume;
- the public methods of services other layers call;
- non-obvious algorithms: inputs, outputs, and their cost when it matters.

Skip it where the name and the signature already say everything (private helpers, self-describing component props).

## Where each kind of documentation lives

| Kind | Location |
|---|---|
| OpenSpec proposals, designs, specs, tasks | `openspec/changes/<change>/` |
| Capability specs (the current behaviour) | `openspec/specs/<capability>/spec.md` |
| Archived changes | `openspec/changes/archive/<date>-<change>/` |
| Standards documents | `docs/dev-standards/` |
| Feature catalogue | `docs/FEATURES.md` |
| Changelog | `CHANGELOG.md`, compiled from `changelogs/unreleased/`; each release's section is also its GitHub release notes |
| User guide (install, setup, what the kit touches), in Spanish | `README.md` |
| README demo videos | `docs/videos/` |
| Agent and deployment instructions | `CLAUDE.md` |

Add a row when the project grows a new kind of document (an API reference, a data model overview, deployment notes).

## Architecture decisions

A decision with long-term consequences (a library, a pattern, a deployment model) is recorded in the `design.md` of the change that makes it, and stays in the archived record once the change ships. Write each one as:

- **Context**: the problem that forced a decision.
- **Decision**: the choice made, and the alternatives turned down.
- **Consequences**: what it enables and what it rules out.

## Changelog

`CHANGELOG.md` is generated: **never edit it by hand**. Each change adds one JSON entry under `changelogs/unreleased/`, so two branches never conflict on it, and a release compiles the pending entries into a new version section.

- Add an entry with `/koalarnes:changelog`, which reads the branch diff and picks the type, scope and description. Without the skill, run `ka changelog add -t <type> -s <scope> -d "<description>" --pr <id>` (`-n` for a dry run).
- Types: `added`, `changed`, `deprecated`, `removed`, `fixed`, `security`.
- Scopes: server, web, trello-extension, host-kit.
- Descriptions are in `es-ES`.
- **`-b` (breaking) means a MAJOR release.** A release bumps MAJOR for any breaking entry, MINOR for any `added`, PATCH otherwise. Set it only when the team decides on a MAJOR release; a format or API break inside a normal release is explained in the description instead.

`/koalarnes:release` compiles the entries, rewrites the new section for its readers, writes the version into the project's files and commits. The changelog is the public release notes: every line reads for the person using the product, related small fixes are grouped, entries with no effect on the product (tests, tooling, pipelines) are dropped, operational notes (deploy order, maintenance commands, environment variables) go to the deployment's work item instead, and security entries read as hardening without exploitation details.

## Standards updates

These documents describe how the team works. A change that breaks an existing standard or establishes a new one updates the standard in the same change; `/koalarnes:update-docs` reads the branch diff and drafts the patch.

The plugin's hooks (`hooks.onEdit`, `hooks.onStop` in `.claude/koalarnes.json`) format and lint each edited file and typecheck when the agent stops. They are a convenience, not a replacement for running each layer's test, typecheck and lint before a task is marked done.

## Feature catalogue

`docs/FEATURES.md` is the product-facing inventory of features, in `es-ES`. It is **derived from** the capability specs under `openspec/specs/`: the requirements and their scenarios are the source of truth, the catalogue's prose is generated from them.

- One H2 area of the catalogue per capability; one H3 section per `### Requirement` of its spec.
- Each H3 carries, right after its heading, the anchor of the requirement it describes:

  ```markdown
  ### <heading>
  <!-- capability: <cap-slug>; requirement: <req-slug> -->
  ```

  `<cap-slug>` is the capability's directory name; `<req-slug>` is the kebab-case of the requirement's name. An H2 that is only an introduction or an index is listed in `features.nonFeatureAreas` and needs no anchors.
- When a requirement is added, changed or removed, the spec changes first; then `/koalarnes:update-features <change>` regenerates the affected sections, and `ka features-check` must exit 0. It runs once more right before `/opsx:archive`.
- Describe capabilities, not figures that drift: no prices, rates or quotas of external services. Describe them qualitatively (tiers, speed against quality) and point at the place in the product where the live value is configured.
