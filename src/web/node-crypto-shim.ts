/**
 * Browser-compatible stub for node:crypto createHash.
 * Used only in the web bundle — the hash is for content comparison, not security.
 */
export function createHash(_algorithm: string) {
  let data = '';
  return {
    update(input: string) { data += input; return this; },
    digest(_encoding: string) {
      // FNV-1a 32-bit — sufficient for content-change detection
      let hash = 0x811c9dc5;
      for (let i = 0; i < data.length; i++) {
        hash ^= data.charCodeAt(i);
        hash = (hash * 0x01000193) >>> 0;
      }
      return hash.toString(16);
    },
  };
}
