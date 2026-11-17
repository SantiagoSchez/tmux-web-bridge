// Where a project keeps its harness configuration (the ka plugin's, formerly koalarnes):
// .claude/ka.json, or .claude/koalarnes.json in a project not migrated yet. The panel reads
// it on each machine from shell scripts (project-refs.ts, worktree-base.ts); this fragment
// makes them pick the same file.

/** A harness configuration is small; more than this is not one. */
export const MAX_CONFIG = 65_536;

/**
 * Shell that sets `f` to the configuration of the repository whose top level is in `$top`:
 * .claude/ka.json when it exists, else .claude/koalarnes.json, which may not exist either.
 * The newer file wins as a whole, never key by key.
 */
export const CONFIG_FILE = `f="$top/.claude/ka.json"; [ -f "$f" ] || f="$top/.claude/koalarnes.json"; `;
