import type { ActionOp, ClientMessage, ServerMessage, ViewInfo } from '../../shared/types';
import { recheck, signedOut } from './auth';
import { applyHostOrder, clientId, connections, hosts, toast, usageSamples, vapidKey, wsStatus } from './state';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

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

  connect(): void {
    this.stopped = false;
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;
    wsStatus.value = 'connecting';

    ws.onopen = () => {
      this.retry = 0;
      wsStatus.value = 'open';
      // Restore what this tab was doing before the reconnection.
      this.sendView();
      if (this.present) this.send({ t: 'presence', present: true });
    };
    ws.onmessage = (ev) => this.onMessage(JSON.parse(ev.data) as ServerMessage);
    ws.onclose = (ev) => {
      if (this.ws !== ws || this.stopped) return;
      wsStatus.value = 'closed';
      for (const p of this.pending.values()) p.reject(new Error('Conexión perdida'));
      this.pending.clear();
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

  disconnect(): void {
    this.stopped = true;
    this.ws?.close();
    this.ws = null;
    wsStatus.value = 'closed';
  }

  /** Reconnects now (the app came back to the foreground with a dead socket). */
  wake(): void {
    if (this.stopped) return;
    if (this.ws && this.ws.readyState !== WebSocket.OPEN && this.ws.readyState !== WebSocket.CONNECTING) {
      this.retry = 0;
      this.connect();
    }
  }

  private onMessage(msg: ServerMessage): void {
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
