import type { ActionOp, ClientMessage, ServerMessage, ViewInfo } from '../../shared/types';
import { recheck, signedOut } from './auth';
import { applyHostOrder, clientId, connections, dictationInfo, hosts, hubSettings, toast, usageSamples, vapidKey, wsStatus } from './state';
import { updateInfo } from './updates';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

/**
 * How long a socket that looks open has to answer a ping before it is taken for dead.
 * Over the tailnet from mobile data a live socket can take a couple of seconds; a
 * false alarm only costs a reconnection.
 */
export const PROBE_MS = 5000;

/**
 * How long a new socket may take to open before it is dropped for a fresh one. Coming
 * back from the background, the phone's network can swallow the first attempts (the
 * tailnet tunnel waking up): TCP then retries at 1, 3, 7 and 15 s and kept the app
 * waiting 15 s for a hub that answers in a tenth of a second. A fresh connection gets
 * through as soon as the network is back. The browser opens one socket at a time to
 * a host, so a hung one also holds back the next (the terminal's behind the app's).
 */
export const CONNECT_TIMEOUT_MS = 4000;

/** The app's single WebSocket to the hub, with automatic reconnection. */
class HubSocket {
  private ws: WebSocket | null = null;
  private seq = 0;
  private readonly pending = new Map<number, Pending>();
  private retry = 0;
  private view: ViewInfo | null = null;
  private present = false;
  /** Logged out: no reconnecting until the next login. */
  private stopped = false;
  /** A ping without answer yet: when it fires, the socket is dead. */
  private probeTimer: ReturnType<typeof setTimeout> | null = null;

  connect(): void {
    this.stopped = false;
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;
    wsStatus.value = 'connecting';

    // Hung while opening: a fresh one right away, or when the app is back in front (wake).
    const connectTimer = setTimeout(() => {
      if (this.ws !== ws || this.stopped || ws.readyState !== WebSocket.CONNECTING) return;
      ws.onclose = null;
      ws.close();
      this.lost();
      if (document.visibilityState === 'visible') this.connect();
    }, CONNECT_TIMEOUT_MS);

    ws.onopen = () => {
      clearTimeout(connectTimer);
      this.retry = 0;
      wsStatus.value = 'open';
      // Restore what this tab was doing before the reconnection.
      this.sendView();
      if (this.present) this.send({ t: 'presence', present: true });
    };
    ws.onmessage = (ev) => this.onMessage(JSON.parse(ev.data) as ServerMessage);
    ws.onclose = (ev) => {
      clearTimeout(connectTimer);
      if (this.ws !== ws || this.stopped) return;
      this.lost();
      // The hub closed this login (logout from another device).
      if (ev.code === 4401) return signedOut();
      const delay = Math.min(5000, 400 * 2 ** this.retry++);
      // A refused upgrade looks like any other failure: after a couple, ask whether the session ended.
      setTimeout(async () => {
        if (this.stopped || this.ws !== ws) return;
        if (this.retry < 3 || (await recheck())) this.connect();
      }, delay);
    };
  }

  /** The socket is gone: what was waiting on it fails. */
  private lost(): void {
    this.clearProbe();
    wsStatus.value = 'closed';
    for (const p of this.pending.values()) p.reject(new Error('Conexión perdida'));
    this.pending.clear();
  }

  private clearProbe(): void {
    if (this.probeTimer) clearTimeout(this.probeTimer);
    this.probeTimer = null;
  }

  /**
   * A socket can die without closing (the phone suspended the app, or changed network)
   * and still look open: then nothing arrives and what is sent goes nowhere. Without
   * an answer in time it is dropped and replaced at once.
   */
  private probe(): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || this.probeTimer) return;
    this.probeTimer = setTimeout(() => {
      this.probeTimer = null;
      if (this.ws !== ws || this.stopped) return;
      ws.onclose = null; // a dead socket may take minutes to report its close
      ws.close();
      this.lost();
      this.retry = 0;
      this.connect();
    }, PROBE_MS);
    ws.send(JSON.stringify({ t: 'ping' } satisfies ClientMessage));
  }

  disconnect(): void {
    this.stopped = true;
    this.clearProbe();
    this.ws?.close();
    this.ws = null;
    wsStatus.value = 'closed';
  }

  /** The app came back to the front or the network changed: reconnects now if the socket is dead. */
  wake(): void {
    if (this.stopped || !this.ws) return;
    if (this.ws.readyState === WebSocket.OPEN) this.probe();
    else if (this.ws.readyState !== WebSocket.CONNECTING) {
      this.retry = 0;
      this.connect();
    }
  }

  private onMessage(msg: ServerMessage): void {
    // Anything arriving proves the socket alive.
    this.clearProbe();
    switch (msg.t) {
      case 'welcome':
        clientId.value = msg.clientId;
        vapidKey.value = msg.vapidPublicKey;
        break;
      case 'tree':
        hosts.value = msg.hosts;
        break;
      case 'host':
        hosts.value = hosts.value.map((h) => (h.id === msg.host.id ? msg.host : h));
        break;
      case 'hostOrder':
        applyHostOrder(msg.hosts);
        break;
      case 'usage':
        usageSamples.value = msg.samples;
        break;
      case 'connections':
        connections.value = msg.list;
        break;
      case 'updates':
        updateInfo.value = msg.info;
        break;
      case 'settings':
        hubSettings.value = msg.settings;
        break;
      case 'dictation':
        dictationInfo.value = msg.info;
        break;
      case 'result': {
        const p = this.pending.get(msg.id);
        if (!p) break;
        this.pending.delete(msg.id);
        if (msg.ok) p.resolve(msg.data);
        else p.reject(new Error(msg.error ?? 'Error'));
        break;
      }
    }
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  setView(view: ViewInfo | null): void {
    this.view = view;
    this.sendView();
  }

  sendView(): void {
    this.send({ t: 'view', view: this.view, visible: document.visibilityState === 'visible' });
  }

  /** Whether you are at this device right now (see presence.ts). */
  setPresent(present: boolean): void {
    this.present = present;
    this.send({ t: 'presence', present });
  }

  /** Runs a tree action; errors become a toast and reject. */
  action<T = unknown>(host: string, op: ActionOp): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        toast('Sin conexión con el servidor', 'error');
        reject(new Error('Sin conexión'));
        return;
      }
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.ws.send(JSON.stringify({ t: 'action', id, host, ...op }));
    }).catch((err: Error) => {
      toast(err.message, 'error');
      throw err;
    });
  }
}

export const hub = new HubSocket();

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') hub.wake();
  hub.sendView();
});
window.addEventListener('online', () => hub.wake());
