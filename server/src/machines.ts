import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { HubAddresses, MachineVia, SavedHost } from '../../shared/types.js';
import type { HostConfig } from './config.js';

// The hub's machines: kept in dataDir/hosts.json and edited in Ajustes › Máquinas. They came
// from config.yaml's `hosts` block before (moved here once, see MachineStore.migrate).

/** The SOCKS5 proxy of the Tailscale container in the Docker stack (deploy/docker/compose.yaml). */
export const TAILSCALE_SOCKS = process.env.TWB_TAILSCALE_SOCKS || '127.0.0.1:1055';

const ID = /^[a-zA-Z0-9_-]{1,32}$/;
/** user@host, host or an alias: nothing ssh could read as an option or a second word. */
const SSH_DEST = /^(?:[A-Za-z0-9._-]+@)?[A-Za-z0-9._:-]+$/;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
/** An ssh -o option: Key=value (or Key value), on one line. */
const SSH_OPTION = /^[A-Za-z][A-Za-z0-9]*(=| )\S.*$/;
const VIAS: MachineVia[] = ['direct', 'tailnet', 'lan'];

function ipv4(s: string): boolean {
  const m = IPV4.exec(s);
  return !!m && m.slice(1).every((n) => Number(n) <= 255);
}

/** The ProxyCommand of a way to reach a machine, or none. */
export function viaOptions(via: MachineVia | undefined, lanAddress?: string): string[] {
  const socks = `nc -X 5 -x ${TAILSCALE_SOCKS} %h %p`;
  if (via === 'tailnet') return [`ProxyCommand=${socks}`];
  // Its LAN address if it answers within a second, else the tailnet. The probe and the
  // connection are separate: nc -w would also drop an SSH session idle for that long.
  if (via === 'lan' && lanAddress) return [`ProxyCommand=sh -c 'nc -z -w 1 ${lanAddress} %p 2>/dev/null && exec nc ${lanAddress} %p || exec ${socks}'`];
  return [];
}

/** How the hub runs tmux on a saved machine. */
export function hostConfig(h: SavedHost): HostConfig {
  return {
    id: h.id,
    name: h.name,
    local: h.local === true,
    ssh: h.ssh,
    port: h.port,
    identityFile: h.identityFile,
    sshOptions: [...viaOptions(h.via, h.lanAddress), ...(h.sshOptions ?? [])],
    tmux: h.tmux || 'tmux',
    socketArgs: h.socketPath ? ['-S', h.socketPath] : h.socketName ? ['-L', h.socketName] : [],
  };
}

/** A machine from the config, as the panel edits it: a ProxyCommand through the Tailscale proxy becomes its way. */
export function fromConfig(h: SavedHost): SavedHost {
  const out: SavedHost = { ...h };
  const tailnet = viaOptions('tailnet')[0];
  const opts = (h.sshOptions ?? []).filter((o) => o !== tailnet);
  if (!h.local) out.via = opts.length < (h.sshOptions ?? []).length ? 'tailnet' : 'direct';
  if (opts.length) out.sshOptions = opts;
  else delete out.sshOptions;
  return out;
}

/**
 * A machine as the panel sends it, checked: what ssh gets from it can never be read as an
 * option, a second word or a second line. `existing` is the one it replaces (its id stays).
 */
export function checkMachine(raw: unknown, ids: string[], existing?: SavedHost): SavedHost {
  if (!raw || typeof raw !== 'object') throw new Error('Faltan los datos de la máquina');
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const id = existing ? existing.id : str(r.id);
  if (!ID.test(id)) throw new Error('El id solo admite letras, números, «-» y «_» (hasta 32)');
  if (!existing && ids.includes(id)) throw new Error(`Ya hay una máquina con el id «${id}»`);
  const name = str(r.name).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 40) || id;
  const out: SavedHost = { id, name };

  // The hub itself (tmux there, without SSH): nothing else to set.
  if (existing?.local) return { ...existing, name };
  if (!existing && r.local === true) return { id, name, local: true };

  const ssh = str(r.ssh);
  if (!SSH_DEST.test(ssh) || ssh.startsWith('-')) throw new Error('El destino SSH es usuario@máquina (o su IP)');
  out.ssh = ssh;
  if (r.port !== undefined && r.port !== null && r.port !== '') {
    const port = Number(r.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Puerto inválido');
    if (port !== 22) out.port = port;
  }
  const via = (VIAS as unknown[]).includes(r.via) ? (r.via as MachineVia) : 'direct';
  out.via = via;
  if (via === 'lan') {
    const lan = str(r.lanAddress);
    if (!ipv4(lan)) throw new Error('Falta la IP de LAN de la máquina (p. ej. 192.168.1.20)');
    out.lanAddress = lan;
  }
  const opts = Array.isArray(r.sshOptions) ? r.sshOptions.map(str).filter(Boolean) : [];
  for (const o of opts) if (!SSH_OPTION.test(o) || /[\r\n]/.test(o)) throw new Error(`Opción de SSH inválida: ${o} (Clave=valor)`);
  if (opts.length) out.sshOptions = opts;
  const tmux = str(r.tmux);
  if (tmux && tmux !== 'tmux') {
    if (!/^\/[^\s'"`$\\]+$/.test(tmux)) throw new Error('La ruta de tmux tiene que ser absoluta (p. ej. /opt/homebrew/bin/tmux)');
    out.tmux = tmux;
  }
  const socketName = str(r.socketName);
  if (socketName) {
    if (!/^[A-Za-z0-9._-]+$/.test(socketName)) throw new Error('Nombre de socket de tmux inválido');
    out.socketName = socketName;
  }
  const socketPath = str(r.socketPath);
  if (socketPath) {
    if (!/^[/.][^\s'"`$\\]*$/.test(socketPath)) throw new Error('Ruta de socket de tmux inválida');
    out.socketPath = socketPath;
  }
  // The key is the hub's, never the panel's to choose: the one it had (a new machine gets it from the hub).
  if (existing?.identityFile) out.identityFile = existing.identityFile;
  return out;
}

/** The addresses for the from= of the hub's key, by the way the machine is reached. */
export function fromAddresses(via: MachineVia | undefined, a: HubAddresses): string[] {
  const list = via === 'tailnet' ? [a.tailnet] : via === 'lan' ? [a.lan, a.tailnet] : [a.lan, a.internal];
  return [...new Set(list.map((s) => s.trim()).filter(Boolean))];
}

/** The line for the machine's ~/.ssh/authorized_keys: the hub's key, only from its addresses. */
export function authorizedKeyLine(publicKey: string, via: MachineVia | undefined, a: HubAddresses): string {
  const [type, key] = publicKey.trim().split(/\s+/);
  const from = fromAddresses(via, a);
  return `${from.length ? `from="${from.join(',')}" ` : ''}${type} ${key} tmux-web-bridge`;
}

/**
 * The hub's SSH key: the one its machines use (the most), else the one install-hub.sh makes,
 * else ssh's default. Null when none is there.
 */
export function hubKeyPath(list: SavedHost[], home = homedir()): string | null {
  const used = new Map<string, number>();
  for (const h of list) if (h.identityFile) used.set(h.identityFile, (used.get(h.identityFile) ?? 0) + 1);
  const candidates = [...[...used.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p), join(home, '.ssh/tmux-web-bridge_ed25519'), join(home, '.ssh/id_ed25519')];
  return candidates.find((p) => existsSync(p) && existsSync(`${p}.pub`)) ?? null;
}

/** The public half of a key (type and key, without its comment). */
export function publicKey(path: string | null): string | null {
  if (!path) return null;
  try {
    const [type, key] = readFileSync(`${path}.pub`, 'utf8').trim().split(/\s+/);
    return type && key ? `${type} ${key}` : null;
  } catch {
    return null;
  }
}

/** The machines in dataDir/hosts.json. Emits 'change' with the list after every change. */
export class MachineStore extends EventEmitter {
  private readonly path: string;
  private hosts: SavedHost[] = [];

  constructor(dataDir: string) {
    super();
    this.path = join(dataDir, 'hosts.json');
    if (!existsSync(this.path)) return;
    const saved: unknown = JSON.parse(readFileSync(this.path, 'utf8'));
    if (!Array.isArray(saved)) throw new Error(`${this.path} no es una lista de máquinas`);
    this.hosts = saved as SavedHost[];
  }

  /** Whether the file is there: the machines of the config moved in already. */
  get exists(): boolean {
    return existsSync(this.path);
  }

  get list(): SavedHost[] {
    return this.hosts;
  }

  get(id: string): SavedHost | undefined {
    return this.hosts.find((h) => h.id === id);
  }

  /** The config's machines, the first time (no hosts.json yet): they are the panel's from now on. */
  migrate(fromConfigList: SavedHost[]): boolean {
    if (this.exists) return false;
    this.hosts = fromConfigList.map(fromConfig);
    this.save();
    return true;
  }

  /** Adds a machine or replaces the one with its id. */
  put(host: SavedHost): void {
    const i = this.hosts.findIndex((h) => h.id === host.id);
    if (i >= 0) this.hosts[i] = host;
    else this.hosts.push(host);
    this.save();
  }

  remove(id: string): void {
    this.hosts = this.hosts.filter((h) => h.id !== id);
    this.save();
  }

  private save(): void {
    writeFileSync(this.path, `${JSON.stringify(this.hosts, null, 2)}\n`, { mode: 0o600 });
    this.emit('change', this.hosts);
  }
}
