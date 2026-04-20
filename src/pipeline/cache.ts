/**
 * Transform Cache - Content-hash cache for S5 Transform stage outputs.
 *
 * Prevents redundant Shiki highlighting and Mermaid rendering by caching
 * results keyed on content+lang+theme. Uses xxhash64 for fast hashing
 * and insertion-order Map for LRU-style eviction.
 */

/** Cached transform output */
export interface CacheEntry {
  highlightTokens?: unknown;
  mermaidText?: string;
  mermaidSvg?: string;
  isMermaid?: boolean;
  mermaidUnsupported?: string;
}

/**
 * Transform cache with content-hash keying and max-size eviction.
 *
 * Uses FNV-1a for fast content hashing.
 * Evicts oldest entry (insertion order) when max size is exceeded.
 */
export class TransformCache {
  private readonly map = new Map<string, CacheEntry>();
  private readonly maxSize: number;

  constructor(maxSize = 256) {
    this.maxSize = maxSize;
  }

  /**
   * Get cached entry for content+lang+theme combination.
   * Returns undefined on cache miss.
   */
  get(content: string, lang: string, theme: string): CacheEntry | undefined {
    const key = this.computeKey(content, lang, theme);
    return this.map.get(key);
  }

  /**
   * Store transform result for content+lang+theme.
   * Evicts oldest entry if cache is at max capacity.
   */
  set(content: string, lang: string, theme: string, entry: CacheEntry): void {
    const key = this.computeKey(content, lang, theme);

    // If key already exists, delete and re-insert to update order
    if (this.map.has(key)) {
      this.map.delete(key);
    }

    // Evict oldest if at capacity
    if (this.map.size >= this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) {
        this.map.delete(oldest);
      }
    }

    this.map.set(key, entry);
  }

  /** Compute cache key from content+lang+theme using node:crypto (works on Bun and Node). */
  private computeKey(content: string, lang: string, theme: string): string {
    const input = `${content}\0${lang}\0${theme}`;
    // FNV-1a 32-bit — fast and sufficient for in-memory cache keying
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = (hash * 0x01000193) >>> 0;
    }
    return hash.toString(16);
  }
}
