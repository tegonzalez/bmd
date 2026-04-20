/**
 * Tiptap ProseMirror plugin for diff decorations (file-watch changes).
 *
 * Visualizes file-watch changes with:
 *   - Green background for added text (Decoration.inline with bmd-diff-added)
 *   - Red strikethrough ghost text for deletions (Decoration.widget with bmd-diff-deleted)
 *
 * State machine: idle -> showing -> dismissed
 *   - idle: no decorations, waiting for file-watch transaction
 *   - showing: decorations visible, file-watch changes highlighted
 *   - dismissed: user edited content, decorations cleared
 *
 * Transitions:
 *   - fileWatch meta -> showing (on fileWatchLast, combined diff displayed)
 *   - content edit (not undo/redo) -> dismissed
 *   - undo/redo to file-watch boundary -> showing (restored)
 *   - selection-only -> no change
 *
 * F7/Shift+F7 cycles through diff regions when in showing state.
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { TextSelection } from '@tiptap/pm/state';
import { undoDepth } from '@tiptap/pm/history';
import { combineDiffs, type DiffData } from './file-watch-delta.ts';
import type { EditorView } from '@tiptap/pm/view';

/** ProseMirror position offset for CodeBlock schema. */
const PM_OFFSET = 1;

export const diffPluginKey = new PluginKey('diffDecoration');

export interface DiffPluginState {
  phase: 'idle' | 'showing' | 'dismissed';
  decorations: DecorationSet;
  fileWatchVersions: Map<number, DiffData>;  // undo depth -> diff data
  accumulatedDiffs: DiffData[];              // collected during batch dispatch
  currentDiff: DiffData | null;
}

/**
 * Check if a transaction is an undo/redo operation.
 * ProseMirror history plugin sets 'history$' meta on undo/redo transactions.
 */
function isUndoRedo(tr: any): boolean {
  return tr.getMeta('history$') !== undefined;
}

/**
 * Build a DecorationSet from DiffData.
 * - Added ranges: Decoration.inline with bmd-diff-added class
 * - Deleted text: Decoration.widget with bmd-diff-deleted ghost element
 */
function buildDiffDecorations(doc: any, diff: DiffData): DecorationSet {
  const decorations: Decoration[] = [];

  for (const added of diff.added) {
    const from = added.from + PM_OFFSET;
    const to = added.to + PM_OFFSET;
    // Clamp to document bounds
    if (from >= 0 && to <= doc.content.size) {
      decorations.push(
        Decoration.inline(from, to, { class: 'bmd-diff-added' }),
      );
    }
  }

  for (const deleted of diff.deleted) {
    const pos = deleted.pos + PM_OFFSET;
    if (pos >= 0 && pos <= doc.content.size) {
      decorations.push(
        Decoration.widget(pos, () => {
          const span = document.createElement('span');
          span.className = 'bmd-diff-deleted';
          span.textContent = deleted.text;
          span.contentEditable = 'false';
          return span;
        }, { side: -1, key: `ghost-${pos}` }),
      );
    }
  }

  return DecorationSet.create(doc, decorations);
}

/**
 * Collect all diff positions from a DiffData for F7 navigation.
 * Returns sorted array of positions.
 */
function collectDiffPositions(diff: DiffData): number[] {
  const positions: number[] = [];
  for (const added of diff.added) {
    positions.push(added.from + PM_OFFSET);
  }
  for (const deleted of diff.deleted) {
    positions.push(deleted.pos + PM_OFFSET);
  }
  return positions.sort((a, b) => a - b);
}

function createInitialState(doc: any): DiffPluginState {
  return {
    phase: 'idle',
    decorations: DecorationSet.empty,
    fileWatchVersions: new Map(),
    accumulatedDiffs: [],
    currentDiff: null,
  };
}

/**
 * ProseMirror plugin for diff decorations.
 */
export const DiffDecorationPlugin = new Plugin<DiffPluginState>({
  key: diffPluginKey,
  state: {
    init(_, { doc }) {
      return createInitialState(doc);
    },
    apply(tr, prev, _oldState, newState) {
      const fileWatchMeta = tr.getMeta('fileWatch');
      const fileWatchLastMeta = tr.getMeta('fileWatchLast');

      // Case 1: File-watch transaction (from banner acceptance)
      if (fileWatchMeta) {
        const diffData: DiffData = fileWatchMeta.diffData;
        const newAccumulated = [...prev.accumulatedDiffs, diffData];

        // Record undo depth -> DiffData for per-step undo/redo restoration
        const depth = undoDepth(newState);
        const newVersions = new Map(prev.fileWatchVersions);
        newVersions.set(depth, diffData);

        if (fileWatchLastMeta) {
          // Final transaction in batch: combine all diffs and show
          const combined = combineDiffs(newAccumulated);
          return {
            phase: 'showing' as const,
            decorations: buildDiffDecorations(tr.doc, combined),
            fileWatchVersions: newVersions,
            accumulatedDiffs: [],
            currentDiff: combined,
          };
        }

        // Intermediate transaction: accumulate but don't show yet
        return {
          ...prev,
          accumulatedDiffs: newAccumulated,
          fileWatchVersions: newVersions,
          decorations: DecorationSet.empty,
        };
      }

      // Case 2: Content-modifying transaction (NOT undo/redo, NOT programmatic reset)
      const isProgrammaticReset = tr.getMeta('addToHistory') === false;
      if (tr.docChanged && !isUndoRedo(tr) && !isProgrammaticReset) {
        if (prev.phase === 'showing' || prev.phase === 'idle') {
          return {
            phase: 'dismissed' as const,
            decorations: DecorationSet.empty,
            fileWatchVersions: prev.fileWatchVersions, // Preserve for undo/redo restoration (DIFF-04)
            accumulatedDiffs: [],
            currentDiff: null,
          };
        }
        // Already dismissed, stay dismissed
        return {
          ...prev,
          decorations: DecorationSet.empty,
        };
      }

      // Case 3: Undo/redo transaction
      if (isUndoRedo(tr)) {
        const depth = undoDepth(newState);
        const storedDiff = prev.fileWatchVersions.get(depth);
        if (storedDiff) {
          return {
            phase: 'showing' as const,
            decorations: buildDiffDecorations(tr.doc, storedDiff),
            fileWatchVersions: prev.fileWatchVersions,
            accumulatedDiffs: [],
            currentDiff: storedDiff,
          };
        }
        // No match -- clear decorations
        return {
          phase: 'idle' as const,
          decorations: DecorationSet.empty,
          fileWatchVersions: prev.fileWatchVersions,
          accumulatedDiffs: [],
          currentDiff: null,
        };
      }

      // Case 4: Selection-only or no-change transaction
      if (prev.decorations !== DecorationSet.empty && tr.mapping) {
        return {
          ...prev,
          decorations: prev.decorations.map(tr.mapping, tr.doc),
        };
      }

      return prev;
    },
  },
  props: {
    decorations(state) {
      return diffPluginKey.getState(state)?.decorations ?? DecorationSet.empty;
    },
    handleKeyDown(view: EditorView, event: KeyboardEvent): boolean {
      if (event.key !== 'F7') return false;

      const pluginState = diffPluginKey.getState(view.state) as DiffPluginState | undefined;
      if (!pluginState || pluginState.phase !== 'showing' || !pluginState.currentDiff) {
        return false;
      }

      const positions = collectDiffPositions(pluginState.currentDiff);
      if (positions.length === 0) return false;

      const cursorPos = view.state.selection.from;
      const reverse = event.shiftKey;

      let targetPos: number;
      if (reverse) {
        // Shift+F7: previous diff region
        const prevPositions = positions.filter(p => p < cursorPos);
        targetPos = prevPositions.length > 0
          ? prevPositions[prevPositions.length - 1]!
          : positions[positions.length - 1]!; // circular wrap
      } else {
        // F7: next diff region
        const nextPositions = positions.filter(p => p > cursorPos);
        targetPos = nextPositions.length > 0
          ? nextPositions[0]!
          : positions[0]!; // circular wrap
      }

      const { tr } = view.state;
      tr.setSelection(TextSelection.create(view.state.doc, targetPos));
      view.dispatch(tr);
      return true;
    },
  },
});

/**
 * Tiptap Extension wrapper for the diff decoration plugin.
 */
export const DiffDecoration = Extension.create({
  name: 'diffDecoration',
  addProseMirrorPlugins() {
    return [DiffDecorationPlugin];
  },
});
