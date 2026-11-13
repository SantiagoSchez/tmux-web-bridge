// Takes the `hosts` block out of the stack's config.yaml once the hub has every one of those
// machines in data/hosts.json (it moves them there on its first start since 1.22.0, but the
// config is mounted read-only, so it cannot remove the block itself). The rest of the file,
// comments included, stays as it is. Run by deploy.sh inside the twb image, which has `yaml`.
//
//   node strip-config-hosts.mjs <config.yaml> <hosts.json>
//
// Prints what it did on stdout; exits 0 when there was nothing to do too.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseDocument } from 'yaml';

const [configPath, hostsPath] = process.argv.slice(2);
const doc = parseDocument(readFileSync(configPath, 'utf8'));
if (!doc.has('hosts')) process.exit(0);

const inConfig = (doc.toJS().hosts ?? []).map((h) => String(h?.id ?? ''));
let inPanel;
try {
  inPanel = JSON.parse(readFileSync(hostsPath, 'utf8')).map((h) => h.id);
} catch {
  console.log('config.yaml aún tiene «hosts», pero el panel no tiene data/hosts.json: se deja');
  process.exit(0);
}
const missing = inConfig.filter((id) => !inPanel.includes(id));
if (missing.length) {
  console.log(`config.yaml aún tiene «hosts», pero el panel no tiene ${missing.join(', ')}: se deja`);
  process.exit(0);
}
doc.delete('hosts');
// In place (not a new file and a rename): config.yaml is bind-mounted into the running hub.
writeFileSync(configPath, doc.toString());
console.log(`Quitado «hosts» de config.yaml: sus máquinas (${inConfig.join(', ')}) ya están en el panel (${inPanel.join(', ')})`);
