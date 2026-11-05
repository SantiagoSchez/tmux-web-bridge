/** What the heartbeat needs of a socket (a `ws` WebSocket). */
export interface Pingable {
  ping(): void;
  terminate(): void;
  on(event: 'pong' | 'close', listener: () => void): unknown;
}

/**
 * Finds the sockets that died without closing: a phone suspended or off the network
 * never sends its close, and behind a proxy with a long read timeout the socket would
 * stay "open" for hours. Meanwhile it would still count as watching its pane (no push
 * for it) and as a connected device. Each tick pings every socket; one that did not
 * answer the previous ping is cut, and its close handlers run as for any other close.
 */
export class Heartbeat {
  private readonly alive = new Map<Pingable, boolean>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly intervalMs = 30_000) {}

  watch(ws: Pingable): void {
    this.alive.set(ws, true);
    ws.on('pong', () => this.alive.set(ws, true));
    ws.on('close', () => this.alive.delete(ws));
    if (!this.timer) {
      this.timer = setInterval(() => this.tick(), this.intervalMs);
      this.timer.unref();
    }
  }

  tick(): void {
    for (const [ws, alive] of this.alive) {
      if (!alive) {
        this.alive.delete(ws);
        ws.terminate();
        continue;
      }
      this.alive.set(ws, false);
      try {
        ws.ping();
      } catch {
        /* closing already: its close handler removes it */
      }
    }
  }

  get size(): number {
    return this.alive.size;
  }
}
