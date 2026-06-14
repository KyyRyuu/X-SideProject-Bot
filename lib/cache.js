export class Cache {
  constructor(options = {}) {
    this.defaultTtl = options.ttl ?? 0;
    this.max = options.max ?? 1000;
    this.store = new Map();

    const period = (options.checkPeriod ?? 60) * 1000;
    if (period > 0) {
      this.sweeper = setInterval(() => this._sweep(), period);
      if (this.sweeper.unref) this.sweeper.unref();
    }
  }

  set(key, value, ttl = this.defaultTtl) {
    if (this.store.has(key)) this.store.delete(key);
    else if (this.store.size >= this.max) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    const expires = ttl > 0 ? Date.now() + ttl * 1000 : 0;
    this.store.set(key, { value, expires });
    return true;
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expires && entry.expires < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  take(key) {
    const value = this.get(key);
    this.store.delete(key);
    return value;
  }

  del(key) {
    const keys = Array.isArray(key) ? key : [key];
    let removed = 0;
    for (const k of keys) if (this.store.delete(k)) removed++;
    return removed;
  }

  keys() {
    return [...this.store.keys()];
  }

  flushAll() {
    this.store.clear();
  }

  close() {
    if (this.sweeper) clearInterval(this.sweeper);
  }

  _sweep() {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expires && entry.expires < now) this.store.delete(key);
    }
  }
}

export function createCache(options) {
  return new Cache(options);
}
