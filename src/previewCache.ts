/**
 * Small LRU caches for preview post-processing. Previews rebuild their DOM on
 * every render, so highlighting/math/Mermaid would otherwise be recomputed for
 * unchanged blocks. Keys are content hashes; the source string is kept for
 * collision checks and evicted together with the value.
 */

interface Entry<V> {
  value: V;
  source: string;
  bytes: number;
}

export class PreviewCache<V> {
  private entries = new Map<string, Entry<V>>();
  private bytes = 0;

  constructor(
    private readonly maxEntries: number,
    private readonly maxBytes: number,
  ) {}

  get(key: string, source: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.source !== source) return undefined;
    // Refresh recency.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, source: string, value: V, bytes: number): void {
    const existing = this.entries.get(key);
    if (existing) {
      this.bytes -= existing.bytes;
      this.entries.delete(key);
    }
    this.entries.set(key, { value, source, bytes });
    this.bytes += bytes;
    while (
      this.entries.size > this.maxEntries ||
      (this.bytes > this.maxBytes && this.entries.size > 1)
    ) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      const entry = this.entries.get(oldest);
      if (!entry) break;
      this.entries.delete(oldest);
      this.bytes -= entry.bytes;
    }
  }

  clear(): void {
    this.entries.clear();
    this.bytes = 0;
  }
}

/** FNV-1a 32-bit; good enough for cache keys, collisions checked by source. */
export function hashSource(source: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${source.length}:${(hash >>> 0).toString(36)}`;
}

export function previewCacheKey(kind: string, source: string): string {
  return `${kind}:${hashSource(source)}`;
}

export const highlightCache = new PreviewCache<string>(300, 4 * 1024 * 1024);
export const mathCache = new PreviewCache<string>(500, 2 * 1024 * 1024);
export const mermaidCache = new PreviewCache<string>(50, 8 * 1024 * 1024);

/** Approximate UTF-16 byte cost used by the LRU limits. */
export function cacheBytes(value: string): number {
  return value.length * 2;
}
