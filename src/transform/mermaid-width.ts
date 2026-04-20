import { renderMermaidASCII } from "beautiful-mermaid";
import type { AsciiRenderOptions } from "beautiful-mermaid";
import stringWidth from "string-width";

function maxRenderedWidth(rendered: string): number {
  return Math.max(0, ...rendered.split("\n").map((line) => stringWidth(line)));
}

/**
 * beautiful-mermaid treats maxWidth as a layout hint. Keep tightening the hint
 * until the rendered text satisfies bmd's hard terminal width contract.
 */
export function renderMermaidASCIIWidthBounded(
  source: string,
  options: AsciiRenderOptions,
  targetWidth: number,
): string {
  const target = Math.max(1, Math.floor(targetWidth));
  let maxWidth = Math.max(1, Math.floor(options.maxWidth ?? target));
  let rendered = renderMermaidASCII(source, { ...options, maxWidth });
  let renderedWidth = maxRenderedWidth(rendered);

  while (renderedWidth > target && maxWidth > 1) {
    maxWidth = Math.max(1, maxWidth - Math.max(1, renderedWidth - target));
    rendered = renderMermaidASCII(source, { ...options, maxWidth });
    renderedWidth = maxRenderedWidth(rendered);
  }

  return rendered;
}
