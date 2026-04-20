import { describe, test, expect } from 'bun:test';
import { runPipeline } from '../../src/pipeline/index.ts';
import { getDefaults } from '../../src/theme/defaults.ts';
import type { BmdConfig } from '../../src/config/schema.ts';

function makeConfig(overrides?: Partial<BmdConfig>): BmdConfig {
  return {
    format: 'ascii',
    width: 80,
    ansiEnabled: false,
    pager: 'never',
    unsafeHtml: false,
    unicode: true,
    filePath: undefined,
    theme: getDefaults(),
    templates: { enabled: false, map: undefined, auto_map: false, list_spec: undefined },
    undo: { groupDelay: 500, depth: 200 },
    serve: { host: '0.0.0.0', port: 3000, open: true, mode: 'both', colorMode: 'auto', readonly: false },
    ...overrides,
  };
}

const BASIC_MD = `# Heading 1

## Heading 2

### Heading 3

This is a paragraph with **bold text**, *italic text*, and ~~strikethrough~~.

- Unordered item 1
- Unordered item 2
  - Nested item A
  - Nested item B
- Unordered item 3

1. Ordered item 1
2. Ordered item 2
3. Ordered item 3

[Inline link](https://example.com)

![Alt text](image.png)

> Blockquote line 1
> Blockquote line 2
>
> > Nested blockquote

---

| Left | Center | Right |
|:-----|:------:|------:|
| a    |   b    |     c |
| d    |   e    |     f |

[reference link][ref1]

[ref1]: https://example.com/ref "Reference Title"
`;

const CODE_BLOCKS_MD = `## Fenced Code Block

\`\`\`js
function hello() {
  console.log("hello");
}
\`\`\`

## Indented Code Block

    const x = 1;
    const y = 2;

## Tabs Mixed with Spaces

\`\`\`
\ttab-indented
    space-indented
\t \tmixed-tabs
\`\`\`

## Leading and Trailing Blank Lines in Fence

\`\`\`

  code with blanks around

\`\`\`

## Nested in Blockquote

> \`\`\`python
> def greet():
>     print("hi")
> \`\`\`

## Empty Code Block

\`\`\`
\`\`\`
`;

describe('elements rendering (TERM-03)', () => {
  let output: string;

  // Run once and cache output
  test('renders basic.md fixture', async () => {
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const result = await runPipeline({ source: BASIC_MD, config });
    output = result.rendered;
    expect(output.length).toBeGreaterThan(0);
  });

  test('headings are present', () => {
    expect(output).toContain('Heading 1');
    expect(output).toContain('Heading 2');
    expect(output).toContain('Heading 3');
  });

  test('bold text renders', () => {
    expect(output).toContain('bold text');
  });

  test('lists render with markers', () => {
    // Unordered list bullets
    expect(output).toContain('Unordered item 1');
    expect(output).toContain('Unordered item 2');
    // Ordered list numbers
    expect(output).toContain('1.');
    expect(output).toContain('2.');
  });

  test('code blocks render with indented content', async () => {
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const result = await runPipeline({ source: CODE_BLOCKS_MD, config });
    const stdout = result.rendered;
    expect(stdout.length).toBeGreaterThan(0);
    // Code blocks are indented with 4 spaces
    expect(stdout).toContain('    ');
  });

  test('tables render with border characters', () => {
    // ASCII table uses + and | and -
    expect(output).toContain('|');
    expect(output).toContain('+');
    expect(output).toContain('Left');
    expect(output).toContain('Center');
    expect(output).toContain('Right');
  });

  test('blockquotes render with quote bar character', () => {
    expect(output).toContain('| Blockquote');
  });
});
