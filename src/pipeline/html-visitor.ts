/**
 * HtmlVisitor - Renders DocTree to HTML for browser preview.
 *
 * Replaces the md.render() path in preview.ts. Both terminal and browser
 * outputs now render from the same DocTree, ensuring parity.
 *
 * Security model: HTML escaping happens in the visitor, not by string
 * mutation before parse. Every text output escapes <, >, &, ".
 */

import type { DocNode, RenderVisitor, RegionMap } from './types.js';
import type { Finding } from '../unicode/types.js';

/** Escape HTML special characters */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * HtmlVisitor renders a DocTree into an HTML string suitable for
 * browser preview injection. Implements the RenderVisitor interface.
 */
export class HtmlVisitor implements RenderVisitor {
  /** Entry point: render a full document tree to HTML. */
  render(tree: DocNode): string {
    return this.visitDocument(tree);
  }

  visitDocument(node: DocNode): string {
    return this.renderChildren(node, []);
  }

  visitHeading(node: DocNode, level: number, ancestors: DocNode[]): string {
    const children = this.renderChildren(node, [...ancestors, node]);
    return `<h${level}>${children}</h${level}>`;
  }

  visitParagraph(node: DocNode, ancestors: DocNode[]): string {
    // Hidden paragraphs (tight lists) render children without wrapper
    if (node.meta.hidden) {
      return this.renderChildren(node, [...ancestors, node]);
    }
    const children = this.renderChildren(node, [...ancestors, node]);
    return `<p>${children}</p>`;
  }

  visitFence(node: DocNode, ancestors: DocNode[]): string {
    // Mermaid: render SVG
    if (node.meta.mermaidSvg) {
      return `<div class="mermaid-diagram">${node.meta.mermaidSvg}</div>`;
    }

    // Shiki highlight tokens: render styled spans
    if (node.meta.highlightTokens) {
      return this.renderShikiTokens(
        node.meta.highlightTokens as ShikiLine[],
        (node.meta.info as string) || '',
      );
    }

    // Plain fence: escaped content in <pre><code>
    const lang = (node.meta.info as string) || '';
    const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : '';
    const escaped = escapeHtml(node.content || '');
    return `<pre><code${langAttr}>${escaped}</code></pre>`;
  }

  visitBulletList(node: DocNode, ancestors: DocNode[]): string {
    const children = this.renderChildren(node, [...ancestors, node]);
    return `<ul>${children}</ul>`;
  }

  visitOrderedList(node: DocNode, ancestors: DocNode[]): string {
    const children = this.renderChildren(node, [...ancestors, node]);
    return `<ol>${children}</ol>`;
  }

  visitListItem(node: DocNode, _index: number, ancestors: DocNode[]): string {
    const children = this.renderChildren(node, [...ancestors, node]);
    return `<li>${children}</li>`;
  }

  visitTable(node: DocNode, ancestors: DocNode[]): string {
    const newAncestors = [...ancestors, node];

    // Separate header rows from body rows based on meta.head
    const headerRows: DocNode[] = [];
    const bodyRows: DocNode[] = [];
    for (const child of node.children) {
      if (child.type === 'table_row' && child.meta.head) {
        headerRows.push(child);
      } else {
        bodyRows.push(child);
      }
    }

    let html = '<table>';

    if (headerRows.length > 0) {
      html += '<thead>';
      for (const row of headerRows) {
        html += this.renderTableRow(row, newAncestors, true);
      }
      html += '</thead>';
    }

    if (bodyRows.length > 0) {
      html += '<tbody>';
      for (const row of bodyRows) {
        html += this.renderTableRow(row, newAncestors, false);
      }
      html += '</tbody>';
    }

    html += '</table>';
    return html;
  }

  visitBlockquote(node: DocNode, ancestors: DocNode[]): string {
    const children = this.renderChildren(node, [...ancestors, node]);
    return `<blockquote>${children}</blockquote>`;
  }

  visitHr(_node: DocNode, _ancestors: DocNode[]): string {
    return '<hr>';
  }

  visitText(node: DocNode, _ancestors: DocNode[]): string {
    const content = node.content || '';

    // Filter template regions (type 'T' only)
    const templateRegions = node.regions.filter(r => r.type === 'T');

    // If there are findings AND template regions, render both
    if (node.findings.length > 0 && templateRegions.length > 0) {
      // First apply findings, then wrap regions around the result
      const withFindings = this.renderTextWithFindings(content, node.findings, node.byteRange[0]!);
      return this.wrapTemplateRegions(withFindings, content, templateRegions, node.byteRange);
    }

    // If there are findings only, interleave styled spans
    if (node.findings.length > 0) {
      return this.renderTextWithFindings(content, node.findings, node.byteRange[0]!);
    }

    // If there are template regions only, wrap in region spans
    if (templateRegions.length > 0) {
      return this.renderTextWithRegions(content, templateRegions, node.byteRange);
    }

    return escapeHtml(content);
  }

  visitStrong(node: DocNode, ancestors: DocNode[]): string {
    const children = this.renderChildren(node, [...ancestors, node]);
    return `<strong>${children}</strong>`;
  }

  visitEm(node: DocNode, ancestors: DocNode[]): string {
    const children = this.renderChildren(node, [...ancestors, node]);
    return `<em>${children}</em>`;
  }

  visitCodeInline(node: DocNode, _ancestors: DocNode[]): string {
    return `<code>${escapeHtml(node.content || '')}</code>`;
  }

  visitLink(node: DocNode, href: string, ancestors: DocNode[]): string {
    const children = this.renderChildren(node, [...ancestors, node]);
    return `<a href="${escapeHtml(href)}">${children}</a>`;
  }

  visitImage(_node: DocNode, src: string, alt: string): string {
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">`;
  }

  visitBreak(_node: DocNode, hard: boolean): string {
    return hard ? '<br>' : '\n';
  }

  // ---- Internal methods ----

  /** Render all children of a node, dispatching to the correct visitor method. */
  renderChildren(node: DocNode, ancestors: DocNode[]): string {
    let result = '';
    for (let i = 0; i < node.children.length; i++) {
      result += this.dispatchNode(node.children[i]!, i, ancestors);
    }
    return result;
  }

  /** Dispatch a single node to the appropriate visitor method. */
  private dispatchNode(node: DocNode, index: number, ancestors: DocNode[]): string {
    switch (node.type) {
      case 'document':
        return this.visitDocument(node);
      case 'heading':
        return this.visitHeading(node, (node.meta.level as number) || 1, ancestors);
      case 'paragraph':
        return this.visitParagraph(node, ancestors);
      case 'fence':
      case 'code_block':
        return this.visitFence(node, ancestors);
      case 'bullet_list':
        return this.visitBulletList(node, ancestors);
      case 'ordered_list':
        return this.visitOrderedList(node, ancestors);
      case 'list_item':
        return this.visitListItem(node, index, ancestors);
      case 'table':
        return this.visitTable(node, ancestors);
      case 'blockquote':
        return this.visitBlockquote(node, ancestors);
      case 'hr':
        return this.visitHr(node, ancestors);
      case 'text':
        return this.visitText(node, ancestors);
      case 'strong':
        return this.visitStrong(node, ancestors);
      case 'em':
        return this.visitEm(node, ancestors);
      case 'strikethrough':
        return this.renderStrikethrough(node, ancestors);
      case 'code_inline':
        return this.visitCodeInline(node, ancestors);
      case 'link':
        return this.visitLink(node, (node.meta.href as string) || '', ancestors);
      case 'image':
        return this.visitImage(node, (node.meta.src as string) || '', (node.meta.alt as string) || '');
      case 'hardbreak':
        return this.visitBreak(node, true);
      case 'softbreak':
        return this.visitBreak(node, false);
      case 'html_block':
      case 'html_inline':
        // Escape raw HTML blocks/inlines for security
        return escapeHtml(node.content || '');
      case 'table_row':
      case 'table_cell':
        // Table rows/cells handled by visitTable directly
        return '';
      default:
        return escapeHtml(node.content || '');
    }
  }

  /** Render a table row with head/body context. */
  private renderTableRow(row: DocNode, ancestors: DocNode[], isHead: boolean): string {
    let html = '<tr>';
    for (const cell of row.children) {
      if (cell.type === 'table_cell') {
        html += this.renderTableCell(cell, [...ancestors, row], isHead);
      }
    }
    html += '</tr>';
    return html;
  }

  /** Render a table cell as <th> or <td> with alignment. */
  private renderTableCell(cell: DocNode, ancestors: DocNode[], isHead: boolean): string {
    const tag = isHead || cell.meta.head ? 'th' : 'td';
    const align = cell.meta.align as string | undefined;
    const alignAttr = align ? ` align="${escapeHtml(align)}"` : '';
    const children = this.renderChildren(cell, [...ancestors, cell]);
    return `<${tag}${alignAttr}>${children}</${tag}>`;
  }

  /** Render strikethrough content. */
  private renderStrikethrough(node: DocNode, ancestors: DocNode[]): string {
    const children = this.renderChildren(node, [...ancestors, node]);
    return `<s>${children}</s>`;
  }

  /** Render Shiki highlight tokens as styled HTML. */
  private renderShikiTokens(lines: ShikiLine[], lang: string): string {
    const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : '';
    let html = `<pre><code${langAttr}>`;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      for (const token of line) {
        if (token.color) {
          html += `<span style="color:${token.color}">${escapeHtml(token.content)}</span>`;
        } else {
          html += escapeHtml(token.content);
        }
      }
      if (i < lines.length - 1) {
        html += '\n';
      }
    }

    html += '</code></pre>';
    return html;
  }

  /**
   * Render text content with finding spans interleaved.
   * Absorbs logic from applyFindingsHtml() in src/unicode/apply.ts.
   *
   * Findings are processed in reverse offset order to preserve positions.
   * All categories (unicode, ANSI escape, HTML tag, etc.) use the same
   * span wrapping with class="bmd-unic bmd-unic-{category}".
   */
  private renderTextWithFindings(content: string, findings: Finding[], nodeOffset: number): string {
    // Sort findings by offset descending for reverse splicing
    const sorted = [...findings].sort((a, b) => b.offset - a.offset);

    let result = content;

    for (const finding of sorted) {
      // Convert document-level offset to node-relative offset
      const localOffset = finding.offset - nodeOffset;
      if (localOffset < 0 || localOffset >= result.length) continue;

      // Build class list
      const classes = finding.isAtomic
        ? `bmd-unic bmd-unic-${finding.category} bmd-unic-atomic`
        : `bmd-unic bmd-unic-${finding.category}`;

      // Escape tooltip and glyph
      const escapedTooltip = finding.tooltip.replace(/"/g, '&quot;');
      const escapedGlyph = escapeHtml(finding.glyph);

      const span = `<span class="${classes}" title="${escapedTooltip}">${escapedGlyph}</span>`;

      // Splice: replace the finding's range with the styled span
      // The surrounding text gets escaped later
      const before = result.slice(0, localOffset);
      const after = result.slice(localOffset + finding.length);
      result = before + span + after;
    }

    // Now escape the non-finding parts.
    // Since spans were inserted in reverse, the result contains a mix of
    // raw text (needs escaping) and HTML spans (must not be double-escaped).
    // We need to escape only the text segments between spans.
    return this.escapeTextSegments(result);
  }

  /**
   * Escape HTML in text segments while preserving already-inserted <span> tags.
   * Splits on our known span pattern and escapes only the gaps.
   */
  private escapeTextSegments(mixed: string): string {
    // Match our known span pattern
    const spanPattern = /<span class="bmd-unic[^"]*" title="[^"]*">[^<]*<\/span>/g;

    let result = '';
    let lastIndex = 0;

    for (const match of mixed.matchAll(spanPattern)) {
      // Escape the text before this span
      const textBefore = mixed.slice(lastIndex, match.index!);
      result += escapeHtml(textBefore);
      // Append the span as-is
      result += match[0]!;
      lastIndex = match.index! + match[0]!.length;
    }

    // Escape remaining text after last span
    result += escapeHtml(mixed.slice(lastIndex));

    return result;
  }
  /**
   * Render text with template region spans (no findings).
   * Template regions with type 'T' are wrapped in styled spans.
   */
  private renderTextWithRegions(
    content: string,
    regions: RegionMap[],
    nodeByteRange: [number, number],
  ): string {
    // Sort regions by expanded start position ascending
    const sorted = [...regions].sort(
      (a, b) => a.expandedByteRange[0]! - b.expandedByteRange[0]!,
    );

    let result = '';
    let cursor = 0;

    for (const region of sorted) {
      // Calculate region position relative to this text node
      const regionStart = region.expandedByteRange[0]! - nodeByteRange[0]!;
      const regionEnd = region.expandedByteRange[1]! - nodeByteRange[0]!;

      // Clamp to content bounds
      const start = Math.max(0, regionStart);
      const end = Math.min(content.length, regionEnd);

      if (start > cursor) {
        result += escapeHtml(content.slice(cursor, start));
      }

      if (start < end) {
        const regionText = escapeHtml(content.slice(start, end));
        const escapedExpr = escapeHtml(region.originalContent);
        result += `<span class="bmd-region bmd-region-template" data-region-id="${region.id}" title="${escapedExpr}">${regionText}</span>`;
      }

      cursor = end;
    }

    // Remaining text after last region
    if (cursor < content.length) {
      result += escapeHtml(content.slice(cursor));
    }

    return result;
  }

  /**
   * Wrap template regions around already-rendered content (which may contain finding spans).
   * This is used when both findings and template regions exist on the same text node.
   *
   * Since finding spans are already inserted into the HTML, we wrap the entire rendered
   * content that falls within a region's range. For simplicity, we wrap the full content
   * in the region span when regions cover it -- the visual effect is the same.
   */
  private wrapTemplateRegions(
    renderedHtml: string,
    _originalContent: string,
    regions: RegionMap[],
    _nodeByteRange: [number, number],
  ): string {
    // When both findings and regions exist, wrap the entire rendered content
    // in region spans. Multiple regions each get their own wrapper.
    let result = renderedHtml;
    for (const region of regions) {
      const escapedExpr = escapeHtml(region.originalContent);
      result = `<span class="bmd-region bmd-region-template" data-region-id="${region.id}" title="${escapedExpr}">${result}</span>`;
    }
    return result;
  }
}

/** Shiki token structure for highlight rendering */
type ShikiToken = { content: string; color?: string };
type ShikiLine = ShikiToken[];
