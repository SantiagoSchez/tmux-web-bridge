import { accessSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { dirname, isAbsolute, resolve } from 'node:path';
import { parse, parseDocument } from 'yaml';
import type { SavedHost } from '../../shared/types.js';
import { isPasswordHash } from './auth.js';

/** How the hub runs tmux on a machine (built from its SavedHost: see machines.ts). */
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
}

/** A machine of the `hosts` block of configs from before the machines moved into the panel. */
export interface ConfigHost {
  host: SavedHost;
  /**
   * Its `projects` block, from before the folders moved into the panel: the hub turns it
   * into one of the host's folders once (SettingsStore.migrateProjects).
   */
  projects: { dir: string; command: string } | null;
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
  /** The machines of the config's `hosts` block, if it still has one: the hub moves them to dataDir once. */
  configHosts: ConfigHost[];
  /** Dictation (switched on in the app's settings): where the models are and how they run. */
  dictation: {
    /** OpenAI-style endpoint of the cleanup model (llama-server), e.g. http://llm:8080. Null: no cleanup. */
    llmUrl: string | null;
    /** Threads for the speech model. */
    threads: number;
  };
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

  // The machines live in dataDir/hosts.json, edited in the panel: a `hosts` block goes there once.
  const hostsRaw: Raw[] = Array.isArray(raw.hosts) ? raw.hosts : [];
  const seen = new Set<string>();
  const configHosts: ConfigHost[] = hostsRaw.map((h, i) => {
    const id = String(h.id ?? '').trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error(`config: hosts[${i}].id inválido (solo letras, números, - y _)`);
    if (seen.has(id)) throw new Error(`config: id de host duplicado: ${id}`);
    seen.add(id);
    const local = h.local === true;
    if (!local && !h.ssh) throw new Error(`config: el host ${id} necesita "ssh" o "local: true"`);
    const host: SavedHost = { id, name: String(h.name ?? id) };
    if (local) host.local = true;
    if (h.ssh) host.ssh = String(h.ssh);
    if (h.port) host.port = Number(h.port);
    if (Array.isArray(h.sshOptions) && h.sshOptions.length) host.sshOptions = h.sshOptions.map(String);
    if (h.identityFile) host.identityFile = rel(String(h.identityFile));
    if (h.tmux) host.tmux = String(h.tmux);
    if (h.socketName) host.socketName = String(h.socketName);
    if (h.socketPath) host.socketPath = String(h.socketPath);
    return {
      host,
      projects: h.projects?.dir ? { dir: String(h.projects.dir), command: String(h.projects.command ?? 'claude') } : null,
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
    configHosts,
    dictation: {
      llmUrl: (process.env.TWB_DICTATION_LLM_URL || raw.dictation?.llmUrl || '').replace(/\/+$/, '') || null,
      threads: Number(raw.dictation?.threads ?? 4),
    },
    configPath,
  };
}

/**
 * Takes the `hosts` block out of config.yaml, keeping the rest as it is (comments too),
 * once the machines are in dataDir. "readonly": the hub cannot write it (a read-only
 * mount in Docker), so it stays there, ignored.
 */
export function removeConfigHosts(configPath: string): 'removed' | 'readonly' | 'none' {
  const doc = parseDocument(readFileSync(configPath, 'utf8'));
  if (!doc.has('hosts')) return 'none';
  try {
    accessSync(configPath, constants.W_OK);
  } catch {
    return 'readonly';
  }
  doc.delete('hosts');
  try {
    writeFileSync(configPath, doc.toString());
  } catch {
    return 'readonly';
  }
  return 'removed';
}
