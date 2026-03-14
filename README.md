# bmd

Beautiful Markdown renderer for the terminal. Inspired by [mdcat](https://github.com/swsnr/mdcat) as the author wanted updated Mermaid diagram rendering. Supports CommonMark and GFM to the terminal with syntax highlighting (Shiki) and Mermaid diagrams (ASCII/Unicode art).

## Features

| Feature              | Description                                                              |
|----------------------|--------------------------------------------------------------------------|
| Terminal rendering   | Headings, lists, tables, blockquotes, code blocks, links, inline styles  |
| Output formats       | `ascii` (plain) and `utf8` (box-drawing, bullets) with optional ANSI     |
| Syntax highlighting  | Shiki-powered per-token coloring for fenced code blocks                  |
| Mermaid diagrams     | Text-based diagram rendering inline — no browser DOM required            |
| Inline mermaid       | One-liner mermaid via `` ```mermaid;graph LR;A --> B``` `` syntax        |
| Width-aware wrapping | Respects terminal width or `--width` override                            |
| Pager                | Auto-pages long output through `$PAGER` on TTY                           |
| Stdin support        | Pipe content via `-` for use in shell pipelines                          |

## Install

Requirements:

- Bun v1.0+
- Node.js v24.9+ for the `npm install -g .` path
- Node.js install path also requires `bun` on `PATH` during `postinstall`

### Bun

```sh
git clone https://github.com/tegonzalez/bmd.git && cd bmd

# Global — adds bmd to PATH
bun install -g .

# Local — bmd available at node_modules/.bin/bmd
bun install
```

### Node.js

```sh
git clone https://github.com/tegonzalez/bmd.git && cd bmd

# Global — adds bmd to PATH
npm install -g .

# Local — bmd available at node_modules/.bin/bmd
npm install
```

Local installs bundle the CLI to `dist/cli.js` and link it to `node_modules/.bin/bmd`. Run via `npx bmd`, `bunx bmd`, or `./node_modules/.bin/bmd`.

### Standalone binary (optional)

Compile a self-contained executable with no runtime dependency:

```sh
bun run build
bmd utf8 README.md
```

## Usage

```sh
# Render a file
bmd utf8 README.md
bmd ascii README.md

# Feed text on stdin
printf '# Hello\n\n- one\n- two\n' | bmd utf8 -
printf '## Plain output\n\nVisit https://example.com\n' | bmd ascii -
```

### Options

| Flag          | Description                  |
|---------------|------------------------------|
| `--width N`   | Override terminal width      |
| `--ansi`      | Force ANSI color on          |
| `--no-ansi`   | Force ANSI color off         |
| `--pager`     | Force pager on               |
| `--no-pager`  | Disable pager                |

ANSI detection priority: `--ansi` / `--no-ansi` flag > `NO_COLOR` env > TTY detection.

### Syntax highlighting

Fenced code blocks with a language identifier get Shiki-powered highlighting:

```sh
printf '```javascript\nconst greeting = "hello";\nconsole.log(greeting);\n```' | bmd utf8 -
```

- `utf8` + ANSI: full truecolor per-token highlighting
- `utf8` without ANSI: bold/italic from token styles
- `ascii`: plain text

Languages are loaded lazily — only the languages used in the document are fetched.

### Mermaid diagrams

Fenced blocks with `mermaid` as the language render as ASCII/Unicode art inline:

```sh
printf '```mermaid\ngraph LR\n    A --> B --> C\n```' | bmd utf8 -
```

```
┌───┐  ┌───┐  ┌───┐
│   │  │   │  │   │
│ A ├─►│ B ├─►│ C │
│   │  │   │  │   │
└───┘  └───┘  └───┘
```

Supported diagram types (from beautiful-mermaid): flowchart, sequence, state, class, ER.

Unsupported types (gantt, pie, etc.) render a labeled placeholder. Syntax errors in one block do not affect the rest of the document.

#### Inline mermaid (one-liner)

Semicolons act as line separators when the opening fence and body are on one line:

```sh
echo '```mermaid;graph LR; A --> B; B --> C```' | bmd utf8 -
```

## Credits

Much thanks to the expert teams behind:

| Project                                                                 | License | Credit                         |
|-------------------------------------------------------------------------|---------|--------------------------------|
| [mdcat](https://github.com/swsnr/mdcat)                                | Apache-2.0 | Inspiration                 |
| [markdown-exit](https://github.com/serkodev/markdown-exit)              | MIT     | Markdown parser (CommonMark)   |
| [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid)      | MIT     | Mermaid ASCII/Unicode renderer |
| [shiki](https://github.com/shikijs/shiki)                               | MIT     | Syntax highlighting engine     |
| [citty](https://github.com/unjs/citty)                                  | MIT     | CLI framework                  |
| [chalk](https://github.com/chalk/chalk)                                 | MIT     | Terminal string styling        |
| [string-width](https://github.com/sindresorhus/string-width)            | MIT     | ANSI-aware string width        |
| [strip-ansi](https://github.com/chalk/strip-ansi)                       | MIT     | Strip ANSI escapes             |
| [wrap-ansi](https://github.com/chalk/wrap-ansi)                         | MIT     | ANSI-aware text wrapping       |
| [get-shit-done](https://github.com/gsd-build/get-shit-done)             | -       | TÂCHES glittercowboy           |
| Claude Opus 4.6 (1M context) `<noreply@anthropic.com>`                  | -       | AI collaboration               |

## Roadmap

- Unified themes schema folder and files
- Local HTTP server for in-browser rendering

## Development

```sh
# Run tests
bun test

# Run directly
bun run src/cli/index.ts utf8 README.md

# Run with hot reload
bun --hot src/cli/index.ts utf8 README.md
```

## License

MIT
