/**
 * Pipeline Types - Foundation contracts for the unified render pipeline.
 *
 * Defines the canonical DocTree structure, visitor interface, and supporting
 * types. All subsequent pipeline stages build on these contracts.
 */

// Re-export Finding for convenience (consumers import from pipeline/types)
export type { Finding } from '../unicode/types.js';

/**
 * All 24 locked node types for the DocTree.
 * document + 13 block types + 10 inline types = 24
 */
export type NodeType =
  | 'document'
  | 'heading'
  | 'paragraph'
  | 'fence'
  | 'code_block'
  | 'bullet_list'
  | 'ordered_list'
  | 'list_item'
  | 'table'
  | 'table_row'
  | 'table_cell'
  | 'blockquote'
  | 'hr'
  | 'html_block'
  | 'text'
  | 'strong'
  | 'em'
  | 'strikethrough'
  | 'code_inline'
  | 'link'
  | 'image'
  | 'softbreak'
  | 'hardbreak'
  | 'html_inline';

/** UTF-16 code unit index range: [start, end) */
export type ByteRange = [number, number];

/** Region type: T=template, U=unicode, H=HTML escape, A=ANSI escape */
export type RegionType = 'T' | 'U' | 'H' | 'A';

/** Tracks a region marker's position and content in both original and expanded source */
export interface RegionMap {
  /** Unique region identifier */
  id: number;
  /** Region type */
  type: RegionType;
  /** Byte range in original source (before template expansion) */
  originalByteRange: ByteRange;
  /** Byte range in expanded source (after template expansion) */
  expandedByteRange: ByteRange;
  /** Original source content (e.g., "{{var}}") */
  originalContent: string;
  /** Expanded content (e.g., "hello world") */
  expandedContent: string;
  /**
   * When type === 'T': true if a value was substituted; false if literal {{...}} was kept.
   * Used by unic theme keys `template-region` vs `template-unresolved`.
   */
  templateResolved?: boolean;
}

/** Canonical tree node for the unified render pipeline */
export interface DocNode {
  /** Node type from the locked NodeType union */
  type: NodeType;
  /** UTF-16 code unit range in the region-marked source */
  byteRange: ByteRange;
  /** Child nodes (empty array for leaf nodes) */
  children: DocNode[];
  /** Leaf text content (after marker stripping). Optional for container nodes. */
  content?: string;
  /** Stage outputs: highlightTokens, mermaidText, mermaidSvg, hidden, level, etc. */
  meta: Record<string, unknown>;
  /** Unicode/HTML/ANSI findings overlapping this node's byte range */
  findings: import('../unicode/types.js').Finding[];
  /** Template regions overlapping this node's byte range */
  regions: RegionMap[];
}

/**
 * Visitor interface for multi-format rendering.
 * Each method receives the node and structural context (ancestor chain).
 * Three implementations: TerminalVisitor, HtmlVisitor, EditorVisitor.
 */
export interface RenderVisitor {
  visitDocument(node: DocNode): string;
  visitHeading(node: DocNode, level: number, ancestors: DocNode[]): string;
  visitParagraph(node: DocNode, ancestors: DocNode[]): string;
  visitFence(node: DocNode, ancestors: DocNode[]): string;
  visitBulletList(node: DocNode, ancestors: DocNode[]): string;
  visitOrderedList(node: DocNode, ancestors: DocNode[]): string;
  visitListItem(node: DocNode, index: number, ancestors: DocNode[]): string;
  visitTable(node: DocNode, ancestors: DocNode[]): string;
  visitBlockquote(node: DocNode, ancestors: DocNode[]): string;
  visitHr(node: DocNode, ancestors: DocNode[]): string;
  visitText(node: DocNode, ancestors: DocNode[]): string;
  visitStrong(node: DocNode, ancestors: DocNode[]): string;
  visitEm(node: DocNode, ancestors: DocNode[]): string;
  visitCodeInline(node: DocNode, ancestors: DocNode[]): string;
  visitLink(node: DocNode, href: string, ancestors: DocNode[]): string;
  visitImage(node: DocNode, src: string, alt: string): string;
  visitBreak(node: DocNode, hard: boolean): string;
}
