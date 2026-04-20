/**
 * Tree Build Stage (S4) - Token[] to DocTree construction.
 *
 * Converts flat markdown-it Token[] into a canonical DocNode tree
 * using stack-based construction. Attaches findings and regions
 * to the deepest containing node.
 */

import type { DocNode, NodeType, ByteRange, RegionMap } from './types.js';
import type { Finding } from '../unicode/types.js';

/** Minimal Token shape matching markdown-it */
interface Token {
  type: string;
  nesting: 1 | 0 | -1;
  content: string;
  markup: string;
  tag: string;
  map: [number, number] | null;
  meta: any;
  children: Token[] | null;
  hidden: boolean;
  attrs: [string, string][] | null;
  info: string;
}

/**
 * Build a DocTree from flat Token[].
 *
 * @param tokens - markdown-it token array (with byteRange annotations in meta)
 * @param regionMaps - template region mappings
 * @param findings - detection findings to attach
 * @returns Root DocNode with type 'document'
 */
export function buildTree(
  tokens: Token[],
  regionMaps: RegionMap[],
  findings: Finding[],
): DocNode {
  const root = createNode('document', [0, 0]);
  const stack: DocNode[] = [root];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const parent = stack[stack.length - 1]!;

    // Skip transparent wrapper tokens (thead, tbody)
    if (isTransparentWrapper(token.type)) {
      continue;
    }

    if (token.nesting === 1) {
      // Opening token: push new node
      const nodeType = tokenTypeToNodeType(token.type);
      const byteRange = extractByteRange(token);
      const node = createNode(nodeType, byteRange);

      // Copy metadata
      if (token.hidden) node.meta.hidden = true;
      copyTokenMeta(token, node);

      parent.children.push(node);
      stack.push(node);
    } else if (token.nesting === -1) {
      // Closing token: pop stack
      if (stack.length > 1) {
        stack.pop();
      }
    } else {
      // nesting === 0: leaf token or inline
      if (token.type === 'inline') {
        // Expand inline children into parent
        if (token.children && token.children.length > 0) {
          expandInlineChildren(token.children, parent);
        }
      } else {
        // Leaf tokens: fence, hr, code_block, html_block, etc.
        const nodeType = tokenTypeToNodeType(token.type);
        const byteRange = extractByteRange(token);
        const node = createNode(nodeType, byteRange);
        node.content = token.content || undefined;

        copyTokenMeta(token, node);
        if (token.info) node.meta.info = token.info;

        parent.children.push(node);
      }
    }
  }

  // Fix up byte ranges: derive from children for nodes with [0,0] range
  // (table cells, and the root document node)
  fixupByteRanges(root);

  // Attach findings and regions
  attachFindingsAndRegions(root, findings, regionMaps);

  return root;
}

/**
 * Expand inline token children into DocNode children on the parent.
 * Handles text, strong, em, code_inline, link, image, softbreak, hardbreak, etc.
 */
function expandInlineChildren(children: Token[], parent: DocNode): void {
  const stack: DocNode[] = [parent];

  for (const child of children) {
    const current = stack[stack.length - 1]!;

    if (child.nesting === 1) {
      // Opening inline: strong_open, em_open, link_open, etc.
      const nodeType = tokenTypeToNodeType(child.type);
      const byteRange = extractByteRange(child);
      const node = createNode(nodeType, byteRange);
      copyTokenMeta(child, node);
      current.children.push(node);
      stack.push(node);
    } else if (child.nesting === -1) {
      // Closing inline
      if (stack.length > 1) {
        // Fix up the parent byte range to encompass the closing markup
        const closing = stack.pop()!;
        const closingRange = extractByteRange(child);
        if (closingRange[1]! > closing.byteRange[1]!) {
          closing.byteRange[1] = closingRange[1]!;
        }
      }
    } else {
      // Leaf inline: text, code_inline, softbreak, hardbreak, html_inline, image
      const nodeType = tokenTypeToNodeType(child.type);
      const byteRange = extractByteRange(child);
      const node = createNode(nodeType, byteRange);
      node.content = child.content || undefined;
      copyTokenMeta(child, node);
      current.children.push(node);
    }
  }
}

/**
 * Attach findings and regions to the deepest node whose byteRange
 * fully contains them.
 */
export function attachFindingsAndRegions(
  root: DocNode,
  findings: Finding[],
  regions: RegionMap[],
): void {
  for (const finding of findings) {
    const fStart = finding.offset;
    const fEnd = finding.offset + finding.length;
    const target = findDeepestContaining(root, fStart, fEnd);
    if (target) {
      target.findings.push(finding);
    }
  }

  for (const region of regions) {
    const [rStart, rEnd] = region.expandedByteRange;
    const target = findDeepestContaining(root, rStart, rEnd);
    if (target) {
      target.regions.push(region);
    }
  }
}

/**
 * Find the deepest node whose byteRange fully contains [start, end).
 * If no single child contains the range, the current node is the
 * nearest common ancestor.
 */
function findDeepestContaining(
  node: DocNode,
  start: number,
  end: number,
): DocNode | null {
  const [nStart, nEnd] = node.byteRange;

  // Node must fully contain the range
  if (start < nStart || end > nEnd) {
    return null;
  }

  // Try to find a child that fully contains the range
  for (const child of node.children) {
    const result = findDeepestContaining(child, start, end);
    if (result) {
      return result;
    }
  }

  // No child fully contains it -- this node is the deepest container
  return node;
}

/**
 * Post-order traversal to fix up byte ranges for nodes that have [0,0]
 * (e.g., table cells where the parser provides no map field).
 * Derives range from children: min(child starts) to max(child ends).
 * Also fixes the document root range.
 */
function fixupByteRanges(node: DocNode): void {
  // Recurse into children first (post-order)
  for (const child of node.children) {
    fixupByteRanges(child);
  }

  // If this node has [0,0] and has children with real ranges, derive from children
  if (node.byteRange[0]! === 0 && node.byteRange[1]! === 0 && node.children.length > 0) {
    let minStart = Infinity;
    let maxEnd = 0;
    for (const child of node.children) {
      if (child.byteRange[0]! !== 0 || child.byteRange[1]! !== 0) {
        if (child.byteRange[0]! < minStart) minStart = child.byteRange[0]!;
        if (child.byteRange[1]! > maxEnd) maxEnd = child.byteRange[1]!;
      }
    }
    if (minStart !== Infinity) {
      node.byteRange = [minStart, maxEnd];
    }
  }
}

/** Create a new empty DocNode */
function createNode(type: NodeType, byteRange: ByteRange): DocNode {
  return {
    type,
    byteRange: [...byteRange] as ByteRange,
    children: [],
    meta: {},
    findings: [],
    regions: [],
  };
}

/** Extract byteRange from token meta, defaulting to [0,0] */
function extractByteRange(token: Token): ByteRange {
  if (token.meta?.byteRange) {
    return token.meta.byteRange as ByteRange;
  }
  return [0, 0];
}

/** Copy relevant token attributes to node meta */
function copyTokenMeta(token: Token, node: DocNode): void {
  // Heading level from tag (h1 -> 1, h2 -> 2, etc.)
  if (token.tag && /^h[1-6]$/.test(token.tag)) {
    node.meta.level = parseInt(token.tag.charAt(1), 10);
  }

  // Link href, title from attrs
  if (token.attrs) {
    for (const [key, value] of token.attrs) {
      if (key === 'href') node.meta.href = value;
      if (key === 'src') node.meta.src = value;
      if (key === 'alt') node.meta.alt = value;
      if (key === 'title') node.meta.title = value;
      if (key === 'style') node.meta.style = value;
    }
  }

  // Table cell alignment and header flag
  if (token.type === 'th_open' || token.type === 'td_open') {
    if (token.type === 'th_open') node.meta.isHeader = true;
    if (token.attrs) {
      for (const [key, value] of token.attrs) {
        if (key === 'style' && value.includes('text-align')) {
          const match = value.match(/text-align:\s*(\w+)/);
          if (match) node.meta.align = match[1]!;
        }
      }
    }
  }

  // Ordered list start attribute
  if (token.type === 'ordered_list_open' && token.attrs) {
    for (const [key, value] of token.attrs) {
      if (key === 'start') node.meta.start = parseInt(value, 10) || 1;
    }
  }

  // Fence/code_block meta: highlightTokens, mermaid flags, etc.
  if ((token.type === 'fence' || token.type === 'code_block') && token.meta) {
    if (token.meta.highlightTokens) node.meta.highlightTokens = token.meta.highlightTokens;
    if (token.meta.isMermaid !== undefined) node.meta.isMermaid = token.meta.isMermaid;
    if (token.meta.mermaidRendered !== undefined) node.meta.mermaidRendered = token.meta.mermaidRendered;
    if (token.meta.mermaidUnsupported !== undefined) node.meta.mermaidUnsupported = token.meta.mermaidUnsupported;
    if (token.meta.originalContent !== undefined) node.meta.originalContent = token.meta.originalContent;
  }
}

/** Transparent wrapper tokens that don't create tree nodes */
const TRANSPARENT_WRAPPERS = new Set([
  'thead_open', 'thead_close',
  'tbody_open', 'tbody_close',
]);

function isTransparentWrapper(tokenType: string): boolean {
  return TRANSPARENT_WRAPPERS.has(tokenType);
}

/**
 * Map markdown-it token type to locked NodeType.
 * Strips _open/_close suffixes, maps structural tokens.
 */
function tokenTypeToNodeType(tokenType: string): NodeType {
  // Strip _open / _close
  const base = tokenType.replace(/_(open|close)$/, '');

  // Direct mappings for special cases
  const map: Record<string, NodeType> = {
    heading: 'heading',
    paragraph: 'paragraph',
    fence: 'fence',
    code_block: 'code_block',
    bullet_list: 'bullet_list',
    ordered_list: 'ordered_list',
    list_item: 'list_item',
    table: 'table',
    blockquote: 'blockquote',
    hr: 'hr',
    html_block: 'html_block',
    text: 'text',
    strong: 'strong',
    em: 'em',
    s: 'strikethrough',
    code_inline: 'code_inline',
    link: 'link',
    image: 'image',
    softbreak: 'softbreak',
    hardbreak: 'hardbreak',
    html_inline: 'html_inline',
    // Table structural tokens map to table_row / table_cell
    tr: 'table_row',
    th: 'table_cell',
    td: 'table_cell',
    // thead/tbody are transparent -- skipped during tree build
  };

  return map[base]! || (base as NodeType);
}
