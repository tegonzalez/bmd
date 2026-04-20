/**
 * File watcher with debounce for bmd serve.
 * Watches a file for external changes and notifies via callback.
 */

import { writeDiagnostic, Severity } from '../diagnostics/formatter.ts';
import { watch, readFileSync, type FSWatcher } from 'node:fs';
import { createHash } from 'node:crypto';

/** Per-file hash of the last content written by the server (to suppress echo) */
const lastWrittenHashes = new Map<string, string>();

/**
 * Set the hash of content that was just written by the server for a specific file.
 * The watcher will suppress the next change notification if the
 * file content matches this hash (prevents echo from own writes).
 */
export function setLastWrittenContent(filePath: string, content: string): void {
  lastWrittenHashes.set(filePath, hashContent(content));
}

export function hashContent(content: string): string {
  return createHash('md5').update(content).digest('hex');
}

/**
 * Watch a file for changes and call onChange with the new content.
 * Uses 100ms debounce to coalesce rapid filesystem events.
 * Returns a cleanup function that stops watching.
 */
export function watchFile(
  filePath: string,
  onChange: (content: string) => void,
): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let watcher: FSWatcher;

  try {
    watcher = watch(filePath, () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          const content = readFileSync(filePath, 'utf-8');
          const contentHash = hashContent(content);

          // Suppress echo from own writes (per-file)
          if (lastWrittenHashes.get(filePath) === contentHash) {
            lastWrittenHashes.delete(filePath);
            return;
          }

          onChange(content);
        } catch (err) {
          writeDiagnostic({ file: 'src/server/file-watcher.ts', line: 54, col: 11, span: 0, message: `Read failed (${filePath}): ${err instanceof Error ? err.message : String(err)}`, severity: Severity.DiagError });
          onChange('');
        }
      }, 100);
    });
  } catch (err) {
    writeDiagnostic({ file: 'src/server/file-watcher.ts', line: 60, col: 5, span: 0, message: `Watch failed (${filePath}): ${err instanceof Error ? err.message : String(err)}`, severity: Severity.DiagError });
    return () => {};
  }

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    watcher.close();
  };
}

/**
 * Watch multiple files and return a single cleanup function.
 * Each file gets its own watcher with independent echo suppression.
 */
export function watchFiles(
  files: Array<{ path: string; onChange: (content: string) => void }>,
): () => void {
  const cleanups = files.map((f) => watchFile(f.path, f.onChange));
  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}
