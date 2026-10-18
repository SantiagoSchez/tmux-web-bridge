import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { request } from 'node:http';
import type { ConnectionInfo, ViewInfo } from '../../shared/types.js';

interface Whois {
  device?: string;
  os?: string;
  login?: string;
  userName?: string;
}

const whoisCache = new Map<string, { at: number; value: Whois }>();

function parseWhois(json: string): Whois {
  try {
    const j = JSON.parse(json);
    return {
      device: j.Node?.ComputedName || j.Node?.Hostinfo?.Hostname || j.Node?.Name?.split('.')[0],
      os: j.Node?.Hostinfo?.OS,
      login: j.UserProfile?.LoginName,
      userName: j.UserProfile?.DisplayName,
    };
  } catch {
    return {}; // not JSON: tailscale missing or IP outside the tailnet
  }
}

// tailscaled's LocalAPI socket. In Docker the Tailscale sidecar shares it through a volume,
// so the hub image needs no tailscale CLI.
const TS_SOCKET = process.env.TS_SOCKET ?? '/var/run/tailscale/tailscaled.sock';

function whoisLocalApi(ip: string): Promise<Whois> {
  return new Promise((resolve) => {
    const req = request(
      { socketPath: TS_SOCKET, host: 'local-tailscaled.sock', path: `/localapi/v0/whois?addr=${encodeURIComponent(ip)}`, timeout: 5000 },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve(res.statusCode === 200 ? parseWhois(body) : {}));
      },
    );
    req.on('error', () => resolve({}));
    req.on('timeout', () => req.destroy());
    req.end();
  });
}

function whoisCli(ip: string): Promise<Whois> {
  return new Promise((resolve) => {
    execFile('tailscale', ['whois', '--json', ip], { timeout: 5000 }, (err, stdout) => resolve(err ? {} : parseWhois(stdout)));
  });
}

/** Device behind a tailnet IP (cached for 10 minutes). */
async function whois(ip: string): Promise<Whois> {
  const cached = whoisCache.get(ip);
  if (cached && Date.now() - cached.at < 600_000) return cached.value;
  const value = existsSync(TS_SOCKET) ? await whoisLocalApi(ip) : await whoisCli(ip);
  whoisCache.set(ip, { at: Date.now(), value });
  return value;
}

/**
 * Live browser connections to the panel (one per open app tab), shown to every
 * client as a security counter. Emits 'change' with the full list.
 */
export class ConnectionRegistry extends EventEmitter {
  private readonly conns = new Map<string, ConnectionInfo>();

  add(meta: { login?: string; userName?: string; ip?: string; userAgent?: string }): ConnectionInfo {
    const conn: ConnectionInfo = {
      id: randomUUID(),
      login: meta.login,
      userName: meta.userName,
      ip: meta.ip,
      userAgent: meta.userAgent,
      connectedAt: Date.now(),
      visible: true,
      terminals: 0,
    };
    this.conns.set(conn.id, conn);
    this.changed();
    if (meta.ip) {
      void whois(meta.ip).then((w) => {
        const c = this.conns.get(conn.id);
        if (!c) return;
        c.device = w.device;
        c.os = w.os;
        c.login ??= w.login;
        c.userName ??= w.userName;
        this.changed();
      });
    }
    return conn;
  }

  remove(id: string): void {
    if (this.conns.delete(id)) this.changed();
  }

  get(id: string): ConnectionInfo | undefined {
    return this.conns.get(id);
  }

  update(id: string, patch: { view?: ViewInfo | null; visible?: boolean; present?: boolean }): void {
    const c = this.conns.get(id);
    if (!c) return;
    if (patch.view !== undefined) c.view = patch.view ?? undefined;
    if (patch.visible !== undefined) c.visible = patch.visible;
    if (patch.present !== undefined) c.present = patch.present;
    this.changed();
  }

  terminalDelta(id: string, delta: number): void {
    const c = this.conns.get(id);
    if (!c) return;
    c.terminals = Math.max(0, c.terminals + delta);
    this.changed();
  }

  list(): ConnectionInfo[] {
    return [...this.conns.values()].sort((a, b) => a.connectedAt - b.connectedAt);
  }

  /** Is someone looking at this pane right now (app visible, on that pane or its window)? */
  isWatched(host: string, paneId: string, windowId: string): boolean {
    for (const c of this.conns.values()) {
      if (!c.visible || c.view?.host !== host) continue;
      if (c.view.pane === paneId || c.view.window === windowId) return true;
    }
    return false;
  }

  /** A device where you are working right now (it reports system-wide activity), if any. */
  presentDevice(): ConnectionInfo | undefined {
    for (const c of this.conns.values()) if (c.present) return c;
  }

  private changed(): void {
    this.emit('change', this.list());
  }
}
