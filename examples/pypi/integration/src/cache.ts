/** Minimal in-memory TTL cache with a size bound (oldest entries evicted first). */
export class TtlCache {
  private store = new Map<string, { expires: number; value: unknown }>();
  private readonly maxEntries: number;
  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
  }

  get<T>(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value as T;
  }

  set(key: string, value: unknown, ttlMs: number): void {
    if (ttlMs <= 0) return;
    if (this.store.size >= this.maxEntries) this.store.delete(this.store.keys().next().value as string);
    this.store.set(key, { expires: Date.now() + ttlMs, value });
  }

  clear(): void {
    this.store.clear();
  }
}
