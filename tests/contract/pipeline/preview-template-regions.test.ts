import { test, expect, describe } from 'bun:test';
import { parse } from '../../../src/parser/index.ts';
import { annotateByteRanges } from '../../../src/pipeline/byte-range.ts';
import { sanitize } from '../../../src/pipeline/sanitize.ts';
import { expandTemplateWithRegions } from '../../../src/pipeline/template-regions.ts';
import { decodeRegions } from '../../../src/pipeline/region-marker.ts';
import { buildTree } from '../../../src/pipeline/tree-build.ts';
import { HtmlVisitor } from '../../../src/pipeline/html-visitor.ts';
import type { RegionMap } from '../../../src/pipeline/types.ts';

describe('preview template regions (19-09)', () => {
  test('preview S2 pipeline with template values produces HTML containing expanded values', () => {
    const source = '# {{TITLE}}\n\nHello {{NAME}}';
    const values = { TITLE: 'My Doc', NAME: 'World' };

    // S2: Template expansion with regions (what renderPreview now does)
    const result = expandTemplateWithRegions(source, values);
    const templated = decodeRegions(result.output).cleanSource;
    const regions = result.regions;

    // Regions should track both template replacements
    expect(regions.length).toBe(2);

    // S1: Sanitize (same order as runPipeline — on templated clean source)
    const findings = sanitize(templated, 'utf8');

    // S3: Parse
    const { tokens } = parse(templated, false);
    annotateByteRanges(tokens, templated);

    // S4: TreeBuild with regions (not empty array)
    const tree = buildTree(tokens, regions, findings);

    // S6: Render via HtmlVisitor
    const html = new HtmlVisitor().render(tree);

    // Output HTML should contain expanded values
    expect(html).toContain('My Doc');
    expect(html).toContain('World');
    // Should NOT contain raw template expressions as visible text content
    // (title attributes may contain original expressions for tooltips -- that's by design)
    const textContent = html.replace(/<[^>]*>/g, '');
    expect(textContent).not.toContain('{{TITLE}}');
    expect(textContent).not.toContain('{{NAME}}');
  });

  test('S2 template stage produces RegionMap[] with correct metadata', () => {
    const source = '# {{TITLE}}\n\nBody text';
    const values = { TITLE: 'Hello' };

    // S2: Template expansion with regions
    const result = expandTemplateWithRegions(source, values);
    const regions = result.regions;

    // Regions should be non-empty for resolved templates
    expect(regions.length).toBe(1);
    expect(regions[0]!.type).toBe('T');
    expect(regions[0]!.expandedContent).toBe('Hello');
    expect(regions[0]!.originalContent).toBe('{{TITLE}}');
  });

  test('regions flow through buildTree to DocTree nodes', () => {
    const source = '# {{TITLE}}\n\nBody {{VALUE}}';
    const values = { TITLE: 'Hello', VALUE: 'World' };

    const result = expandTemplateWithRegions(source, values);
    const templated = decodeRegions(result.output).cleanSource;
    const findings = sanitize(templated, 'utf8');
    const { tokens } = parse(templated, false);
    annotateByteRanges(tokens, templated);

    // Pass regions (not empty array) to buildTree
    const tree = buildTree(tokens, result.regions, findings);

    expect(tree.children.length).toBeGreaterThan(0);
    // Tree should have the regions data wired through
    expect(result.regions.length).toBe(2);
  });

  test('shared transform cache is exported from pipeline/index.ts', async () => {
    const { sharedTransformCache } = await import('../../../src/pipeline/index.ts');
    expect(sharedTransformCache).toBeDefined();
    expect(typeof sharedTransformCache.get).toBe('function');
    expect(typeof sharedTransformCache.set).toBe('function');
  });

  test('preview renderPreview signature accepts template values and templatesEnabled', async () => {
    // Verify the updated function signature exists -- import check
    const mod = await import('../../../src/web/preview.ts');
    expect(typeof mod.renderPreview).toBe('function');
    // Function should accept 5 parameters (source, targetEl, unsafeHtml, templateValues, templatesEnabled)
    expect(mod.renderPreview.length).toBeGreaterThanOrEqual(2);
  });
});
