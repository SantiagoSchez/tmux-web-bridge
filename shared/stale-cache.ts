// Values read from somewhere slow, kept per key. A value past its lifetime keeps answering
// while one reload replaces it: whoever asks synchronously (a tap on a terminal link)
// never finds a value missing once it has been read.

/** A value at once, or the load it waits for (undefined when the load fails). */
export type StaleRead<T> = { ready: true; value: T } | { ready: false; pending: Promise<T | undefined> };

interface Entry<T> {
  at: number;
  has: boolean;
  value?: T;
  pending?: Promise<T | undefined>;
}

export class StaleCache<T> {
  private readonly entries = new Map<string, Entry<T>>();

  /** @param ttl How long a value holds before the next look reloads it, in ms. */
  constructor(
    private readonly ttl: number,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * The key's value when there is one, fresh or not, else the load on its way. Starts a
   * load when there is no value or it expired, unless one is already on its way. A failed
   * load keeps the old value, and the next look tries again.
   */
  get(key: string, load: () => Promise<T>): StaleRead<T> {
    let entry = this.entries.get(key);
    if (!entry) this.entries.set(key, (entry = { at: 0, has: false }));
    if (!entry.pending && (!entry.has || this.now() - entry.at >= this.ttl)) {
      const e = entry;
      e.pending = load().then(
        (value) => {
          Object.assign(e, { at: this.now(), has: true, value, pending: undefined });
          return value;
        },
        () => {
          e.pending = undefined;
          return e.has ? e.value : undefined;
        },
      );
    }
    return entry.has ? { ready: true, value: entry.value as T } : { ready: false, pending: entry.pending! };
  }
}
