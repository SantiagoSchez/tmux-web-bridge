import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { removeConfigHosts } from './config.js';
import { parseCheck, removeKeyScript, unbindKitKeys, uninstallScript } from './kit.js';
import { authorizedKeyLine, checkMachine, fromConfig, hostConfig, hubKeyPath, MachineStore, viaOptions } from './machines.js';

const ADDR = { tailnet: '100.66.162.25', lan: '192.168.0.54', internal: '10.10.10.26' };

function withDir(fn: (dir: string) => Promise<void> | void): () => Promise<void> {
  return async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'twb-machines-')));
    try {
      await fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

test('a machine from the panel is checked: nothing ssh could take for an option or a second word', () => {
  const ok = checkMachine({ id: 'air', name: 'MacBook Air', ssh: 'santiago@air', via: 'lan', lanAddress: '192.168.0.111', port: '22', tmux: '/opt/homebrew/bin/tmux' }, []);
  assert.deepEqual(ok, { id: 'air', name: 'MacBook Air', ssh: 'santiago@air', via: 'lan', lanAddress: '192.168.0.111', tmux: '/opt/homebrew/bin/tmux' });
  const bad = (raw: object, msg: RegExp) => assert.throws(() => checkMachine({ id: 'x', ssh: 'u@h', ...raw }, ['dev']), msg);
  bad({ id: 'dev' }, /Ya hay una máquina/);
  bad({ id: 'no vale' }, /id solo admite/);
  bad({ ssh: '-oProxyCommand=evil' }, /destino SSH/);
  bad({ ssh: 'u@h otra' }, /destino SSH/);
  bad({ via: 'lan' }, /IP de LAN/);
  bad({ via: 'lan', lanAddress: '192.168.0.300' }, /IP de LAN/);
  bad({ port: 70000 }, /Puerto/);
  bad({ tmux: 'tmux; rm -rf ~' }, /ruta de tmux/);
  bad({ sshOptions: ['ServerAliveInterval=5\nProxyCommand=x'] }, /Opción de SSH/);
  // Editing keeps its id and its key, whatever comes.
  const edited = checkMachine({ id: 'otro', name: 'Dev', ssh: 'santiago@10.10.10.25', identityFile: '/tmp/x' }, ['dev'], { id: 'dev', name: 'dev', ssh: 'a@b', identityFile: '/k' });
  assert.equal(edited.id, 'dev');
  assert.equal(edited.identityFile, '/k');
});

test('the ways to reach a machine become its ProxyCommand', () => {
  assert.deepEqual(viaOptions('direct'), []);
  assert.deepEqual(viaOptions('tailnet'), ['ProxyCommand=nc -X 5 -x 127.0.0.1:1055 %h %p']);
  const [lan] = viaOptions('lan', '192.168.0.112');
  assert.match(lan, /^ProxyCommand=sh -c 'nc -z -w 1 192\.168\.0\.112 %p .*&& exec nc 192\.168\.0\.112 %p \|\| exec nc -X 5 -x 127\.0\.0\.1:1055 %h %p'$/);
  const cfg = hostConfig({ id: 'mac', name: 'Mac', ssh: 'santiago@mac', via: 'tailnet', sshOptions: ['ConnectTimeout=3'], socketName: 'w' });
  assert.deepEqual(cfg.sshOptions, ['ProxyCommand=nc -X 5 -x 127.0.0.1:1055 %h %p', 'ConnectTimeout=3']);
  assert.deepEqual(cfg.socketArgs, ['-L', 'w']);
  assert.equal(cfg.tmux, 'tmux');
});

test('a machine of the config keeps how it was reached: through the tailnet, or its own options', () => {
  assert.deepEqual(fromConfig({ id: 'mac', name: 'Mac', ssh: 'u@mac', sshOptions: ['ProxyCommand=nc -X 5 -x 127.0.0.1:1055 %h %p'] }), { id: 'mac', name: 'Mac', ssh: 'u@mac', via: 'tailnet' });
  const lan = "ProxyCommand=sh -c 'nc -w 1 192.168.0.112 %p || nc -X 5 -x 127.0.0.1:1055 %h %p'";
  assert.deepEqual(fromConfig({ id: 'air', name: 'Air', ssh: 'u@air', sshOptions: [lan] }), { id: 'air', name: 'Air', ssh: 'u@air', via: 'direct', sshOptions: [lan] });
  assert.deepEqual(fromConfig({ id: 'hub', name: 'Hub', local: true }), { id: 'hub', name: 'Hub', local: true });
});

test('the hub\'s key goes to a machine only from the hub\'s addresses for that way', () => {
  const key = 'ssh-ed25519 AAAAC3Nza';
  assert.equal(authorizedKeyLine(key, 'tailnet', ADDR), 'from="100.66.162.25" ssh-ed25519 AAAAC3Nza tmux-web-bridge');
  assert.equal(authorizedKeyLine(key, 'lan', ADDR), 'from="192.168.0.54,100.66.162.25" ssh-ed25519 AAAAC3Nza tmux-web-bridge');
  assert.equal(authorizedKeyLine(key, 'direct', ADDR), 'from="192.168.0.54,10.10.10.26" ssh-ed25519 AAAAC3Nza tmux-web-bridge');
  assert.equal(authorizedKeyLine(key, 'direct', { tailnet: '', lan: '', internal: '' }), 'ssh-ed25519 AAAAC3Nza tmux-web-bridge');
});

test(
  'the hub\'s key: the one its machines use, else install-hub.sh\'s, else ssh\'s default',
  withDir((home) => {
    mkdirSync(join(home, '.ssh'));
    assert.equal(hubKeyPath([], home), null);
    for (const k of ['id_ed25519', 'tmux-web-bridge_ed25519', 'otra']) {
      writeFileSync(join(home, '.ssh', k), 'x');
      writeFileSync(join(home, '.ssh', `${k}.pub`), 'ssh-ed25519 AAAA x');
    }
    assert.equal(hubKeyPath([], home), join(home, '.ssh/tmux-web-bridge_ed25519'));
    const otra = join(home, '.ssh/otra');
    assert.equal(hubKeyPath([{ id: 'a', name: 'a', identityFile: otra }], home), otra);
  }),
);

test(
  'the machines of the config move to hosts.json once, and the config loses its hosts block (comments kept)',
  withDir((dir) => {
    const store = new MachineStore(dir);
    assert.equal(store.migrate([{ id: 'dev', name: 'Dev', ssh: 'u@dev' }]), true);
    assert.equal(new MachineStore(dir).list[0].via, 'direct');
    // Once: what the panel did afterwards stays.
    store.remove('dev');
    assert.equal(new MachineStore(dir).migrate([{ id: 'dev', name: 'Dev', ssh: 'u@dev' }]), false);
    assert.deepEqual(new MachineStore(dir).list, []);

    const path = join(dir, 'config.yaml');
    writeFileSync(path, '# Mi config\nlisten: { host: 127.0.0.1, port: 7681 }\n# las máquinas\nhosts:\n  - id: dev\n    ssh: u@dev\nnotifyToken: abc # el token\n');
    assert.equal(removeConfigHosts(path), 'removed');
    const after = readFileSync(path, 'utf8');
    assert.doesNotMatch(after, /hosts:|id: dev/);
    assert.match(after, /# Mi config/);
    assert.match(after, /notifyToken: abc # el token/);
    assert.equal(removeConfigHosts(path), 'none');
  }),
);

test('what «Probar» found: tmux 3.2 or later is a must, what the kit needs is said', () => {
  const out = 'SYS=Darwin 24.1\nUSER=santiago\nHOME=/Users/santiago\nTMUX=/opt/homebrew/bin/tmux\nTMUXV=tmux 3.5a\nMISSING=jq\nKIT=/Users/santiago/tmux-web-bridge\nKITV=1.21.0\n';
  assert.deepEqual(parseCheck(out), {
    ok: true,
    system: 'Darwin 24.1',
    user: 'santiago',
    home: '/Users/santiago',
    tmux: '/opt/homebrew/bin/tmux',
    tmuxVersion: '3.5a',
    missing: ['jq'],
    kit: { dir: '/Users/santiago/tmux-web-bridge', version: '1.21.0' },
    error: 'Para el kit le falta: jq',
  });
  assert.equal(parseCheck('TMUX=/usr/bin/tmux\nTMUXV=tmux 3.1c\n').ok, false);
  assert.equal(parseCheck('TMUX=/usr/bin/tmux\nTMUXV=tmux next-3.6\n').ok, true);
  assert.match(parseCheck('USER=u\n').error!, /No tiene tmux/);
});

test('the kit leaves a running tmux: its keys back to tmux\'s, the kills it wrapped get their kill back', () => {
  const keys = [
    'bind-key    -T prefix       x                    run-shell "/home/u/tmux-web-bridge/host-kit/tmux-window-title.sh close pane \'#{pane_id}\' \'#{client_name}\'"',
    'bind-key    -T prefix       \\"                   run-shell "/home/u/tmux-web-bridge/host-kit/tmux-spaces.sh goto \'#{client_name}\' 2"',
    "bind-key    -T prefix       '$'                  run-shell \"/home/u/tmux-web-bridge/host-kit/tmux-spaces.sh goto '#{client_name}' 4\"",
    "bind-key    -T prefix       \\%                   run-shell \"/home/u/tmux-web-bridge/host-kit/tmux-spaces.sh goto '#{client_name}' 5\"",
    'bind-key -r -T prefix       S-Left               run-shell "/home/u/tmux-web-bridge/host-kit/tmux-spaces.sh prev \'#{client_name}\'"',
    'bind-key    -T root         C-w                  run-shell "/home/u/.scripts/tmux-window-title.sh close window \'#{window_id}\' \'#{client_name}\'"',
    'bind-key    -T root         User0                run-shell "/home/u/tmux-web-bridge/host-kit/tmux-spaces.sh goto \'#{client_name}\' 1"',
    'bind-key    -T prefix       c                    new-window',
  ].join('\n');
  assert.deepEqual(unbindKitKeys(keys), [
    'bind-key -T prefix x confirm-before -p "kill-pane #P? (y/n)" kill-pane',
    'bind-key -T prefix \\" split-window',
    `bind-key -T prefix '$' command-prompt -I "#S" "rename-session -- '%%'"`,
    'bind-key -T prefix \\% split-window -h',
    'unbind-key -T prefix S-Left',
    'bind-key -T root C-w kill-window',
    'unbind-key -T root User0',
  ]);
});

/** Runs the uninstall script in a fake HOME (no tmux, no ssh: only files). */
function uninstall(home: string, blob: string): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile('/bin/sh', ['-c', `${uninstallScript('"$HOME"/tmux-web-bridge')}\n${removeKeyScript(blob)}`], { env: { PATH: process.env.PATH, HOME: home } }, (err, out, stderr) =>
      err ? reject(new Error(stderr || err.message)) : resolve(out),
    ),
  );
}

const git = (cwd: string, ...args: string[]) =>
  new Promise<void>((resolve, reject) =>
    execFile('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd }, (err) => (err ? reject(err) : resolve())),
  );

/** A clone of twb (its origin says so), with nothing to commit. */
async function fakeClone(dir: string): Promise<void> {
  mkdirSync(join(dir, 'host-kit'), { recursive: true });
  writeFileSync(join(dir, 'host-kit/tmux.conf'), '');
  await git(dir, 'init', '-q');
  await git(dir, 'remote', 'add', 'origin', 'https://github.com/SantiagoSchez/tmux-web-bridge.git');
  await git(dir, 'add', '.');
  await git(dir, 'commit', '-qm', 'kit');
}

const BLOB = 'AAAAC3NzaC1lZDI1NTE5AAAAIHub';

test(
  'uninstalling takes the kit and the hub\'s key off a machine, and gives back what was there',
  withDir(async (home) => {
    await fakeClone(join(home, 'tmux-web-bridge'));
    writeFileSync(
      join(home, '.tmux.conf'),
      'set -g mouse on\n\n# >>> tmux-web-bridge: lo pone y lo quita el kit (host-kit/install.sh)\nsource-file -q ~/tmux-web-bridge/host-kit/tmux.conf\n# <<< tmux-web-bridge\n',
    );
    mkdirSync(join(home, '.claude/scripts'), { recursive: true });
    const hook = (cmd: string) => [{ hooks: [{ type: 'command', command: cmd }] }];
    writeFileSync(
      join(home, '.claude/settings.json'),
      JSON.stringify({
        model: 'opus',
        hooks: { Stop: [...hook('"$HOME/tmux-web-bridge/host-kit/tmux-window-title.sh" state done x'), ...hook('mio.sh')], SessionEnd: hook('"$HOME/tmux-web-bridge/host-kit/tmux-window-title.sh" clear') },
        statusLine: { type: 'command', command: '"$HOME/tmux-web-bridge/host-kit/statusline.sh"' },
      }),
    );
    // A link of an old kit, with what it replaced in its .bak.
    mkdirSync(join(home, '.scripts'));
    writeFileSync(join(home, '.scripts/tmux-spaces.sh.bak.20260101-000000'), 'mío');
    symlinkSync('../tmux-web-bridge/host-kit/tmux-spaces.sh', join(home, '.scripts/tmux-spaces.sh'));
    mkdirSync(join(home, '.config/tmux-web-bridge'), { recursive: true });
    writeFileSync(join(home, '.config/tmux-web-bridge/notify.env'), 'HUB_URL=x');
    mkdirSync(join(home, '.ssh'));
    writeFileSync(join(home, '.ssh/authorized_keys'), `ssh-ed25519 OTRA yo\nfrom="1.2.3.4" ssh-ed25519 ${BLOB} tmux-web-bridge\n`);

    const out = await uninstall(home, BLOB);
    assert.doesNotMatch(out, /LEFT=/);
    assert.equal(readFileSync(join(home, '.tmux.conf'), 'utf8'), 'set -g mouse on\n');
    assert.deepEqual(JSON.parse(readFileSync(join(home, '.claude/settings.json'), 'utf8')), { model: 'opus', hooks: { Stop: hook('mio.sh') } });
    assert.equal(readFileSync(join(home, '.scripts/tmux-spaces.sh'), 'utf8'), 'mío');
    assert.equal(existsSync(join(home, '.config/tmux-web-bridge')), false);
    assert.equal(existsSync(join(home, 'tmux-web-bridge')), false);
    assert.equal(readFileSync(join(home, '.ssh/authorized_keys'), 'utf8'), 'ssh-ed25519 OTRA yo\n');
  }),
);

test(
  'uninstalling leaves shared dotfiles as they are, and the clone they still use',
  withDir(async (home) => {
    await fakeClone(join(home, 'tmux-web-bridge'));
    // ~/.tmux.conf and ~/.scripts in a Dropbox shared by two machines; the other one has an old kit.
    mkdirSync(join(home, 'Dropbox/scripts'), { recursive: true });
    writeFileSync(join(home, 'Dropbox/tmux.conf'), '# tmux-web-bridge: estados de Claude\nsource-file ~/tmux-web-bridge/host-kit/tmux.conf\n');
    symlinkSync(join(home, 'Dropbox/tmux.conf'), join(home, '.tmux.conf'));
    symlinkSync(join(home, 'Dropbox/scripts'), join(home, '.scripts'));
    symlinkSync('../../tmux-web-bridge/host-kit/tmux-window-title.sh', join(home, 'Dropbox/scripts/tmux-window-title.sh'));

    const out = await uninstall(home, BLOB);
    const left = out.split('\n').filter((l) => l.startsWith('LEFT='));
    assert.equal(left.length, 3, out);
    assert.match(out, /\.tmux\.conf es compartido/);
    assert.match(out, /carpeta compartida/);
    assert.match(out, /se deja el clon/);
    assert.match(readFileSync(join(home, 'Dropbox/tmux.conf'), 'utf8'), /source-file ~\/tmux-web-bridge/);
    assert.ok(lstatSync(join(home, '.scripts/tmux-window-title.sh')).isSymbolicLink());
    assert.ok(existsSync(join(home, 'tmux-web-bridge/.git')));
  }),
);

test(
  'a clone with changes, or of another repo, is never removed',
  withDir(async (home) => {
    await fakeClone(join(home, 'tmux-web-bridge'));
    writeFileSync(join(home, 'tmux-web-bridge/host-kit/tmux.conf'), 'cambio');
    assert.match(await uninstall(home, BLOB), /LEFT=.*cambios locales/);
    await git(join(home, 'tmux-web-bridge'), 'checkout', '-q', '--', '.');
    await git(join(home, 'tmux-web-bridge'), 'remote', 'set-url', 'origin', 'https://github.com/otro/repo.git');
    assert.match(await uninstall(home, BLOB), /LEFT=.*no es un clon de twb/);
    assert.ok(existsSync(join(home, 'tmux-web-bridge/.git')));
  }),
);

test(
  'the clone a hub runs from (built, with its dependencies) is never removed with the kit',
  withDir(async (home) => {
    await fakeClone(join(home, 'tmux-web-bridge'));
    mkdirSync(join(home, 'tmux-web-bridge/server/dist'), { recursive: true });
    writeFileSync(join(home, 'tmux-web-bridge/.gitignore'), 'server/dist\n');
    await git(join(home, 'tmux-web-bridge'), 'add', '.gitignore');
    await git(join(home, 'tmux-web-bridge'), 'commit', '-qm', 'ignore');
    assert.match(await uninstall(home, BLOB), /LEFT=.*instalación de un servidor central/);
    assert.ok(existsSync(join(home, 'tmux-web-bridge/server/dist')));
  }),
);
