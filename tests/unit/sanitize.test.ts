import { test, expect, describe } from 'bun:test';
import { SANITIZE_CONFIG } from '../../src/web/preview.ts';

describe('DOMPurify sanitization config', () => {
  describe('SVG allowlist', () => {
    test('includes all SVG tags needed for Mermaid diagrams', () => {
      const requiredTags = [
        'svg', 'path', 'g', 'rect', 'text', 'line',
        'polyline', 'polygon', 'circle', 'ellipse',
        'defs', 'marker', 'style', 'tspan', 'foreignObject',
      ];
      for (const tag of requiredTags) {
        expect(SANITIZE_CONFIG.ADD_TAGS).toContain(tag);
      }
    });

    test('includes essential SVG attributes', () => {
      const requiredAttrs = [
        'viewBox', 'xmlns', 'd', 'fill', 'stroke', 'stroke-width',
        'transform', 'x', 'y', 'width', 'height',
      ];
      for (const attr of requiredAttrs) {
        expect(SANITIZE_CONFIG.ADD_ATTR).toContain(attr);
      }
    });

    test('includes circle/ellipse attributes', () => {
      const attrs = ['cx', 'cy', 'r', 'rx', 'ry'];
      for (const attr of attrs) {
        expect(SANITIZE_CONFIG.ADD_ATTR).toContain(attr);
      }
    });

    test('includes line attributes', () => {
      const attrs = ['x1', 'y1', 'x2', 'y2', 'points'];
      for (const attr of attrs) {
        expect(SANITIZE_CONFIG.ADD_ATTR).toContain(attr);
      }
    });

    test('includes marker attributes', () => {
      const attrs = [
        'marker-end', 'marker-start', 'refX', 'refY',
        'orient', 'markerWidth', 'markerHeight',
      ];
      for (const attr of attrs) {
        expect(SANITIZE_CONFIG.ADD_ATTR).toContain(attr);
      }
    });

    test('includes text attributes', () => {
      const attrs = [
        'text-anchor', 'dominant-baseline',
        'font-family', 'font-size', 'font-weight',
        'dx', 'dy',
      ];
      for (const attr of attrs) {
        expect(SANITIZE_CONFIG.ADD_ATTR).toContain(attr);
      }
    });
  });

  describe('XSS protection', () => {
    test('does not include script in allowed tags', () => {
      expect(SANITIZE_CONFIG.ADD_TAGS).not.toContain('script');
    });

    test('does not include iframe in allowed tags', () => {
      expect(SANITIZE_CONFIG.ADD_TAGS).not.toContain('iframe');
    });

    test('does not include object in allowed tags', () => {
      expect(SANITIZE_CONFIG.ADD_TAGS).not.toContain('object');
    });

    test('does not include embed in allowed tags', () => {
      expect(SANITIZE_CONFIG.ADD_TAGS).not.toContain('embed');
    });

    test('does not allow event handler attributes', () => {
      const dangerous = ['onclick', 'onerror', 'onload', 'onmouseover', 'onfocus'];
      for (const attr of dangerous) {
        expect(SANITIZE_CONFIG.ADD_ATTR).not.toContain(attr);
      }
    });

    test('does not allow href or src (injection vectors)', () => {
      expect(SANITIZE_CONFIG.ADD_ATTR).not.toContain('href');
      expect(SANITIZE_CONFIG.ADD_ATTR).not.toContain('src');
    });
  });
});
