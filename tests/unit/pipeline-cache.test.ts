import { test, expect, describe } from 'bun:test';
import { TransformCache } from '../../src/pipeline/cache.js';

describe('TransformCache', () => {
  test('cache miss returns undefined', () => {
    const cache = new TransformCache();
    expect(cache.get('content', 'js', 'dark')).toBeUndefined();
  });

  test('cache set then get returns stored value', () => {
    const cache = new TransformCache();
    const entry = { highlightTokens: [{ type: 'keyword', content: 'const' }] };
    cache.set('const x = 1;', 'js', 'dark', entry);
    const result = cache.get('const x = 1;', 'js', 'dark');
    expect(result).toEqual(entry);
  });

  test('cache hit for same content+lang+theme', () => {
    const cache = new TransformCache();
    const entry = { mermaidSvg: '<svg>...</svg>' };
    cache.set('graph TD; A-->B', 'mermaid', 'default', entry);
    // Same key
    expect(cache.get('graph TD; A-->B', 'mermaid', 'default')).toEqual(entry);
    // Call again - still cached
    expect(cache.get('graph TD; A-->B', 'mermaid', 'default')).toEqual(entry);
  });

  test('cache miss for different content with same lang+theme', () => {
    const cache = new TransformCache();
    cache.set('const x = 1;', 'js', 'dark', { highlightTokens: [] });
    // Different content
    expect(cache.get('const y = 2;', 'js', 'dark')).toBeUndefined();
  });

  test('cache evicts oldest when max size (256) exceeded', () => {
    const cache = new TransformCache(256);
    // Fill cache to max
    for (let i = 0; i < 256; i++) {
      cache.set(`content-${i}`, 'js', 'dark', { highlightTokens: i });
    }
    // All 256 should be present
    expect(cache.get('content-0', 'js', 'dark')).toBeDefined();
    expect(cache.get('content-255', 'js', 'dark')).toBeDefined();

    // Add one more -- should evict oldest (content-0)
    cache.set('content-256', 'js', 'dark', { highlightTokens: 256 });
    expect(cache.get('content-0', 'js', 'dark')).toBeUndefined();
    expect(cache.get('content-256', 'js', 'dark')).toBeDefined();
    // content-1 should still be present (it was second oldest)
    expect(cache.get('content-1', 'js', 'dark')).toBeDefined();
  });
});

describe('Phase 3 TODO: typed transform cache key guardrails', () => {
  test.skip('Phase 3 TODO: Mermaid text cache separates surface format width ansiEnabled and merThemeHash', () => {
    const terminalMermaidTextKey = {
      kind: 'mermaid-text',
      contentHash: 'hash-of-graph',
      lang: 'mermaid',
      surface: 'terminal',
      format: 'utf8',
      width: 80,
      ansiEnabled: true,
      merThemeHash: 'dark-mermaid-theme',
    };
    const asciiMermaidTextKey = {
      ...terminalMermaidTextKey,
      format: 'ascii',
      width: 120,
      ansiEnabled: false,
      merThemeHash: 'plain-mermaid-theme',
    };

    expect(terminalMermaidTextKey).not.toEqual(asciiMermaidTextKey);
  });

  test.skip('Phase 3 TODO: Mermaid SVG cache cannot satisfy terminal Mermaid text lookups', () => {
    const terminalMermaidTextKey = {
      kind: 'mermaid-text',
      contentHash: 'hash-of-graph',
      lang: 'mermaid',
      surface: 'terminal',
      format: 'utf8',
      width: 80,
      ansiEnabled: true,
      merThemeHash: 'dark-mermaid-theme',
    };
    const htmlMermaidSvgKey = {
      ...terminalMermaidTextKey,
      kind: 'mermaid-svg',
      surface: 'html',
      format: undefined,
      width: undefined,
      ansiEnabled: false,
    };

    expect(terminalMermaidTextKey).not.toEqual(htmlMermaidSvgKey);
  });

  test.skip('Phase 3 TODO: highlight cache separates surface synTheme and synDefaultColor', () => {
    const terminalHighlightKey = {
      kind: 'highlight',
      contentHash: 'hash-of-code',
      lang: 'ts',
      surface: 'terminal',
      synTheme: 'github-dark',
      synDefaultColor: 'dark',
    };
    const htmlHighlightKey = {
      ...terminalHighlightKey,
      surface: 'html',
      synTheme: 'github-light',
      synDefaultColor: 'light',
    };

    expect(terminalHighlightKey).not.toEqual(htmlHighlightKey);
  });
});
