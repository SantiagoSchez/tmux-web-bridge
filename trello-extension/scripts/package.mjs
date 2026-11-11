// Zips the built extension (dist/, from build.mjs) as twb-trello-extension-vX.Y.Z.zip, the file
// attached to each GitHub release (.github/workflows/trello-extension.yml).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const version = readFileSync(`${root}../VERSION`, 'utf8').trim();
if (!existsSync(`${root}dist/manifest.json`)) throw new Error('Falta dist/: ejecuta antes el build');
const out = `${root}twb-trello-extension-v${version}.zip`;
rmSync(out, { force: true });
// From inside dist/, so manifest.json sits at the top of the zip.
execFileSync('zip', ['-qr', out, '.'], { cwd: `${root}dist`, stdio: 'inherit' });
console.log(`Listo: ${out}`);
