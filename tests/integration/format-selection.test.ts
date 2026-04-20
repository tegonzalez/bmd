import { describe, test, expect } from 'bun:test';
import { runPipeline } from '../../src/pipeline/index.ts';
import { getDefaults } from '../../src/theme/defaults.ts';
import type { BmdConfig } from '../../src/config/schema.ts';

function makeConfig(overrides?: Partial<BmdConfig>): BmdConfig {
  return {
    format: 'utf8',
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

describe('format selection (TERM-06)', () => {
  test('ascii format uses ASCII characters (no Unicode box drawing)', async () => {
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const result = await runPipeline({ source: BASIC_MD, config });
    const stdout = result.rendered;
    // ASCII mode should not contain Unicode box drawing characters
    expect(stdout).not.toContain('\u2500'); // horizontal line
    expect(stdout).not.toContain('\u2502'); // vertical line
    expect(stdout).not.toContain('\u250C'); // top-left corner
  });

  test('utf8 format uses Unicode characters', async () => {
    const config = makeConfig({ format: 'utf8', ansiEnabled: false });
    const result = await runPipeline({ source: BASIC_MD, config });
    const stdout = result.rendered;
    // UTF-8 mode should contain Unicode box drawing for tables/rules
    const hasUnicode = stdout.includes('\u2500') || stdout.includes('\u2502') || stdout.includes('\u2022');
    expect(hasUnicode).toBe(true);
  });
});
