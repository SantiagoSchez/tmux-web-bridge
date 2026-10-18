import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { dirname, isAbsolute, resolve } from 'node:path';
import { parse } from 'yaml';
import { isPasswordHash } from './auth.js';

export interface HostConfig {
  id: string;
  name: string;
  /** Run tmux directly on the hub instead of over SSH. */
  local: boolean;
  /** SSH destination: an alias from ~/.ssh/config or user@host. */
  ssh?: string;
  port?: number;
  identityFile?: string;
  sshOptions: string[];
  /** tmux binary on that host (default: "tmux", searched with an extended PATH). */
  tmux: string;
  /** Socket options for a non-default tmux server: -L name or -S path. */
  socketArgs: string[];
  /**
   * "Nuevo space" opens a project, like the `c` shell function: a folder of `dir`
   * (or a `c` shortcut from `shortcuts`), with `command` started in it.
   * Paths are on that host; ~ is its home.
   */
  projects: { dir: string; shortcuts: string | null; command: string } | null;
}

export interface Config {
  listen: { host: string; port: number };
  /** Optional second listener that only serves POST /api/notify, for hosts outside the tailnet. */
  notifyListen: { host: string; port: number } | null;
  /** Extra origins accepted for WebSocket/POST requests (the request's own host is always accepted). */
  allowedOrigins: string[];
  auth: {
    /**
     * "tailscale": behind `tailscale serve`, trusting its identity headers.
     * "password": behind any other proxy; the identity headers are never read.
     */
    method: 'tailscale' | 'password';
    /** Tailscale logins allowed in. Empty = any user of the tailnet. */
    allowedLogins: string[];
    /** Accept requests without Tailscale identity headers (local development only). */
    allowWithoutTailscale: boolean;
    /** scrypt hash from `hash-password` (method "password"). */
    passwordHash: string | null;
    /** A login lasts this many days without using the app. */
    sessionDays: number;
  };
  /** Proxies whose X-Forwarded-For/-Proto are believed (Fastify trustProxy). */
  trustProxy: string;
  /** Shared secret for POST /api/notify (hosts' tmux-window-title.sh). */
  notifyToken: string | null;
  dataDir: string;
  sshControlDir: string;
  vapidSubject: string;
  pollIntervalMs: number;
  /** Seconds to wait for a host script notification before pushing from the emoji change alone. */
  fallbackDelayMs: number;
  hosts: HostConfig[];
  configPath: string;
}

type Raw = Record<string, any>;

function expandHome(p: string): string {
  return p.startsWith('~/') ? resolve(homedir(), p.slice(2)) : p;
}

export function loadConfig(): Config {
  const configPath = resolve(process.env.TMUX_WEB_CONFIG ?? 'config.yaml');
  if (!existsSync(configPath)) {
    throw new Error(`No existe el fichero de configuración ${configPath} (copia config.example.yaml)`);
  }
  const raw: Raw = parse(readFileSync(configPath, 'utf8')) ?? {};
  const base = dirname(configPath);
  const rel = (p: string) => {
    const e = expandHome(p);
    return isAbsolute(e) ? e : resolve(base, e);
  };

  const hostsRaw: Raw[] = Array.isArray(raw.hosts) ? raw.hosts : [];
  if (hostsRaw.length === 0) throw new Error('config: "hosts" está vacío');
  const seen = new Set<string>();
  const hosts: HostConfig[] = hostsRaw.map((h, i) => {
    const id = String(h.id ?? '').trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error(`config: hosts[${i}].id inválido (solo letras, números, - y _)`);
    if (seen.has(id)) throw new Error(`config: id de host duplicado: ${id}`);
    seen.add(id);
    const local = h.local === true;
    if (!local && !h.ssh) throw new Error(`config: el host ${id} necesita "ssh" o "local: true"`);
    return {
      id,
      name: String(h.name ?? id),
      local,
      ssh: h.ssh ? String(h.ssh) : undefined,
      port: h.port ? Number(h.port) : undefined,
      identityFile: h.identityFile ? rel(String(h.identityFile)) : undefined,
      sshOptions: Array.isArray(h.sshOptions) ? h.sshOptions.map(String) : [],
      tmux: h.tmux ? String(h.tmux) : 'tmux',
      socketArgs: h.socketPath ? ['-S', String(h.socketPath)] : h.socketName ? ['-L', String(h.socketName)] : [],
      projects: h.projects?.dir
        ? { dir: String(h.projects.dir), shortcuts: h.projects.shortcuts ? String(h.projects.shortcuts) : null, command: String(h.projects.command ?? 'claude') }
        : null,
    };
  });

  const dataDir = rel(raw.dataDir ?? './data');
  mkdirSync(dataDir, { recursive: true });
  // Unix socket paths are capped at ~104 bytes, so the SSH ControlPath lives in a short directory.
  const sshControlDir = expandHome(raw.ssh?.controlDir ?? `/tmp/tmux-web-bridge-${userInfo().uid}`);
  mkdirSync(sshControlDir, { recursive: true, mode: 0o700 });

  const method = raw.auth?.method === 'password' ? 'password' : 'tailscale';
  const passwordHash = raw.auth?.passwordHash ? String(raw.auth.passwordHash) : null;
  if (raw.auth?.method && !['password', 'tailscale'].includes(raw.auth.method)) throw new Error('config: auth.method debe ser "tailscale" o "password"');
  if (method === 'password' && (!passwordHash || !isPasswordHash(passwordHash))) {
    throw new Error('config: auth.method "password" necesita auth.passwordHash (genéralo con: node server/dist/index.js hash-password)');
  }
  const auth: Config['auth'] = {
    method,
    allowedLogins: Array.isArray(raw.auth?.allowedLogins) ? raw.auth.allowedLogins.map(String) : [],
    allowWithoutTailscale: raw.auth?.allowWithoutTailscale === true,
    passwordHash,
    sessionDays: Number(raw.auth?.sessionDays ?? 30),
  };

  return {
    listen: { host: raw.listen?.host ?? '127.0.0.1', port: Number(raw.listen?.port ?? 7681) },
    notifyListen: raw.notifyListen ? { host: raw.notifyListen.host ?? '0.0.0.0', port: Number(raw.notifyListen.port ?? 7682) } : null,
    allowedOrigins: Array.isArray(raw.allowedOrigins) ? raw.allowedOrigins.map(String) : [],
    auth,
    trustProxy: Array.isArray(raw.trustProxy) ? raw.trustProxy.map(String).join(',') : String(raw.trustProxy ?? '127.0.0.1,::1'),
    notifyToken: raw.notifyToken ? String(raw.notifyToken) : null,
    dataDir,
    sshControlDir,
    vapidSubject: String(raw.vapidSubject ?? 'mailto:admin@localhost'),
    pollIntervalMs: Number(raw.pollIntervalMs ?? 1000),
    fallbackDelayMs: Number(raw.fallbackDelayMs ?? 4000),
    hosts,
    configPath,
  };
}
