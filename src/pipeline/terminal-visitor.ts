/**
 * TerminalVisitor - Tree-based terminal renderer.
 *
 * Replaces the stateful renderTokens() fold with ancestor-chain-based
 * context derivation. Produces character-identical output to the old
 * renderer for all existing fixtures.
 */

import type { DocNode, RegionMap, RenderVisitor } from './types.js';
import type { Finding } from '../unicode/types.js';
import type { FormatAdapter, RenderContext } from '../renderer/types.js';
import type { AnsiLayer } from '../renderer/ansi-layer.js';
import type { TableRow, TableAlign } from '../renderer/table.js';
import { layoutTable } from '../renderer/table.js';
import { displayWidth, wrapText } from '../renderer/wrap.js';
import { Chalk } from 'chalk';
import type { HighlightToken } from '../types/highlight.js';

/**
 * Parse a hex color string to RGB components.
 */
function parseHex(color: string): { r: number; g: number; b: number } {
  const hex = color.startsWith('#') ? color.slice(1) : color;
  return {
    r: parseInt(hex.slice(0, 2), 16) || 0,
    g: parseInt(hex.slice(2, 4), 16) || 0,
    b: parseInt(hex.slice(4, 6), 16) || 0,
  };
}

/**
 * Render highlighted token lines with format-specific styling.
 */
function renderHighlightedLines(
  tokens: HighlightToken[][],
  mode: 'ansi' | 'utf8' | 'ascii',
  codeIndent: string,
): string {
  return tokens.map(line => {
    const renderedTokens = line.map(token => {
      if (mode === 'ascii') {
        return token.content;
      }
      if (mode === 'utf8') {
        let styled = token.content;
        if (token.fontStyle & 1) styled = `\x1b[3m${styled}\x1b[23m`;
        if (token.fontStyle & 2) styled = `\x1b[1m${styled}\x1b[22m`;
        return styled;
      }
      let color = token.color || '#e1e4e8';
      if (color.length === 9) color = color.slice(0, 7);
      const { r, g, b } = parseHex(color);
      let styled = `\x1b[38;2;${r};${g};${b}m${token.content}\x1b[39m`;
      if (token.fontStyle & 4) styled = `\x1b[4m${styled}\x1b[24m`;
      if (token.fontStyle & 1) styled = `\x1b[3m${styled}\x1b[23m`;
      if (token.fontStyle & 2) styled = `\x1b[1m${styled}\x1b[22m`;
      return styled;
    });
    return codeIndent + renderedTokens.join('');
  }).join('\n');
}

/**
 * TerminalVisitor renders a DocTree to terminal text.
 *
 * Uses ancestor-chain-based context derivation instead of mutable state.
 * Delegates ANSI styling to AnsiLayer and character choices to FormatAdapter.
 */
export class TerminalVisitor implements RenderVisitor {
  private adapter: FormatAdapter;
  private ansi: AnsiLayer | null;
  private ctx: RenderContext;

  constructor(adapter: FormatAdapter, ansi: AnsiLayer | null, ctx: RenderContext) {
    this.adapter = adapter;
    this.ansi = ansi;
    this.ctx = ctx;
  }

  /**
   * Entry point: render a DocTree to terminal string.
   */
  render(tree: DocNode): string {
    return this.visitDocument(tree);
  }

  visitDocument(node: DocNode): string {
    const lines = this.renderBlockChildren(node.children, []);
    return lines.join('\n') + '\n';
  }

  visitHeading(node: DocNode, level: number, ancestors: DocNode[]): string {
    const text = this.renderInlineChildren(node, ancestors).trim();
    const prefix = this.adapter.headingPrefix(level);
    const bqCols = this.blockquotePrefixColumns(ancestors);
    const prefixLen = prefix ? displayWidth(prefix + ' ') : 0;
    const availableWidth = Math.max(1, this.ctx.width - bqCols);

    let fullText = prefix ? prefix + ' ' + text : text;

    // Wrap if heading exceeds available width (display width; blockquote bars may be >1 col each)
    if (displayWidth(fullText) > availableWidth && availableWidth > prefixLen) {
      const wrappedBody = wrapText(text, availableWidth, prefixLen);
      const lines = wrappedBody.split('\n');
      if (prefix && lines.length > 0) {
        lines[0] = prefix + ' ' + lines[0]!.trimStart();
      }
      fullText = lines.join('\n');
    }

    if (this.ansi) fullText = this.ansi.heading(fullText, level);
    return this.applyQuotePrefix(fullText, ancestors);
  }

  visitParagraph(node: DocNode, ancestors: DocNode[]): string {
    const text = this.renderInlineChildren(node, ancestors);
    const bqCols = this.blockquotePrefixColumns(ancestors);
    const availableWidth = Math.max(1, this.ctx.width - bqCols);
    return wrapText(text, availableWidth, 0);
  }

  visitFence(node: DocNode, ancestors: DocNode[]): string {
    const codeIndent = this.adapter.codeIndent();
    const langInfo = ((node.meta.info as string) || '').trim();
    const meta = node.meta as any;
    const parts: string[] = [];

    // Language label
    if (langInfo && langInfo.toLowerCase() !== 'mermaid' && !meta.isMermaid) {
      const label = codeIndent + langInfo;
      parts.push(this.ansi ? this.ansi.codeBlock(label) : label);
    }

    if (meta.isMermaid && meta.mermaidRendered) {
      parts.push(meta.mermaidRendered);
    } else if (meta.isMermaid && meta.mermaidUnsupported) {
      const placeholder = `${codeIndent}[${meta.mermaidUnsupported} diagram - unsupported]`;
      parts.push(this.ansi ? this.ansi.codeBlock(placeholder) : placeholder);
    } else if (meta.isMermaid) {
      const content = (node.content || '').replace(/\n$/, '');
      const codeLines = content.split('\n').map((line: string) => {
        const indented = codeIndent + line;
        return this.ansi ? this.ansi.codeBlock(indented) : indented;
      });
      parts.push(codeLines.join('\n'));
    } else if (meta.highlightTokens) {
      let mode: 'ansi' | 'utf8' | 'ascii';
      if (this.ctx.ansiEnabled && this.ansi) mode = 'ansi';
      else if (this.ctx.format === 'utf8') mode = 'utf8';
      else mode = 'ascii';
      parts.push(renderHighlightedLines(meta.highlightTokens, mode, codeIndent));
    } else {
      let content = (node.content || '').replace(/\n$/, '');
      const contentOffset = this.getFenceContentOffset(node);
      content = this.decorateLeafText(content, contentOffset, node.findings, node.regions);
      const codeLines = content.split('\n').map((line: string) => {
        const indented = codeIndent + line;
        return this.ansi ? this.ansi.codeBlock(indented) : indented;
      });
      parts.push(codeLines.join('\n'));
    }

    return this.applyQuotePrefix(parts.join('\n'), ancestors);
  }

  visitBulletList(node: DocNode, ancestors: DocNode[]): string {
    return this.renderList(node, ancestors, 'unordered', 0);
  }

  visitOrderedList(node: DocNode, ancestors: DocNode[]): string {
    const start = (node.meta.start as number) || 1;
    return this.renderList(node, ancestors, 'ordered', start);
  }

  visitListItem(node: DocNode, index: number, ancestors: DocNode[]): string {
    return '';
  }

  visitTable(node: DocNode, ancestors: DocNode[]): string {
    const tableRows: TableRow[] = [];
    const tableAligns: TableAlign[] = [];
    let alignsExtracted = false;

    for (const row of node.children) {
      if (row.type !== 'table_row') continue;
      const cells: string[] = [];
      let isHeader = false;

      for (const cell of row.children) {
        if (cell.type !== 'table_cell') continue;
        if (cell.meta.isHeader) isHeader = true;
        if (!alignsExtracted && isHeader) {
          tableAligns.push((cell.meta.align as TableAlign) || '');
        }
        cells.push(this.renderInlineChildren(cell, [...ancestors, node, row]).trim());
      }
      if (isHeader) alignsExtracted = true;
      tableRows.push({ cells, isHeader });
    }

    const chars = this.adapter.tableChars();
    const bqCols = this.blockquotePrefixColumns(ancestors);
    const tableMaxWidth = Math.max(1, this.ctx.width - bqCols);
    return this.applyQuotePrefix(
      layoutTable(tableRows, tableAligns, tableMaxWidth, chars, this.ansi),
      ancestors,
    );
  }

  visitBlockquote(node: DocNode, ancestors: DocNode[]): string {
    // Blockquote does NOT apply prefix itself; children use ancestor chain
    const newAncestors = [...ancestors, node];
    const lines = this.renderBlockChildren(node.children, newAncestors);
    return lines.join('\n');
  }

  visitHr(node: DocNode, ancestors: DocNode[]): string {
    const bqCols = this.blockquotePrefixColumns(ancestors);
    const hrWidth = Math.max(1, this.ctx.width - bqCols);
    return this.applyQuotePrefix(this.adapter.hrRule(hrWidth), ancestors);
  }

  visitText(node: DocNode, ancestors: DocNode[]): string {
    const content = node.content || '';
    return this.decorateLeafText(content, node.byteRange[0]!, node.findings, node.regions);
  }

  visitStrong(node: DocNode, ancestors: DocNode[]): string {
    const text = this.renderInlineChildren(node, ancestors);
    return this.ansi ? this.ansi.bold(text) : text;
  }

  visitEm(node: DocNode, ancestors: DocNode[]): string {
    const text = this.renderInlineChildren(node, ancestors);
    return this.ansi ? this.ansi.italic(text) : text;
  }

  visitCodeInline(node: DocNode, ancestors: DocNode[]): string {
    const code = node.content || '';
    return this.ansi ? this.ansi.code(code) : '`' + code + '`';
  }

  visitLink(node: DocNode, href: string, ancestors: DocNode[]): string {
    const text = this.renderInlineChildren(node, ancestors);
    return this.ansi ? this.ansi.link(text, href) : text + ' (' + href + ')';
  }

  visitImage(node: DocNode, src: string, alt: string): string {
    return `[${alt}](${src})`;
  }

  visitBreak(node: DocNode, hard: boolean): string {
    return hard ? '\n' : ' ';
  }

  // --- Core rendering methods ---

  /**
   * Render a list of block children with proper spacing.
   * Returns array of output lines.
   */
  private renderBlockChildren(children: DocNode[], ancestors: DocNode[]): string[] {
    const output: string[] = [];
    let isFirstBlock = true;

    for (const child of children) {
      const result = this.renderBlock(child, ancestors);
      if (result !== null) {
        if (!isFirstBlock) {
          output.push('');
        }
        output.push(result);
        isFirstBlock = false;
      }
    }
    return output;
  }

  /**
   * Render a single block node, returning null for unhandled types.
   */
  private renderBlock(node: DocNode, ancestors: DocNode[]): string | null {
    switch (node.type) {
      case 'heading':
        return this.visitHeading(node, (node.meta.level as number) || 1, ancestors);
      case 'paragraph':
        return this.applyQuotePrefix(this.visitParagraph(node, ancestors), ancestors);
      case 'fence':
      case 'code_block':
        return this.visitFence(node, ancestors);
      case 'bullet_list':
        return this.visitBulletList(node, ancestors);
      case 'ordered_list':
        return this.visitOrderedList(node, ancestors);
      case 'table':
        return this.visitTable(node, ancestors);
      case 'blockquote':
        return this.visitBlockquote(node, ancestors);
      case 'hr':
        return this.visitHr(node, ancestors);
      case 'html_block':
        return node.content ? this.applyQuotePrefix(node.content.trimEnd(), ancestors) : null;
      default:
        return null;
    }
  }

  /**
   * Render a list (bullet or ordered).
   *
   * Replicates the old renderer's behavior:
   * - First paragraph in list item is inline with marker
   * - Nested lists don't get extra spacing
   * - blockquoteDepth is tracked from the point BEFORE the list
   */
  private renderList(
    node: DocNode,
    ancestors: DocNode[],
    listType: 'ordered' | 'unordered',
    startCounter: number,
  ): string {
    const output: string[] = [];
    const listAncestors = [...ancestors, node];
    const depth = countTypes(ancestors, ['bullet_list', 'ordered_list']);
    let counter = startCounter;

    for (const child of node.children) {
      if (child.type !== 'list_item') continue;

      const indentStr = '  '.repeat(depth);
      let marker: string;
      if (listType === 'unordered') {
        marker = this.adapter.bulletChar(depth);
      } else {
        marker = this.adapter.orderedMarker(counter);
        counter++;
      }

      const markerLine = indentStr + marker + ' ';
      const itemIndent = indentStr.length + marker.length + 1;
      const itemAncestors = [...listAncestors, child];

      const itemLines = this.renderListItem(child, itemAncestors, markerLine, itemIndent);
      output.push(itemLines);
    }

    return output.join('\n');
  }

  /**
   * Render a list item's children.
   *
   * The old renderer handles blockquotes inside list items by:
   * 1. Emitting marker line (before blockquote_open)
   * 2. blockquote_open increments depth
   * 3. First paragraph content appends to marker line
   * 4. blockquote bar prefix only on continuation lines
   *
   * We replicate this by flattening the first blockquote if it's
   * the only wrapper before the first paragraph.
   */
  private renderListItem(
    node: DocNode,
    ancestors: DocNode[],
    markerLine: string,
    itemIndent: number,
  ): string {
    const output: string[] = [];
    let paragraphCount = 0;

    // Flatten the children: if a child is a blockquote, process its children
    // with increased quote depth (matching old renderer behavior where
    // blockquote_open/close happen between list_item_open and paragraph events)
    const flatChildren = this.flattenForListItem(node.children);

    for (const { child, bqDepth } of flatChildren) {
      if (child.type === 'paragraph') {
        paragraphCount++;

        // Compute the effective ancestors with the blockquote depth
        const effectiveAncestors = ancestors;
        const bqCols = this.blockquotePrefixColumns(ancestors, bqDepth);
        const availableWidth = Math.max(1, this.ctx.width - bqCols);
        const inlineText = this.renderInlineChildren(child, ancestors);
        const wrapped = wrapText(inlineText, availableWidth, itemIndent);

        if (paragraphCount === 1) {
          // First paragraph: inline with marker (matching old renderer behavior
          // where marker was emitted BEFORE blockquote_open, so first line
          // has NO blockquote prefix -- only continuation lines do)
          const lines = wrapped.split('\n');
          if (lines.length > 0) {
            // Marker line uses base ancestor quote prefix (no extra bq depth)
            output.push(this.applyQuotePrefix(markerLine + lines[0]!.trimStart(), ancestors));
            for (let l = 1; l < lines.length; l++) {
              output.push(this.applyQuotePrefixN(lines[l]!, ancestors, bqDepth));
            }
          }
        } else {
          output.push('');
          output.push(this.applyQuotePrefixN(wrapped, ancestors, bqDepth));
        }
      } else if (child.type === 'bullet_list' || child.type === 'ordered_list') {
        const nestedText = child.type === 'bullet_list'
          ? this.visitBulletList(child, ancestors)
          : this.visitOrderedList(child, ancestors);
        output.push(this.applyQuotePrefixN(nestedText, ancestors, bqDepth));
      } else {
        const rendered = this.renderBlock(child, ancestors);
        if (rendered !== null) output.push(rendered);
      }
    }

    return output.join('\n');
  }

  /**
   * Flatten blockquotes inside a list item to match old renderer behavior.
   * Returns children with their additional blockquote depth.
   */
  private flattenForListItem(
    children: DocNode[],
    bqDepth = 0,
  ): Array<{ child: DocNode; bqDepth: number }> {
    const result: Array<{ child: DocNode; bqDepth: number }> = [];
    for (const child of children) {
      if (child.type === 'blockquote') {
        // Flatten blockquote: process its children with increased depth
        result.push(...this.flattenForListItem(child.children, bqDepth + 1));
      } else {
        result.push({ child, bqDepth });
      }
    }
    return result;
  }

  /**
   * Render inline children of a node into a string.
   */
  private renderInlineChildren(node: DocNode, ancestors: DocNode[]): string {
    const parts: string[] = [];
    for (const child of node.children) {
      parts.push(this.renderInlineNode(child, ancestors));
    }
    return parts.join('');
  }

  /**
   * Render a single inline node.
   */
  private renderInlineNode(node: DocNode, ancestors: DocNode[]): string {
    switch (node.type) {
      case 'text': return this.visitText(node, ancestors);
      case 'strong': return this.visitStrong(node, ancestors);
      case 'em': return this.visitEm(node, ancestors);
      case 'strikethrough': {
        const text = this.renderInlineChildren(node, ancestors);
        return this.ansi ? this.ansi.strikethrough(text) : text;
      }
      case 'code_inline': return this.visitCodeInline(node, ancestors);
      case 'link': return this.visitLink(node, (node.meta.href as string) || '', ancestors);
      case 'image': {
        const src = (node.meta.src as string) || '';
        const alt = node.content || node.children?.map(c => c.content).join('') || 'image';
        return this.visitImage(node, src, alt);
      }
      case 'softbreak': return this.visitBreak(node, false);
      case 'hardbreak': return this.visitBreak(node, true);
      case 'html_inline': return node.content || '';
      default: return '';
    }
  }

  /**
   * Apply blockquote prefix bars based on ancestors.
   */
  private applyQuotePrefix(text: string, ancestors: DocNode[]): string {
    return this.applyQuotePrefixN(text, ancestors, 0);
  }

  /** Prefix applied before each line inside blockquotes (must match `applyQuotePrefixN`). */
  private blockquotePrefixString(ancestors: DocNode[], extraDepth: number): string {
    const depth = countType(ancestors, 'blockquote') + extraDepth;
    if (depth === 0) return '';

    const bars: string[] = [];
    for (let i = 0; i < depth; i++) {
      bars.push(this.ansi
        ? this.ansi.blockquoteBar(this.adapter.quoteBar())
        : this.adapter.quoteBar());
    }
    return bars.join(' ') + ' ';
  }

  /** Display width of the blockquote gutter that `applyQuotePrefix` will add. */
  private blockquotePrefixColumns(ancestors: DocNode[], extraDepth = 0): number {
    const p = this.blockquotePrefixString(ancestors, extraDepth);
    return p ? displayWidth(p) : 0;
  }

  /**
   * Apply blockquote prefix with additional depth beyond what's in ancestors.
   */
  private applyQuotePrefixN(text: string, ancestors: DocNode[], extraDepth: number): string {
    const prefix = this.blockquotePrefixString(ancestors, extraDepth);
    if (!prefix) return text;
    return text.split('\n').map(line => prefix + line).join('\n');
  }

  /**
   * First UTF-16 index of inner fence body in the parsed markdown source.
   * Scans the opening fence line (3+ backticks or tildes, optional info, then newline).
   */
  private getFenceContentOffset(node: DocNode): number {
    const src = this.ctx.parsedSource;
    if (src === undefined) {
      throw new Error(
        'TerminalVisitor requires RenderContext.parsedSource (post-template markdown) for fence byte alignment',
      );
    }
    const nodeStart = node.byteRange[0]!;
    const nodeEnd = Math.min(node.byteRange[1]!, src.length);
    if (nodeStart < 0 || nodeStart >= src.length) return nodeStart;
    const head = src.slice(nodeStart, nodeEnd);
    const nl = head.indexOf('\n');
    if (nl === -1) {
      return nodeStart + head.length;
    }
    return nodeStart + nl + 1;
  }

  /**
   * Unicode findings + template region decoration on a single leaf string.
   * Findings take precedence over template styling on overlapping code units.
   */
  private decorateLeafText(
    content: string,
    nodeDocOffset: number,
    findings: Finding[],
    regions: RegionMap[],
  ): string {
    const templates = regions.filter((r) => r.type === 'T');
    if (!this.ctx.ansiEnabled || templates.length === 0) {
      return this.applyFindingsToContent(content, findings, nodeDocOffset);
    }
    return this.paintTemplateAndFindings(content, nodeDocOffset, findings, templates);
  }

  private paintTemplateAndFindings(
    content: string,
    nodeDocOffset: number,
    findings: Finding[],
    templates: RegionMap[],
  ): string {
    const n = content.length;
    const chalk = new Chalk({ level: 3 });
    const unic = (this.ctx.theme as { unic?: Record<string, { fg: string; bg?: string; bold?: boolean; underline?: boolean }> })
      ?.unic;

    const templateSegs = clipTemplateSegments(templates, findings, nodeDocOffset, n);
    type Ev =
      | { k: 'tm'; lo: number; hi: number; resolved: boolean }
      | { k: 'f'; lo: number; hi: number; f: Finding };
    const events: Ev[] = [];
    for (const s of templateSegs) {
      events.push({ k: 'tm', lo: s.lo, hi: s.hi, resolved: s.resolved });
    }
    for (const f of findings) {
      const lo = f.offset - nodeDocOffset;
      const hi = lo + f.length;
      if (hi <= 0 || lo >= n) continue;
      events.push({ k: 'f', lo: Math.max(0, lo), hi: Math.min(n, hi), f });
    }
    events.sort((a, b) => a.lo - b.lo || (a.k === 'f' ? -1 : 1) - (b.k === 'f' ? -1 : 1) || a.hi - b.hi);

    let pos = 0;
    let out = '';
    for (const ev of events) {
      if (pos < ev.lo) {
        out += content.slice(pos, ev.lo);
      }
      if (ev.k === 'f') {
        const f = ev.f;
        const local = f.offset - nodeDocOffset;
        if (local >= 0 && local < content.length) {
          let glyph = f.glyph;
          if (unic) {
            const style = unic[f.category]!;
            if (style?.fg) {
              let g = chalk.hex(style.fg);
              if (style.bg) g = g.bgHex(style.bg);
              if (style.bold) g = g.bold;
              if (style.underline) g = g.underline;
              glyph = g(glyph);
            }
          }
          out += glyph;
        }
        pos = Math.max(pos, local + f.length);
      } else {
        const slice = content.slice(ev.lo, ev.hi);
        const key = ev.resolved ? 'template-region' : 'template-unresolved';
        const st = unic?.[key]!;
        if (st?.fg) {
          let p = chalk.hex(st.fg);
          if (st.bg) p = p.bgHex(st.bg);
          if (st.bold) p = p.bold;
          if (st.underline) p = p.underline;
          out += p(slice);
        } else {
          out += slice;
        }
        pos = ev.hi;
      }
    }
    if (pos < n) {
      out += content.slice(pos);
    }
    return out;
  }

  /**
   * Apply finding glyph substitutions to text content.
   */
  private applyFindingsToContent(content: string, findings: Finding[], nodeOffset: number): string {
    if (!findings || findings.length === 0) return content;

    const sorted = [...findings].sort((a, b) => b.offset - a.offset);
    let result = content;
    const chalk = this.ctx.ansiEnabled ? new Chalk({ level: 3 }) : null;
    const theme = (this.ctx.theme as any)?.unic as Record<string, { fg: string; bg?: string; bold?: boolean; underline?: boolean }> | undefined;

    for (const finding of sorted) {
      // Convert document-level offset to node-relative offset
      const localOffset = finding.offset - nodeOffset;
      if (localOffset < 0 || localOffset >= result.length) continue;

      let glyph = finding.glyph;

      if (chalk && theme) {
        const style = theme[finding.category]!;
        if (style) {
          let styled = chalk.hex(style.fg);
          if (style.bg) styled = styled.bgHex(style.bg);
          if (style.bold) styled = styled.bold;
          if (style.underline) styled = styled.underline;
          glyph = styled(glyph);
        }
      }

      result =
        result.slice(0, localOffset) +
        glyph +
        result.slice(localOffset + finding.length);
    }

    return result;
  }

}

/** Clip template spans against finding spans (findings win). */
function clipTemplateSegments(
  templates: RegionMap[],
  findings: Finding[],
  nodeOffset: number,
  contentLen: number,
): Array<{ lo: number; hi: number; resolved: boolean }> {
  type Seg = { lo: number; hi: number; resolved: boolean };
  const subtract = (seg: Seg, cutLo: number, cutHi: number): Seg[] => {
    if (cutHi <= seg.lo || cutLo >= seg.hi) return [seg];
    const out: Seg[] = [];
    if (seg.lo < cutLo) out.push({ lo: seg.lo, hi: Math.min(seg.hi, cutLo), resolved: seg.resolved });
    if (seg.hi > cutHi) out.push({ lo: Math.max(seg.lo, cutHi), hi: seg.hi, resolved: seg.resolved });
    return out;
  };

  const out: Seg[] = [];
  for (const r of templates) {
    let segs: Seg[] = [
      {
        lo: Math.max(0, r.expandedByteRange[0]! - nodeOffset),
        hi: Math.min(contentLen, r.expandedByteRange[1]! - nodeOffset),
        resolved: r.templateResolved !== false,
      },
    ];
    for (const f of findings) {
      const fl = f.offset - nodeOffset;
      const fh = fl + f.length;
      if (fh <= 0 || fl >= contentLen) continue;
      const cl = Math.max(0, fl);
      const ch = Math.min(contentLen, fh);
      segs = segs.flatMap((s) => subtract(s, cl, ch));
    }
    out.push(...segs.filter((s) => s.lo < s.hi));
  }
  return out;
}

/** Count ancestors of a specific type */
function countType(ancestors: DocNode[], type: string): number {
  return ancestors.filter(a => a.type === type).length;
}

/** Count ancestors matching any of the given types */
function countTypes(ancestors: DocNode[], types: string[]): number {
  return ancestors.filter(a => types.includes(a.type)).length;
}
