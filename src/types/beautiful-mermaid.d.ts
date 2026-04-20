declare module "beautiful-mermaid" {
  export interface AsciiRenderOptions {
    useAscii?: boolean;
    colorMode?: "none" | "ansi" | "truecolor";
    paddingX?: number;
    paddingY?: number;
    boxBorderPadding?: number;
    maxWidth?: number;
    theme?: {
      fg?: string;
      border?: string;
      line?: string;
      arrow?: string;
      [key: string]: string | undefined;
    };
  }

  export function renderMermaidASCII(
    source: string,
    options?: AsciiRenderOptions,
  ): string;

  export function renderMermaidSVG(
    source: string,
    options?: Record<string, unknown>,
  ): string;
}
