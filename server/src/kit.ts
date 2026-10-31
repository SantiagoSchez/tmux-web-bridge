import { EXTRA_PATH, TmuxError } from './exec.js';
import type { HostMonitor } from './host.js';

const VERSION = /^\d+\.\d+\.\d+$/;

/** The release tag to check out. The version comes from GitHub's API: only plain X.Y.Z gets into a script. */
export function kitTag(version: string | null | undefined): string {
  if (!version) throw new Error('No hay ninguna release a la que actualizar');
  if (!VERSION.test(version)) throw new Error(`Versión de release inválida: ${version}`);
  return `v${version}`;
}

/**
 * The kit's clone for the shell, from @twb_kit_dir (published by the kit's tmux.conf).
 * Kits 1.0.0 do not publish it: they live in ~/tmux-web-bridge, as the README says.
 */
export function kitDir(published: string | null | undefined): string {
  const dir = published?.trim();
  if (!dir || !dir.startsWith('/')) return '"$HOME"/tmux-web-bridge';
  return `'${dir.replace(/'/g, `'\\''`)}'`;
}

/**
 * Script that moves the clone to a release tag and applies the kit, stopping at the
 * first problem. Never forces anything: local changes leave the clone alone. The
 * checkout runs without hooks because install.sh is run right after it anyway.
 */
export function kitScript(dir: string, tag: string): string {
  return [
    `PATH="$PATH:${EXTRA_PATH}"; export PATH`,
    `dir=${dir}`,
    `cd "$dir" 2>/dev/null && git rev-parse --git-dir >/dev/null 2>&1 || { echo "Sin clon del kit en $dir: instálalo con git clone + host-kit/install.sh" >&2; exit 1; }`,
    `[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "Cambios locales en el clon del kit ($dir): no se toca" >&2; exit 1; }`,
    `git fetch --quiet --tags --force origin || { echo "git fetch falló en $dir" >&2; exit 1; }`,
    `git rev-parse --quiet --verify 'refs/tags/${tag}^{commit}' >/dev/null || { echo "No existe el tag ${tag} en el clon" >&2; exit 1; }`,
    `git -c core.hooksPath=/dev/null -c advice.detachedHead=false checkout --quiet '${tag}' || exit 1`,
    // The hub reloads tmux.conf itself (through the host's own tmux socket): it needs the path.
    `echo "TWB_KIT_DIR=$(pwd)"`,
    'exec host-kit/install.sh --quiet',
  ].join('\n');
}

/**
 * Moves a host's kit to the last release and reloads it in its tmux. Resolves with
 * what install.sh changed (empty when it was already up to date).
 */
export async function updateKit(host: HostMonitor, latest: string | null): Promise<{ version: string; changes: string }> {
  const tag = kitTag(latest);
  const published = await host.exec.run(['show-options', '-gqv', '@twb_kit_dir']).catch(() => '');
  let out: string;
  try {
    out = await host.exec.shell(kitScript(kitDir(published), tag), 60_000);
  } catch (err) {
    if (err instanceof TmuxError && (err.transport || err.code === 'timeout')) throw new Error(`${host.name} no responde (¿dormida o sin red?)`);
    throw new Error(`${host.name}: ${(err as Error).message.replace(/\x1b\[[0-9;]*m/g, '')}`);
  }
  const lines = out.replace(/\x1b\[[0-9;]*m/g, '').split('\n');
  const dir = lines.find((l) => l.startsWith('TWB_KIT_DIR='))?.slice('TWB_KIT_DIR='.length);
  // install.sh reloads it on the default socket only; with no tmux running there is nothing to reload.
  if (dir) await host.exec.run(['source-file', `${dir}/host-kit/tmux.conf`]).catch(() => {});
  const changes = lines.filter((l) => l.trim() && !l.startsWith('TWB_KIT_DIR=')).join('\n');
  return { version: tag.slice(1), changes };
}
