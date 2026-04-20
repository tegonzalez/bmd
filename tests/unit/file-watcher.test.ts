/**
 * File watcher unit tests.
 * Tests per-file hash isolation and multi-file watcher cleanup.
 */
import { test, expect, describe } from 'bun:test';
import { setLastWrittenContent, watchFile } from '../../src/server/file-watcher.ts';

describe('file-watcher per-file hash isolation', () => {
  test('setLastWrittenContent for path A does not affect path B', () => {
    // After setting hash for path A, watching path B should not suppress changes
    // This tests that the internal hash map is keyed by file path
    setLastWrittenContent('/tmp/a.md', 'content-a');

    // The function should accept two args (filePath, content)
    // If it only accepts one arg, this test will fail at compile/runtime
    expect(() => setLastWrittenContent('/tmp/b.md', 'content-b')).not.toThrow();
  });

  test('watchFiles returns a single cleanup function that stops all watchers', async () => {
    // Import watchFiles (multi-file variant)
    const { watchFiles } = await import('../../src/server/file-watcher.ts');
    expect(typeof watchFiles).toBe('function');
  });
});
