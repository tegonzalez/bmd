/**
 * Tiptap ProseMirror plugin for Unicode detection decorations.
 *
 * Consumes pre-computed Finding[] from the pipeline's sanitize stage
 * rather than calling scanUnicode() directly. This honors the locked
 * decision: "Detection happens once -- all pipelines consume same Finding[]".
 *
 * The preview pipeline runs sanitize() once and shares the findings
 * with the editor through setFindings().
 *
 * Atomic decorations (e.g. ANSI escape sequences) use inline decorations
 * to mark the range + a widget decoration to show the replacement glyph.
 * Click selects the full atomic range; delete at boundary removes it as a unit.
 */

import { writeDiagnostic, Severity } from '../diagnostics/formatter.ts';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';
import type { Finding } from '../unicode/types';
import type { RegionMap } from '../pipeline/types';

const unicodePluginKey = new PluginKey('unicodeDetection');

/** Default glyph colors — must match theme/defaults.ts + styles.css fallbacks */
const GLYPH_COLORS: Record<string, { fg: string; bg?: string }> = {
  'zero-width':      { fg: '#e06c75' },
  'bidi':            { fg: '#e5c07b', bg: '#3e3022' },
  'tag':             { fg: '#c678dd' },
  'c0-control':      { fg: '#e06c75' },
  'c1-control':      { fg: '#e06c75' },
  'ansi-escape':     { fg: '#e06c75', bg: '#2c1a1a' },
  'whitespace':      { fg: '#7f848e', bg: 'rgba(127,132,142,0.15)' },
  'pua':             { fg: '#c678dd' },
  'ai-watermark':    { fg: '#61afef' },
  'variation-sel':   { fg: '#7f848e' },
  'annotation':      { fg: '#c678dd' },
  'deprecated':      { fg: '#7f848e' },
  'noncharacter':    { fg: '#e06c75' },
  'separator':       { fg: '#7f848e' },
  'combining-flood': { fg: '#e5c07b' },
  'unclassified':    { fg: '#7f848e' },
};

/**
 * Apply inline theme colors to a glyph element.
 * Inline styles are required because lowlight's inherited styles inside <code>
 * override CSS class-based colors.
 */
function applyThemeColors(el: HTMLElement, category: string): void {
  // Prefer live CSS custom properties (honors user theme), fall back to defaults
  let fg = '';
  let bg = '';
  try {
    const style = getComputedStyle(document.documentElement);
    fg = style.getPropertyValue(`--bmd-unic-${category}-fg`).trim();
    bg = style.getPropertyValue(`--bmd-unic-${category}-bg`).trim();
  } catch (err) { writeDiagnostic({ file: 'src/web/unicode-decoration.ts', line: 58, col: 5, span: 0, message: `Failed to read computed style for unicode category ${category}: ${err instanceof Error ? err.message : String(err)}`, severity: Severity.Info }); }
  const fallback = GLYPH_COLORS[category]!;
  el.style.color = fg || fallback?.fg || '#e06c75';
  if (bg || fallback?.bg) el.style.background = bg || fallback!.bg!;
}

/** Shared findings state -- set by the preview pipeline, consumed by the editor. */
let sharedFindings: Finding[] = [];

/** Shared template regions -- set by the preview pipeline, consumed by the editor. */
let sharedRegions: RegionMap[] = [];

/** Tracked atomic ranges for click/delete handling. */
let atomicRanges: Array<{ from: number; to: number; findings: Finding[] }> = [];

/** Meta key used to signal the plugin that findings changed. */
const FINDINGS_CHANGED = 'unicodeFindingsChanged';


/**
 * Update the shared findings and regions from the preview pipeline,
 * then dispatch a transaction to rebuild decorations.
 */
export function setFindings(findings: Finding[], view?: EditorView): void {
  sharedFindings = findings;

  if (view) {
    const tr = view.state.tr.setMeta(FINDINGS_CHANGED, true);
    view.dispatch(tr);
  }
}

/**
 * Update the shared template regions from the preview pipeline.
 */
export function setRegions(regions: RegionMap[]): void {
  sharedRegions = regions;
}

/**
 * Create a DOM element for a glyph widget.
 */
export function createGlyphElement(finding: Finding): HTMLElement {
  const span = document.createElement('span');
  span.className = `bmd-unic bmd-unic-${finding.category}`;
  span.title = finding.tooltip;
  span.textContent = finding.glyph;
  applyThemeColors(span, finding.category);
  return span;
}

/**
 * Create a DOM element for an atomic glyph widget.
 */
export function createAtomicElement(findings: Finding[], from: number, to: number): HTMLElement {
  const span = document.createElement('span');
  const category = findings[0]!.category;
  span.className = `bmd-unic bmd-unic-${category} bmd-unic-atomic`;
  span.title = findings.map(f => f.tooltip).join(', ');
  span.textContent = findings.map(f => f.glyph).join('');
  span.dataset.from = String(from);
  span.dataset.to = String(to);
  applyThemeColors(span, category);
  return span;
}

/**
 * Find the atomic range that contains the given position, if any.
 */
function findAtomicRange(pos: number): { from: number; to: number; findings: Finding[] } | null {
  for (const range of atomicRanges) {
    if (pos >= range.from && pos <= range.to) {
      return range;
    }
  }
  return null;
}

/**
 * Build DecorationSet from shared findings (pre-computed by sanitize stage).
 * Converts shared findings into ProseMirror Decoration objects.
 * ProseMirror offset = scanner offset + 1 (CodeBlock node boundary).
 */
function buildDecorations(doc: any): DecorationSet {
  atomicRanges = [];


  if (sharedFindings.length === 0 && sharedRegions.length === 0) return DecorationSet.empty;

  const decorations: Decoration[] = [];
  const PM_OFFSET = 1;

  // Group atomic findings by atomicGroupId
  const atomicGroups = new Map<number, Finding[]>();
  const nonAtomicFindings: Finding[] = [];

  for (const f of sharedFindings) {
    if (f.isAtomic && f.atomicGroupId !== undefined) {
      const group = atomicGroups.get(f.atomicGroupId);
      if (group) {
        group.push(f);
      } else {
        atomicGroups.set(f.atomicGroupId, [f]);
      }
    } else {
      nonAtomicFindings.push(f);
    }
  }

  // Non-atomic: widget decorations (shown before the character)
  for (const f of nonAtomicFindings) {
    const from = f.offset + PM_OFFSET;

    decorations.push(
      Decoration.widget(from, () => createGlyphElement(f), {
        side: -1,
        key: `unic-${f.offset}`,
      }),
    );
  }

  // Atomic: inline decoration to mark the range + widget for glyph display
  for (const [_groupId, group] of atomicGroups) {
    const sorted = group.sort((a, b) => a.offset - b.offset);
    const from = sorted[0]!.offset + PM_OFFSET;
    const last = sorted[sorted.length - 1]!;
    const to = last.offset + last.length + PM_OFFSET;

    // Track the atomic range for click/delete handling
    atomicRanges.push({ from, to, findings: sorted });

    // Inline decoration: mark the text range with atomic class and hide original text
    decorations.push(
      Decoration.inline(from, to, {
        class: `bmd-unic bmd-unic-${sorted[0]!.category} bmd-unic-atomic`,
        title: sorted.map(f => f.tooltip).join(', '),
        'data-atomic-from': String(from),
        'data-atomic-to': String(to),
        style: 'font-size: 0; overflow: hidden; width: 0; display: inline;',
      }, {
        inclusiveStart: false,
        inclusiveEnd: false,
        atomicFrom: from,
        atomicTo: to,
      }),
    );

    // Widget decoration: show glyph before the hidden range
    decorations.push(
      Decoration.widget(from, () => createAtomicElement(sorted, from, to), {
        side: -1,
        key: `unic-atomic-${from}`,
      }),
    );
  }

  // Template region decorations: inline decorations with bmd-region-template class
  for (const region of sharedRegions) {
    if (region.type !== 'T') continue;
    const from = region.expandedByteRange[0]! + PM_OFFSET;
    const to = region.expandedByteRange[1]! + PM_OFFSET;
    decorations.push(
      Decoration.inline(from, to, {
        class: 'bmd-region bmd-region-template',
        title: region.originalContent,
        'data-region-id': String(region.id),
      }),
    );
  }

  return DecorationSet.create(doc, decorations);
}

/**
 * Handle click on atomic decorations -- select the entire atomic range.
 */
function handleClick(view: EditorView, pos: number, event: MouseEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (!target) return false;

  // Check if click target is an atomic decoration element
  if (target.classList?.contains('bmd-unic-atomic')) {
    const from = parseInt(target.dataset.from ?? '', 10);
    const to = parseInt(target.dataset.to ?? '', 10);
    if (!isNaN(from) && !isNaN(to)) {
      const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to));
      view.dispatch(tr);
      return true;
    }
  }

  // Also check if the resolved pos falls within an atomic range
  const range = findAtomicRange(pos);
  if (range) {
    const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, range.from, range.to));
    view.dispatch(tr);
    return true;
  }

  return false;
}

/**
 * Handle keydown for delete/backspace at atomic decoration boundaries.
 * When cursor is at the edge of an atomic range, remove the entire range.
 */
function handleKeyDown(view: EditorView, event: KeyboardEvent): boolean {
  if (event.key !== 'Backspace' && event.key !== 'Delete') return false;

  const { from, to } = view.state.selection;

  // Only handle when cursor is collapsed (no existing selection)
  if (from !== to) return false;

  if (event.key === 'Backspace') {
    // Cursor is right after the atomic range end -- delete the whole range
    const range = findAtomicRange(from - 1);
    if (range && from === range.to) {
      const tr = view.state.tr.delete(range.from, range.to);
      view.dispatch(tr);
      return true;
    }
    // Cursor is inside the atomic range -- delete the whole range
    const innerRange = findAtomicRange(from);
    if (innerRange) {
      const tr = view.state.tr.delete(innerRange.from, innerRange.to);
      view.dispatch(tr);
      return true;
    }
  }

  if (event.key === 'Delete') {
    // Cursor is right before the atomic range start -- delete the whole range
    const range = findAtomicRange(from + 1);
    if (range && from === range.from) {
      const tr = view.state.tr.delete(range.from, range.to);
      view.dispatch(tr);
      return true;
    }
    // Cursor is inside the atomic range -- delete the whole range
    const innerRange = findAtomicRange(from);
    if (innerRange) {
      const tr = view.state.tr.delete(innerRange.from, innerRange.to);
      view.dispatch(tr);
      return true;
    }
  }

  return false;
}

/**
 * ProseMirror plugin that manages unicode detection decorations.
 * Consumes shared findings from the sanitize stage.
 *
 * Props:
 * - decorations: renders glyph widgets and atomic inline decorations
 * - handleClick: selects entire atomic range on click
 * - handleKeyDown: removes entire atomic range on delete/backspace at boundary
 */
export const UnicodeDecorationPlugin = new Plugin({
  key: unicodePluginKey,
  state: {
    init(_, { doc }) {
      return buildDecorations(doc);
    },
    apply(tr, decorationSet) {
      if (tr.docChanged || tr.getMeta(FINDINGS_CHANGED)) {
        return buildDecorations(tr.doc);
      }
      return decorationSet.map(tr.mapping, tr.doc);
    },
  },
  props: {
    decorations(state) {
      return unicodePluginKey.getState(state);
    },
    handleClick,
    handleKeyDown,
  },
});

/**
 * Tiptap Extension wrapper for the Unicode detection plugin.
 */
export const UnicodeDetection = Extension.create({
  name: 'unicodeDetection',
  addProseMirrorPlugins() {
    return [UnicodeDecorationPlugin];
  },
});
