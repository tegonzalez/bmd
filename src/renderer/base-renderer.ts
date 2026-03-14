import type { Token } from '../parser/index.ts';
import type { FormatAdapter, RenderContext, RenderState, ListContext } from './types.ts';
import type { AnsiLayer } from './ansi-layer.ts';
import type { TableRow, TableAlign } from './table.ts';
import { layoutTable } from './table.ts';
import { wrapText } from './wrap.ts';
import type { HighlightToken } from '../types/highlight.ts';

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
 *
 * - ansi: Full truecolor per-token coloring with fontStyle bold/italic/underline
 * - utf8: Only bold/italic from fontStyle (no color escapes)
 * - ascii: Plain text concatenation (no escapes)
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
        // Only bold/italic from fontStyle -- no color
        let styled = token.content;
        if (token.fontStyle & 1) styled = `\x1b[3m${styled}\x1b[23m`;  // italic
        if (token.fontStyle & 2) styled = `\x1b[1m${styled}\x1b[22m`;  // bold
        return styled;
      }

      // ansi mode: full truecolor
      let color = token.color || '#e1e4e8';
      if (color.length === 9) color = color.slice(0, 7);
      const { r, g, b } = parseHex(color);
      let styled = `\x1b[38;2;${r};${g};${b}m${token.content}\x1b[39m`;
      if (token.fontStyle & 4) styled = `\x1b[4m${styled}\x1b[24m`;   // underline
      if (token.fontStyle & 1) styled = `\x1b[3m${styled}\x1b[23m`;   // italic
      if (token.fontStyle & 2) styled = `\x1b[1m${styled}\x1b[22m`;   // bold
      return styled;
    });
    return codeIndent + renderedTokens.join('');
  }).join('\n');
}

/**
 * Render a token stream into formatted terminal text.
 *
 * Walks the flat token array produced by markdown-exit, maintaining
 * render state (indent, list stack, table accumulator, block spacing)
 * and delegating character choices to the FormatAdapter and optional
 * AnsiLayer.
 */
export function renderTokens(
  tokens: Token[],
  adapter: FormatAdapter,
  ansi: AnsiLayer | null,
  ctx: RenderContext,
): string {
  const state: RenderState = {
    indent: 0,
    listStack: [],
    tableRows: [],
    blockSpacing: 0,
    width: ctx.width,
  };

  const output: string[] = [];
  let inHeading = false;
  let headingLevel = 1;
  let inParagraph = false;
  let inlineBuffer = '';
  let inTable = false;
  let inThead = false;
  let currentRow: string[] = [];
  let currentCellContent = '';
  let inCell = false;
  let tableAligns: TableAlign[] = [];
  let tableRows: TableRow[] = [];
  let blockquoteDepth = 0;
  let isFirstBlock = true;
  let inListItem = false;
  // Track paragraphs inside list items to suppress spacing
  let listItemParagraphCount = 0;

  function emitBlockSpacing() {
    if (!isFirstBlock) {
      output.push('');
    }
    isFirstBlock = false;
  }

  function applyQuotePrefix(text: string): string {
    if (blockquoteDepth === 0) return text;
    const bars: string[] = [];
    for (let i = 0; i < blockquoteDepth; i++) {
      const bar = ansi ? ansi.blockquoteBar(adapter.quoteBar()) : adapter.quoteBar();
      bars.push(bar);
    }
    const prefix = bars.join(' ') + ' ';
    return text.split('\n').map(line => prefix + line).join('\n');
  }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    switch (token.type) {
      case 'heading_open': {
        const tag = token.tag || 'h1';
        headingLevel = parseInt(tag.slice(1)) || 1;
        inHeading = true;
        inlineBuffer = '';
        break;
      }

      case 'heading_close': {
        let text = inlineBuffer.trim();
        const prefix = adapter.headingPrefix(headingLevel);
        if (prefix) {
          text = prefix + ' ' + text;
        }
        if (ansi) {
          text = ansi.heading(text, headingLevel);
        }
        emitBlockSpacing();
        output.push(applyQuotePrefix(text));
        inHeading = false;
        inlineBuffer = '';
        break;
      }

      case 'paragraph_open': {
        inParagraph = true;
        inlineBuffer = '';
        listItemParagraphCount++;
        break;
      }

      case 'paragraph_close': {
        const text = inlineBuffer;
        inParagraph = false;
        inlineBuffer = '';

        // Calculate available width accounting for indent and blockquote
        const quoteOverhead = blockquoteDepth > 0 ? blockquoteDepth * 2 : 0;
        const availableWidth = ctx.width - state.indent - quoteOverhead;
        const wrapped = wrapText(text, availableWidth, state.indent);

        // Don't emit block spacing for first paragraph in a list item
        if (inListItem && listItemParagraphCount <= 1) {
          // Content was already started by the list marker
          const lines = wrapped.split('\n');
          // First line goes on same line as marker (already emitted)
          if (lines.length > 0) {
            // Append to last output line
            if (output.length > 0) {
              output[output.length - 1] += lines[0].trimStart();
              for (let l = 1; l < lines.length; l++) {
                output.push(applyQuotePrefix(lines[l]));
              }
            } else {
              output.push(applyQuotePrefix(wrapped));
            }
          }
        } else {
          emitBlockSpacing();
          output.push(applyQuotePrefix(wrapped));
        }
        break;
      }

      case 'blockquote_open': {
        blockquoteDepth++;
        break;
      }

      case 'blockquote_close': {
        blockquoteDepth--;
        break;
      }

      case 'bullet_list_open': {
        if (state.listStack.length === 0) {
          emitBlockSpacing();
        }
        state.listStack.push({
          type: 'unordered',
          counter: 0,
          depth: state.listStack.length,
        });
        break;
      }

      case 'bullet_list_close': {
        state.listStack.pop();
        break;
      }

      case 'ordered_list_open': {
        if (state.listStack.length === 0) {
          emitBlockSpacing();
        }
        let start = 1;
        if (token.attrs) {
          for (const [key, val] of token.attrs) {
            if (key === 'start') start = parseInt(val) || 1;
          }
        }
        state.listStack.push({
          type: 'ordered',
          counter: start,
          depth: state.listStack.length,
        });
        break;
      }

      case 'ordered_list_close': {
        state.listStack.pop();
        break;
      }

      case 'list_item_open': {
        inListItem = true;
        listItemParagraphCount = 0;
        const listCtx = state.listStack[state.listStack.length - 1];
        if (!listCtx) break;

        const depth = listCtx.depth;
        const indentStr = '  '.repeat(depth);

        let marker: string;
        if (listCtx.type === 'unordered') {
          marker = adapter.bulletChar(depth);
        } else {
          marker = adapter.orderedMarker(listCtx.counter);
          listCtx.counter++;
        }

        output.push(applyQuotePrefix(indentStr + marker + ' '));
        state.indent = indentStr.length + marker.length + 1;
        break;
      }

      case 'list_item_close': {
        inListItem = false;
        listItemParagraphCount = 0;
        const listCtx = state.listStack[state.listStack.length - 1];
        if (listCtx) {
          state.indent = '  '.repeat(listCtx.depth).length;
        } else {
          state.indent = 0;
        }
        break;
      }

      case 'fence':
      case 'code_block': {
        emitBlockSpacing();
        const codeIndent = adapter.codeIndent();
        const meta = token.meta as any;
        const langInfo = (token.info || '').trim();

        // Language label above code block (not for mermaid)
        if (langInfo && langInfo.toLowerCase() !== 'mermaid' && !meta?.isMermaid) {
          const label = codeIndent + langInfo;
          output.push(applyQuotePrefix(ansi ? ansi.codeBlock(label) : label));
        }

        if (meta?.isMermaid && meta?.mermaidRendered) {
          // Mermaid rendered: output the pre-rendered diagram
          // Diagram already has ANSI escapes if applicable
          output.push(applyQuotePrefix(meta.mermaidRendered));
        } else if (meta?.isMermaid && meta?.mermaidUnsupported) {
          // Mermaid unsupported: show placeholder box
          const typeName = meta.mermaidUnsupported;
          const placeholder = `${codeIndent}[${typeName} diagram - unsupported]`;
          output.push(applyQuotePrefix(ansi ? ansi.codeBlock(placeholder) : placeholder));
        } else if (meta?.isMermaid) {
          // Mermaid error fallback: render raw source as plain code block
          const content = (token.content || '').replace(/\n$/, '');
          const lines = content.split('\n').map(line => {
            const indented = codeIndent + line;
            return ansi ? ansi.codeBlock(indented) : indented;
          });
          output.push(applyQuotePrefix(lines.join('\n')));
        } else if (meta?.highlightTokens) {
          // Highlighted code: render with syntax highlighting
          let mode: 'ansi' | 'utf8' | 'ascii';
          if (ctx.ansiEnabled && ansi) {
            mode = 'ansi';
          } else if (ctx.format === 'utf8') {
            mode = 'utf8';
          } else {
            mode = 'ascii';
          }
          const highlighted = renderHighlightedLines(meta.highlightTokens, mode, codeIndent);
          output.push(applyQuotePrefix(highlighted));
        } else {
          // Plain code: no highlight tokens, default rendering
          const content = (token.content || '').replace(/\n$/, '');
          const lines = content.split('\n').map(line => {
            const indented = codeIndent + line;
            return ansi ? ansi.codeBlock(indented) : indented;
          });
          output.push(applyQuotePrefix(lines.join('\n')));
        }
        break;
      }

      case 'table_open': {
        inTable = true;
        tableRows = [];
        tableAligns = [];
        break;
      }

      case 'table_close': {
        inTable = false;
        emitBlockSpacing();
        const chars = adapter.tableChars();
        const result = layoutTable(tableRows, tableAligns, ctx.width, chars, ansi);
        output.push(applyQuotePrefix(result));
        tableRows = [];
        tableAligns = [];
        break;
      }

      case 'thead_open': {
        inThead = true;
        break;
      }

      case 'thead_close': {
        inThead = false;
        break;
      }

      case 'tbody_open':
      case 'tbody_close': {
        break;
      }

      case 'tr_open': {
        currentRow = [];
        break;
      }

      case 'tr_close': {
        tableRows.push({
          cells: currentRow,
          isHeader: inThead,
        });
        currentRow = [];
        break;
      }

      case 'th_open':
      case 'td_open': {
        inCell = true;
        currentCellContent = '';
        // Extract alignment from style attr
        if (token.attrs && inThead && token.type === 'th_open') {
          for (const [key, val] of token.attrs) {
            if (key === 'style') {
              const match = val.match(/text-align:\s*(left|center|right)/);
              if (match) {
                tableAligns.push(match[1] as TableAlign);
              } else {
                tableAligns.push('');
              }
            }
          }
        }
        break;
      }

      case 'th_close':
      case 'td_close': {
        inCell = false;
        currentRow.push(currentCellContent.trim());
        currentCellContent = '';
        break;
      }

      case 'hr': {
        emitBlockSpacing();
        const rule = adapter.hrRule(ctx.width);
        output.push(applyQuotePrefix(rule));
        break;
      }

      case 'html_block': {
        // Skip silently for safety
        break;
      }

      case 'inline': {
        const rendered = renderInline(
          token.children || [],
          adapter,
          ansi,
          state,
          ctx,
        );
        if (inCell) {
          currentCellContent += rendered;
        } else {
          inlineBuffer += rendered;
        }
        break;
      }

      default:
        // Unknown token type -- skip
        break;
    }
  }

  return output.join('\n') + '\n';
}

/**
 * Render inline token children into a string.
 */
export function renderInline(
  children: Token[],
  adapter: FormatAdapter,
  ansi: AnsiLayer | null,
  state: RenderState,
  ctx: RenderContext,
): string {
  const parts: string[] = [];
  let linkHref = '';
  let linkText = '';
  let inLink = false;
  let boldBuffer: string[] | null = null;
  let italicBuffer: string[] | null = null;
  let strikeBuffer: string[] | null = null;

  for (const child of children) {
    switch (child.type) {
      case 'text': {
        const text = child.content || '';
        if (inLink) {
          linkText += text;
        } else if (strikeBuffer !== null) {
          strikeBuffer.push(text);
        } else if (italicBuffer !== null) {
          italicBuffer.push(text);
        } else if (boldBuffer !== null) {
          boldBuffer.push(text);
        } else {
          parts.push(text);
        }
        break;
      }

      case 'code_inline': {
        const code = child.content || '';
        let rendered: string;
        if (ansi) {
          rendered = ansi.code(code);
        } else {
          rendered = '`' + code + '`';
        }
        if (inLink) {
          linkText += rendered;
        } else if (boldBuffer !== null) {
          boldBuffer.push(rendered);
        } else if (italicBuffer !== null) {
          italicBuffer.push(rendered);
        } else {
          parts.push(rendered);
        }
        break;
      }

      case 'strong_open': {
        boldBuffer = [];
        break;
      }

      case 'strong_close': {
        if (boldBuffer !== null) {
          const text = boldBuffer.join('');
          const styled = ansi ? ansi.bold(text) : text;
          boldBuffer = null;
          if (inLink) {
            linkText += styled;
          } else if (italicBuffer !== null) {
            italicBuffer.push(styled);
          } else {
            parts.push(styled);
          }
        }
        break;
      }

      case 'em_open': {
        italicBuffer = [];
        break;
      }

      case 'em_close': {
        if (italicBuffer !== null) {
          const text = italicBuffer.join('');
          const styled = ansi ? ansi.italic(text) : text;
          italicBuffer = null;
          if (inLink) {
            linkText += styled;
          } else if (boldBuffer !== null) {
            boldBuffer.push(styled);
          } else {
            parts.push(styled);
          }
        }
        break;
      }

      case 's_open': {
        strikeBuffer = [];
        break;
      }

      case 's_close': {
        if (strikeBuffer !== null) {
          const text = strikeBuffer.join('');
          const styled = ansi ? ansi.strikethrough(text) : text;
          strikeBuffer = null;
          if (boldBuffer !== null) {
            boldBuffer.push(styled);
          } else if (italicBuffer !== null) {
            italicBuffer.push(styled);
          } else {
            parts.push(styled);
          }
        }
        break;
      }

      case 'link_open': {
        inLink = true;
        linkText = '';
        linkHref = '';
        if (child.attrs) {
          for (const [key, val] of child.attrs) {
            if (key === 'href') linkHref = val;
          }
        }
        break;
      }

      case 'link_close': {
        inLink = false;
        let rendered: string;
        if (ansi) {
          rendered = ansi.link(linkText, linkHref);
        } else {
          // ASCII mode: text (url)
          rendered = linkText + ' (' + linkHref + ')';
        }
        if (boldBuffer !== null) {
          boldBuffer.push(rendered);
        } else if (italicBuffer !== null) {
          italicBuffer.push(rendered);
        } else {
          parts.push(rendered);
        }
        linkText = '';
        linkHref = '';
        break;
      }

      case 'image': {
        const alt = child.content || child.children?.map((c: Token) => c.content).join('') || 'image';
        let src = '';
        if (child.attrs) {
          for (const [key, val] of child.attrs) {
            if (key === 'src') src = val;
          }
        }
        const rendered = `[${alt}](${src})`;
        parts.push(rendered);
        break;
      }

      case 'softbreak': {
        if (inLink) {
          linkText += ' ';
        } else if (boldBuffer !== null) {
          boldBuffer.push(' ');
        } else if (italicBuffer !== null) {
          italicBuffer.push(' ');
        } else {
          parts.push(' ');
        }
        break;
      }

      case 'hardbreak': {
        if (inLink) {
          linkText += '\n';
        } else if (boldBuffer !== null) {
          boldBuffer.push('\n');
        } else if (italicBuffer !== null) {
          italicBuffer.push('\n');
        } else {
          parts.push('\n');
        }
        break;
      }

      case 'html_inline': {
        // Skip silently for safety
        break;
      }

      default:
        break;
    }
  }

  return parts.join('');
}
