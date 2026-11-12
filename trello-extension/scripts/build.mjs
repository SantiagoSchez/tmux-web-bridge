// Builds the extension into dist/, ready for «Load unpacked» in chrome://extensions.
// Each script is its own self-contained IIFE: content scripts cannot load modules.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = `${root}dist`;
const watch = process.argv.includes('--watch');
const ENTRIES = ['content', 'background', 'options'];

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

function copyStatic() {
  cpSync(`${root}static`, dist, { recursive: true });
  // The extension and the hub are released together: twb's VERSION.
  const version = readFileSync(`${root}../VERSION`, 'utf8').trim();
  const manifest = JSON.parse(readFileSync(`${root}static/manifest.json`, 'utf8'));
  // For tests: hosts granted up front (TWB_EXTRA_HOSTS=http://127.0.0.1/*), since a headless
  // browser cannot answer the permission prompt of the options page.
  const extra = (process.env.TWB_EXTRA_HOSTS ?? '').split(',').filter(Boolean);
  const host_permissions = [...(manifest.host_permissions ?? []), ...extra];
  writeFileSync(`${dist}/manifest.json`, `${JSON.stringify({ ...manifest, version, host_permissions }, null, 2)}\n`);
}
copyStatic();

for (const name of ENTRIES) {
  await build({
    root,
    configFile: false,
    logLevel: watch ? 'info' : 'warn',
    build: {
      outDir: dist,
      emptyOutDir: false,
      minify: false,
      target: 'chrome120',
      watch: watch ? {} : null,
      lib: { entry: `${root}src/${name}.ts`, formats: ['iife'], name: `twb_${name}`, fileName: () => `${name}.js` },
    },
  });
}
if (watch) console.log('Vigilando src/ (los cambios de static/ piden reiniciar el build)');
else console.log(`Listo: ${dist}`);
