// pnpm extracts node-pty's prebuilt spawn-helper without the executable bit, and
// every spawn then fails with "posix_spawnp failed". Restore it after install.
import { chmodSync, existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(join(process.cwd(), 'server', 'package.json'));
let root;
try {
  root = dirname(require.resolve('node-pty/package.json'));
} catch {
  process.exit(0);
}
for (const base of ['prebuilds', 'build/Release']) {
  const dir = join(root, base);
  if (!existsSync(dir)) continue;
  const candidates = base === 'prebuilds' ? readdirSync(dir).map((d) => join(dir, d, 'spawn-helper')) : [join(dir, 'spawn-helper')];
  for (const file of candidates) if (existsSync(file)) chmodSync(file, 0o755);
}
