/**
 * Yjs document manager for CRDT-based file synchronization.
 * Maintains one Y.Doc per open file, producing binary updates on external changes.
 */

import { writeDiagnostic, Severity } from '../diagnostics/formatter.ts';
import * as Y from 'yjs';
import diff from 'fast-diff';

export class YjsDocumentManager {
  private docs = new Map<string, Y.Doc>();

  /**
   * Create a Y.Doc for the given file path with initial content.
   * Stores the doc internally and returns it.
   */
  createDoc(path: string, initialContent: string): Y.Doc {
    const doc = new Y.Doc();
    const text = doc.getText('content');
    text.insert(0, initialContent);
    this.docs.set(path, doc);
    return doc;
  }

  /**
   * Apply an external file change to the Y.Doc for the given path.
   * Returns the Yjs binary update if content changed, or null if unchanged/unknown.
   */
  applyExternalChange(path: string, newContent: string): Uint8Array | null {
    const doc = this.docs.get(path);
    if (!doc) return null;

    const text = doc.getText('content');
    const oldContent = text.toString();
    if (oldContent === newContent) return null;

    // Capture the update produced by the transaction
    let update: Uint8Array | null = null;
    const handler = (u: Uint8Array) => {
      update = u;
    };
    doc.on('update', handler);

    // Compute minimal diff and apply granular ops for real CRDT merge
    const diffs = diff(oldContent, newContent);
    doc.transact(() => {
      let cursor = 0;
      for (const [op, str] of diffs) {
        if (op === 0) {
          // Equal — advance cursor
          cursor += str.length;
        } else if (op === -1) {
          // Delete
          text.delete(cursor, str.length);
        } else if (op === 1) {
          // Insert
          text.insert(cursor, str);
          cursor += str.length;
        }
      }
    });

    doc.off('update', handler);
    return update;
  }

  /**
   * Get the full Yjs state for the given path as a binary update.
   * Returns null if no doc exists for the path.
   */
  getFullState(path: string): Uint8Array | null {
    const doc = this.docs.get(path);
    if (!doc) return null;
    return Y.encodeStateAsUpdate(doc);
  }

  /**
   * Get the Yjs state vector for the given path.
   * Returns null if no doc exists for the path.
   */
  getStateVector(path: string): Uint8Array | null {
    const doc = this.docs.get(path);
    if (!doc) return null;
    return Y.encodeStateVector(doc);
  }

  /**
   * Apply a client Yjs update to the server doc for the given path.
   * Logs error if no doc exists for the path.
   */
  applyClientUpdate(path: string, clientUpdate: Uint8Array): void {
    const doc = this.docs.get(path);
    if (!doc) {
      writeDiagnostic({ file: 'src/server/yjs-doc.ts', line: 94, col: 7, span: 0, message: `applyClientUpdate: no doc for path "${path}"`, severity: Severity.DiagError });
      return;
    }
    Y.applyUpdate(doc, clientUpdate);
  }

  /**
   * Get the raw Y.Doc for a path.
   * Returns null if no doc exists for the path.
   */
  getDoc(path: string): Y.Doc | null {
    return this.docs.get(path) ?? null;
  }

  /**
   * Get the text content of the Y.Doc for the given path.
   * Returns null if no doc exists for the path.
   */
  getContent(path: string): string | null {
    const doc = this.docs.get(path);
    if (!doc) return null;
    return doc.getText('content').toString();
  }

  /**
   * Clean up and destroy the Y.Doc for the given path.
   */
  cleanup(path: string): void {
    const doc = this.docs.get(path);
    if (doc) {
      doc.destroy();
      this.docs.delete(path);
    }
  }
}
