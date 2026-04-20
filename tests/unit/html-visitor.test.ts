/**
 * HtmlVisitor tests - TDD RED phase.
 *
 * Verifies HTML output for all node types in the DocTree.
 */
import { test, expect, describe } from 'bun:test';
import { HtmlVisitor } from '../../src/pipeline/html-visitor';
import type { DocNode, RegionMap } from '../../src/pipeline/types';
import type { Finding } from '../../src/unicode/types';

/** Helper: create a minimal DocNode */
function node(
  type: DocNode['type'],
  opts: Partial<DocNode> = {},
): DocNode {
  return {
    type,
    byteRange: [0, 0],
    children: [],
    meta: {},
    findings: [],
    regions: [],
    ...opts,
  };
}

describe('HtmlVisitor', () => {
  const visitor = new HtmlVisitor();

  // Test 1: visitHeading produces <h1>-<h6> tags
  test('visitHeading produces correct heading tags', () => {
    for (let level = 1; level <= 6; level++) {
      const heading = node('heading', {
        meta: { level },
        children: [node('text', { content: `Heading ${level}` })],
      });
      const doc = node('document', { children: [heading] });
      const html = visitor.render(doc);
      expect(html).toContain(`<h${level}>Heading ${level}</h${level}>`);
    }
  });

  // Test 2: visitParagraph produces <p> tags
  test('visitParagraph produces <p> tags wrapping inline content', () => {
    const para = node('paragraph', {
      children: [node('text', { content: 'Hello world' })],
    });
    const doc = node('document', { children: [para] });
    const html = visitor.render(doc);
    expect(html).toContain('<p>Hello world</p>');
  });

  // Test 3: visitFence with syntax highlight produces Shiki HTML
  test('visitFence with highlightTokens produces Shiki-style HTML', () => {
    const fence = node('fence', {
      content: 'const x = 1;',
      meta: {
        info: 'javascript',
        highlightTokens: [
          [
            { content: 'const', color: '#ff79c6' },
            { content: ' x = ', color: '#f8f8f2' },
            { content: '1', color: '#bd93f9' },
            { content: ';', color: '#f8f8f2' },
          ],
        ],
      },
    });
    const doc = node('document', { children: [fence] });
    const html = visitor.render(doc);
    expect(html).toContain('<pre');
    expect(html).toContain('<span style="color:#ff79c6">const</span>');
    expect(html).toContain('<span style="color:#bd93f9">1</span>');
  });

  // Test 4: visitFence with mermaid produces <div class="mermaid-diagram">
  test('visitFence with mermaidSvg produces mermaid diagram div', () => {
    const fence = node('fence', {
      content: 'graph TD; A-->B',
      meta: {
        info: 'mermaid',
        mermaidSvg: '<svg><rect/></svg>',
      },
    });
    const doc = node('document', { children: [fence] });
    const html = visitor.render(doc);
    expect(html).toContain('<div class="mermaid-diagram"><svg><rect/></svg></div>');
  });

  // Test 5: visitFence plain produces <pre><code>
  test('visitFence plain produces <pre><code> with escaped content', () => {
    const fence = node('fence', {
      content: 'let x = a < b && c > d;',
      meta: { info: 'text' },
    });
    const doc = node('document', { children: [fence] });
    const html = visitor.render(doc);
    expect(html).toContain('<pre><code class="language-text">');
    expect(html).toContain('a &lt; b &amp;&amp; c &gt; d');
    expect(html).toContain('</code></pre>');
  });

  // Test 6: visitBulletList produces <ul><li>
  test('visitBulletList produces <ul><li> structure', () => {
    const list = node('bullet_list', {
      children: [
        node('list_item', {
          children: [
            node('paragraph', {
              children: [node('text', { content: 'Item 1' })],
            }),
          ],
        }),
        node('list_item', {
          children: [
            node('paragraph', {
              children: [node('text', { content: 'Item 2' })],
            }),
          ],
        }),
      ],
    });
    const doc = node('document', { children: [list] });
    const html = visitor.render(doc);
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>');
    expect(html).toContain('Item 1');
    expect(html).toContain('Item 2');
    expect(html).toContain('</li>');
    expect(html).toContain('</ul>');
  });

  // Test 7: visitOrderedList produces <ol><li>
  test('visitOrderedList produces <ol><li> structure', () => {
    const list = node('ordered_list', {
      children: [
        node('list_item', {
          children: [
            node('paragraph', {
              children: [node('text', { content: 'First' })],
            }),
          ],
        }),
      ],
    });
    const doc = node('document', { children: [list] });
    const html = visitor.render(doc);
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>');
    expect(html).toContain('First');
    expect(html).toContain('</ol>');
  });

  // Test 8: visitTable produces <table> with thead/tbody/tr/td and alignment
  test('visitTable produces <table> with thead/tbody and alignment', () => {
    const table = node('table', {
      children: [
        node('table_row', {
          meta: { head: true },
          children: [
            node('table_cell', {
              meta: { head: true, align: 'left' },
              children: [node('text', { content: 'Name' })],
            }),
            node('table_cell', {
              meta: { head: true, align: 'right' },
              children: [node('text', { content: 'Value' })],
            }),
          ],
        }),
        node('table_row', {
          children: [
            node('table_cell', {
              meta: { align: 'left' },
              children: [node('text', { content: 'a' })],
            }),
            node('table_cell', {
              meta: { align: 'right' },
              children: [node('text', { content: '1' })],
            }),
          ],
        }),
      ],
    });
    const doc = node('document', { children: [table] });
    const html = visitor.render(doc);
    expect(html).toContain('<table>');
    expect(html).toContain('<thead>');
    expect(html).toContain('<th');
    expect(html).toContain('Name');
    expect(html).toContain('</thead>');
    expect(html).toContain('<tbody>');
    expect(html).toContain('<td');
    expect(html).toContain('align="right"');
    expect(html).toContain('</tbody>');
    expect(html).toContain('</table>');
  });

  // Test 9: visitBlockquote produces <blockquote>
  test('visitBlockquote produces <blockquote> wrapping children', () => {
    const bq = node('blockquote', {
      children: [
        node('paragraph', {
          children: [node('text', { content: 'Quoted text' })],
        }),
      ],
    });
    const doc = node('document', { children: [bq] });
    const html = visitor.render(doc);
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<p>Quoted text</p>');
    expect(html).toContain('</blockquote>');
  });

  // Test 10: visitHr produces <hr>
  test('visitHr produces <hr>', () => {
    const doc = node('document', { children: [node('hr')] });
    const html = visitor.render(doc);
    expect(html).toContain('<hr>');
  });

  // Test 11: visitText with HTML characters escapes them
  test('visitText with HTML characters escapes them', () => {
    const para = node('paragraph', {
      children: [node('text', { content: '<script>alert("xss")</script>' })],
    });
    const doc = node('document', { children: [para] });
    const html = visitor.render(doc);
    expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });

  // Test 12: visitStrong produces <strong>, visitEm produces <em>
  test('visitStrong and visitEm produce correct tags', () => {
    const para = node('paragraph', {
      children: [
        node('strong', {
          children: [node('text', { content: 'bold' })],
        }),
        node('text', { content: ' and ' }),
        node('em', {
          children: [node('text', { content: 'italic' })],
        }),
      ],
    });
    const doc = node('document', { children: [para] });
    const html = visitor.render(doc);
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
  });

  // Test 13: visitCodeInline produces <code> with escaped content
  test('visitCodeInline produces <code> with escaped content', () => {
    const para = node('paragraph', {
      children: [
        node('code_inline', { content: '<div class="x">' }),
      ],
    });
    const doc = node('document', { children: [para] });
    const html = visitor.render(doc);
    expect(html).toContain('<code>&lt;div class=&quot;x&quot;&gt;</code>');
  });

  // Test 14: visitLink produces <a href="..."> with escaped href
  test('visitLink produces <a> with escaped href', () => {
    const para = node('paragraph', {
      children: [
        node('link', {
          meta: { href: 'https://example.com/path?q=1&r=2' },
          children: [node('text', { content: 'Click here' })],
        }),
      ],
    });
    const doc = node('document', { children: [para] });
    const html = visitor.render(doc);
    expect(html).toContain('<a href="https://example.com/path?q=1&amp;r=2">');
    expect(html).toContain('Click here</a>');
  });

  // Test 15: visitImage produces <img src="..." alt="...">
  test('visitImage produces <img> with escaped src and alt', () => {
    const para = node('paragraph', {
      children: [
        node('image', {
          meta: { src: 'img.png', alt: 'A "photo" & <art>' },
        }),
      ],
    });
    const doc = node('document', { children: [para] });
    const html = visitor.render(doc);
    expect(html).toContain('src="img.png"');
    expect(html).toContain('alt="A &quot;photo&quot; &amp; &lt;art&gt;"');
  });

  // Test 16: visitBreak (hard and soft)
  test('visitBreak(hard=true) produces <br>, visitBreak(hard=false) produces newline', () => {
    const para = node('paragraph', {
      children: [
        node('text', { content: 'Line 1' }),
        node('hardbreak'),
        node('text', { content: 'Line 2' }),
        node('softbreak'),
        node('text', { content: 'Line 3' }),
      ],
    });
    const doc = node('document', { children: [para] });
    const html = visitor.render(doc);
    expect(html).toContain('Line 1<br>Line 2');
    expect(html).toContain('Line 2\nLine 3');
  });

  // Test 17: Text node with unicode findings renders styled spans
  test('text with unicode findings renders styled spans', () => {
    const finding: Finding = {
      offset: 5,
      length: 1,
      category: 'zero-width',
      codepoint: 0x200b,
      glyph: '[ZWSP]',
      tooltip: 'U+200B Zero Width Space',
      isAtomic: false,
    };
    const textNode = node('text', {
      content: 'Hello\u200Bworld',
      byteRange: [0, 11],
      findings: [finding],
    });
    const para = node('paragraph', { children: [textNode] });
    const doc = node('document', { children: [para] });
    const html = visitor.render(doc);
    expect(html).toContain('class="bmd-unic bmd-unic-zero-width"');
    expect(html).toContain('title="U+200B Zero Width Space"');
    expect(html).toContain('[ZWSP]');
  });

  // Test 18: HTML tags in source rendered as escaped text
  test('HTML tags in findings render as escaped text', () => {
    const finding: Finding = {
      offset: 0,
      length: 6,
      category: 'html_tag' as any,
      codepoint: 0x3c,
      glyph: '<b>',
      tooltip: 'HTML tag: <b>',
      isAtomic: false,
    };
    const textNode = node('text', {
      content: '<b>foo',
      byteRange: [0, 6],
      findings: [finding],
    });
    const para = node('paragraph', { children: [textNode] });
    const doc = node('document', { children: [para] });
    const html = visitor.render(doc);
    expect(html).toContain('&lt;b&gt;');
    expect(html).toContain('class="bmd-unic bmd-unic-html_tag"');
  });

  // Test 19: ANSI escape finding renders styled span
  test('ANSI escape finding renders styled span', () => {
    const finding: Finding = {
      offset: 0,
      length: 4,
      category: 'ansi-escape',
      codepoint: 0x1b,
      glyph: '[ESC]',
      tooltip: 'ANSI escape sequence',
      isAtomic: true,
      atomicGroupId: 1,
    };
    const textNode = node('text', {
      content: '\x1b[31mred',
      byteRange: [0, 8],
      findings: [finding],
    });
    const para = node('paragraph', { children: [textNode] });
    const doc = node('document', { children: [para] });
    const html = visitor.render(doc);
    expect(html).toContain('class="bmd-unic bmd-unic-ansi-escape bmd-unic-atomic"');
    expect(html).toContain('title="ANSI escape sequence"');
    expect(html).toContain('[ESC]');
  });

  // Test 20: Mixed findings (unicode + ANSI + HTML) all render as styled spans
  test('mixed findings all render as styled spans', () => {
    const findings: Finding[] = [
      {
        offset: 0,
        length: 1,
        category: 'zero-width',
        codepoint: 0x200b,
        glyph: '[ZWSP]',
        tooltip: 'U+200B Zero Width Space',
        isAtomic: false,
      },
      {
        offset: 5,
        length: 4,
        category: 'ansi-escape',
        codepoint: 0x1b,
        glyph: '[ESC]',
        tooltip: 'ANSI escape',
        isAtomic: true,
        atomicGroupId: 1,
      },
    ];
    const textNode = node('text', {
      content: '\u200Btext\x1b[31m',
      byteRange: [0, 9],
      findings,
    });
    const para = node('paragraph', { children: [textNode] });
    const doc = node('document', { children: [para] });
    const html = visitor.render(doc);
    expect(html).toContain('bmd-unic-zero-width');
    expect(html).toContain('bmd-unic-ansi-escape');
    expect(html).toContain('[ZWSP]');
    expect(html).toContain('[ESC]');
  });

  // Test 21: Template region wraps text in bmd-region-template spans
  test('visitText with template regions produces bmd-region-template spans', () => {
    const region: RegionMap = {
      id: 1,
      type: 'T',
      originalByteRange: [0, 9],
      expandedByteRange: [0, 11],
      originalContent: '{{name}}',
      expandedContent: 'hello world',
    };
    const textNode = node('text', {
      content: 'hello world',
      byteRange: [0, 11],
      regions: [region],
    });
    const para = node('paragraph', { children: [textNode] });
    const doc = node('document', { children: [para] });
    const html = visitor.render(doc);
    expect(html).toContain('class="bmd-region bmd-region-template"');
    expect(html).toContain('data-region-id="1"');
    expect(html).toContain('title="{{name}}"');
    expect(html).toContain('hello world');
  });

  // Test 22: Template region with partial overlap wraps only the covered range
  test('visitText with partial template region wraps correct range', () => {
    const region: RegionMap = {
      id: 2,
      type: 'T',
      originalByteRange: [6, 14],
      expandedByteRange: [6, 11],
      originalContent: '{{val}}',
      expandedContent: 'world',
    };
    const textNode = node('text', {
      content: 'hello world',
      byteRange: [0, 11],
      regions: [region],
    });
    const para = node('paragraph', { children: [textNode] });
    const doc = node('document', { children: [para] });
    const html = visitor.render(doc);
    // "hello " should be plain text, "world" should be wrapped
    expect(html).toContain('hello ');
    expect(html).toContain('class="bmd-region bmd-region-template"');
    expect(html).toContain('title="{{val}}"');
  });

  // Test 23: Multiple template regions in same text node
  test('visitText with multiple template regions wraps each separately', () => {
    const regions: RegionMap[] = [
      {
        id: 1,
        type: 'T',
        originalByteRange: [0, 8],
        expandedByteRange: [0, 5],
        originalContent: '{{first}}',
        expandedContent: 'hello',
      },
      {
        id: 2,
        type: 'T',
        originalByteRange: [9, 17],
        expandedByteRange: [6, 11],
        originalContent: '{{second}}',
        expandedContent: 'world',
      },
    ];
    const textNode = node('text', {
      content: 'hello world',
      byteRange: [0, 11],
      regions,
    });
    const para = node('paragraph', { children: [textNode] });
    const doc = node('document', { children: [para] });
    const html = visitor.render(doc);
    expect(html).toContain('data-region-id="1"');
    expect(html).toContain('data-region-id="2"');
    expect(html).toContain('title="{{first}}"');
    expect(html).toContain('title="{{second}}"');
  });

  // Test 24: Non-template region types are not wrapped
  test('visitText with non-template region types does not produce template spans', () => {
    const region: RegionMap = {
      id: 3,
      type: 'U',
      originalByteRange: [0, 5],
      expandedByteRange: [0, 5],
      originalContent: 'hello',
      expandedContent: 'hello',
    };
    const textNode = node('text', {
      content: 'hello',
      byteRange: [0, 5],
      regions: [region],
    });
    const para = node('paragraph', { children: [textNode] });
    const doc = node('document', { children: [para] });
    const html = visitor.render(doc);
    expect(html).not.toContain('bmd-region-template');
  });

  // Test 25: Template regions coexist with unicode findings
  test('visitText with both findings and template regions renders both', () => {
    const finding: Finding = {
      offset: 0,
      length: 1,
      category: 'zero-width',
      codepoint: 0x200b,
      glyph: '[ZWSP]',
      tooltip: 'U+200B Zero Width Space',
      isAtomic: false,
    };
    const region: RegionMap = {
      id: 1,
      type: 'T',
      originalByteRange: [1, 9],
      expandedByteRange: [1, 6],
      originalContent: '{{val}}',
      expandedContent: 'hello',
    };
    const textNode = node('text', {
      content: '\u200Bhello',
      byteRange: [0, 6],
      findings: [finding],
      regions: [region],
    });
    const para = node('paragraph', { children: [textNode] });
    const doc = node('document', { children: [para] });
    const html = visitor.render(doc);
    expect(html).toContain('bmd-unic-zero-width');
    expect(html).toContain('bmd-region-template');
  });
});
