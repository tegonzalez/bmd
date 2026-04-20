# bmd

Beautiful Markdown renderer for the terminal. Inspired by [mdcat](https://github.com/swsnr/mdcat) as the author wanted updated Mermaid diagram rendering.

Renders CommonMark and GFM with syntax highlighting (Shiki), Mermaid diagrams (ASCII/Unicode art), template expressions, and a browser preview server.

## Features

| Feature              | Description                                                              |
| -------------------- | ------------------------------------------------------------------------ |
| Terminal rendering   | Headings, lists, tables, blockquotes, code blocks, links, inline styles  |
| Output formats       | UTF-8 (default, box-drawing) and ASCII (plain) with optional ANSI color  |
| Template expressions | `{{FIELD\|operator}}` expansion from YAML map files before parsing       |
| Syntax highlighting  | Shiki-powered per-token coloring for fenced code blocks                  |
| Mermaid diagrams     | Text-based diagram rendering inline — no browser DOM required            |
| Inline mermaid       | One-liner mermaid via `` ```mermaid;graph LR;A --> B``` `` syntax        |
| Unicode detection    | Reveals invisible/ambiguous characters with styled glyph substitutions   |
| Theme system         | Five-facet themes (syntax, markdown, mermaid, web, unicode) in YAML      |
| Browser preview      | Local server with live reload, CRDT sync, editor + preview modes         |
| Undo/Redo            | Full undo/redo in browser editor with diff highlighting                  |
| Configuration        | Project-level `bmd.config.yaml` with three-layer merge                   |
| Width-aware wrapping | Respects terminal width or `--width` override                            |
| Pager                | Auto-pages long output through `$PAGER` on TTY                           |
| Stdin support        | Pipe content via `-` for use in shell pipelines                          |

## Install

Requires [Bun](https://bun.sh) v1.0+ or Node.js v18+.

```sh
git clone https://github.com/tegonzalez/bmd.git && cd bmd
bun install
./node_modules/.bin/bmd README.md
```

With Node.js, the same flow uses `npm install` (postinstall builds `dist/`) and `npx bmd README.md`.

### Global

After cloning, install globally from the project directory:

```sh
BMD_RELEASE=1 BUN_INSTALL_BIN=~/.bun/bin bun install -g "$(pwd)"   # install
BUN_INSTALL_BIN=~/.bun/bin bun remove -g bmd                       # uninstall
```

## Commands

| Command          | Purpose                                        |
| ---------------- | ---------------------------------------------- |
| `bmd [render]`   | Render markdown (default)                      |
| `bmd serve`      | Browser preview with live reload               |
| `bmd eval`       | Test operator pipelines (`echo x \| bmd eval upper`) |
| `bmd meval`      | Test pipelines with multi-line YAML input      |
| `bmd info`       | Extract template fields as `-m` YAML skeleton  |
| `bmd map`        | Apply template mapping and output Markdown      |
| `bmd table`      | Render JSON/JSONL as a terminal Markdown table  |
| `bmd themes`     | List theme facets (`-a` for Facet/Themes table) |

Use `bmd --help` or `bmd serve --help` for full flag details.

## Usage

```sh
# Render a file (UTF-8 default)
bmd README.md

# ASCII output
bmd -a README.md

# Stdin
printf '# Hello\n\n- one\n- two\n' | bmd -

# Browser preview
bmd serve README.md

# With template values
echo "Hello {{NAME}}!" | bmd -m map.yaml -

# Override a template value
bmd -m map.yaml --var NAME=World README.md

# Disable templating
bmd --no-templates README.md

# Expand templates only (output Markdown text)
bmd map -m map.yaml README.md

# Render structured data as a table
cat data.jsonl | bmd table -
```

### Flags

These flags apply to `render`, `serve`, `map`, and `table` where noted:

| Flag                          | Short | Applies to       | Description                              |
| ----------------------------- | ----- | ---------------- | ---------------------------------------- |
| `--ascii`                     | `-a`  | render, table    | ASCII output instead of UTF-8            |
| `--width <N>`                 | `-w`  | render, table    | Override terminal width                  |
| `--ansi` / `--no-ansi`       |       | render, table    | Force ANSI color on/off                  |
| `--pager` / `--no-pager`     |       | render, table    | Control pager behavior                   |
| `--theme <SPEC>`             | `-t`  | render, serve, table | Theme spec (e.g. `syn:dracula+md:dark`); `table` uses `--theme` only |
| `--config <PATH>`            | `-c`  | render, serve, table | Config file path                         |
| `--unsafe-html`              |       | render, serve, table | Allow raw HTML rendering (default: off)  |
| `--no-unicode`               |       | render, table    | Disable invisible/ambiguous Unicode highlighting |
| `--no-templates`             |       | render, serve, map, table | Disable expansion (`templates.enabled: false`) |
| `--map <PATH>`               | `-m`  | render, serve, map, table | YAML map file for template fields        |
| `--var KEY=VALUE`            |       | render, serve, map, table | Override a single value (repeatable)     |
| `--type <TYPE>`              | `-t`  | table            | Input format: `auto` or `json`           |
| `--host <ADDR>`              |       | serve            | Bind address (default: `localhost`)      |
| `--port <N>`                 | `-p`  | serve            | Listen port (default: 3000)              |
| `--mode <MODE>`              |       | serve            | `editor`, `preview`, or `both`           |
| `--readonly`                 |       | serve            | Disable browser editing                  |
| `--open` / `--no-open`       |       | serve            | Auto-open browser                        |
| `--color-mode`               |       | serve            | `day`, `night`, or `auto`                |

ANSI detection priority: `--ansi` / `--no-ansi` flag > `NO_COLOR` env > TTY detection.

### Template Expressions

Template expressions use `{{FIELD}}` syntax and are expanded from a YAML map file before Markdown parsing. Expressions support defaults (`{{FIELD:-fallback}}`), operator pipelines (`{{FIELD|upper}}`), and dot-path traversal (`{{user.name}}`).

| Operator               | Description                           | Example                                    |
| ---------------------- | ------------------------------------- | ------------------------------------------ |
| `upper`                | Uppercase                             | `{{X\|upper}}` — `"hello"` to `"HELLO"`   |
| `lower`                | Lowercase                             | `{{X\|lower}}` — `"HELLO"` to `"hello"`   |
| `camel`                | lowerCamelCase                        | `{{X\|camel}}` — `"hello world"` to `"helloWorld"` |
| `proper`               | Title Case                            | `{{X\|proper}}` — `"hello world"` to `"Hello World"` |
| `tr/FROM/TO/`          | Character translation                 | `{{X\|tr/abc/xyz/}}` — `"abc"` to `"xyz"` |
| `join/DELIM/`          | Join list with delimiter              | `{{X\|join/, /}}` — `["a","b"]` to `"a, b"` |
| `join/PREFIX/DELIM/SUFFIX/` | Join and wrap                     | `{{X\|join/[/, /]/}}` — `["a","b"]` to `"[a, b]"` |
| `lines/PREFIX/SUFFIX/` | Render list items as prefixed lines   | `{{X\|lines/- //}}`                        |
| `subst/PREFIX/SUFFIX/` | Prefix/suffix each list item          | `{{X\|subst/- /}}` — `["a","b"]` to `"- a, - b"` |

See [docs/template-expressions.md](docs/template-expressions.md) for the full reference.

Test operator pipelines interactively with `eval` / `meval`:

```sh
echo "hello world" | bmd eval upper
echo "abc" | bmd eval "tr/abc/xyz/"
echo "[alpha, bravo, charlie]" | bmd meval "join/, /"
```

Generate a template map skeleton from a Markdown file with `info`:

```sh
bmd info README.md > map.yaml
# map.yaml contains sorted template fields with default ""
```

### Syntax Highlighting

Fenced code blocks with a language identifier get Shiki-powered highlighting:

```sh
printf '```javascript\nconst greeting = "hello";\nconsole.log(greeting);\n```' | bmd -
```

- UTF-8 + ANSI: full truecolor per-token highlighting
- UTF-8 without ANSI: bold/italic from token styles
- ASCII: plain text

Languages are loaded lazily — only the languages used in the document are fetched.

### Mermaid Diagrams

Fenced blocks with `mermaid` as the language render as ASCII/Unicode art inline:

```sh
printf '```mermaid\ngraph LR\n    A --> B --> C\n```' | bmd -
```

```
┌───┐  ┌───┐  ┌───┐
│   │  │   │  │   │
│ A ├─►│ B ├─►│ C │
│   │  │   │  │   │
└───┘  └───┘  └───┘
```

Supported diagram types: flowchart, sequence, state, class, ER. Unsupported types (gantt, pie, etc.) render a labeled placeholder. Syntax errors in one block do not affect the rest of the document.

Inline mermaid — semicolons act as line separators on a single line:

```sh
echo '```mermaid;graph LR; A --> B; B --> C```' | bmd -
```

See [docs/mermaid-diagrams.md](docs/mermaid-diagrams.md) for the full reference.

### Browser Preview

```sh
# Start preview server
bmd serve README.md

# Preview-only mode on port 8080
bmd serve --port 8080 --mode preview --readonly README.md
```

The server provides a split editor/preview UI with live reload via WebSocket. File changes and map-file changes trigger re-render automatically. The editor supports full undo/redo with diff highlighting for external file changes.

See [docs/browser-preview.md](docs/browser-preview.md) for connection status, view modes, and offline editing.

### Themes

Five-facet theme system: `syn` (syntax), `md` (markdown), `mer` (mermaid), `web` (browser UI), `unic` (unicode). Combine facets with `+`:

```sh
bmd -t "syn:dracula+md:dark" README.md
bmd themes -a   # list all bundled + project-local themes
```

See [docs/themes.md](docs/themes.md) for properties, bundled themes, and custom theme creation.

### Configuration

`bmd.config.yaml` provides project-level defaults. See [`bmd.config.example.yaml`](bmd.config.example.yaml) for a fully commented example.

```yaml
width: auto
ansi: auto
pager: true
theme: "syn:dark+md:dark"
unsafe_html: false
unicode: true

templates:
  enabled: true
  map: ""
  auto_map: false
  list_spec: "join/, /"

undo:
  group_delay: 500
  depth: 200

serve:
  host: "localhost"
  port: 3000
  open: true
  mode: both
  color_mode: auto
  readonly: false
```

Resolution order: defaults < config file < CLI flags. See [docs/configuration.md](docs/configuration.md) for details.

## Documentation

| Guide | Description |
| ----- | ----------- |
| [Template Expressions](docs/template-expressions.md) | Full operator reference, map file format, pipeline parsing rules |
| [Mermaid Diagrams](docs/mermaid-diagrams.md) | Supported diagram types, inline syntax, theming, error handling |
| [Unicode Mappings](docs/unicode-mappings.md) | Glyph substitution tables, detection categories, atomic regions |
| [Themes](docs/themes.md) | Five-facet theme system, YAML properties, custom theme creation |
| [Browser Preview](docs/browser-preview.md) | Serve command, view modes, live reload, undo/redo, offline editing |
| [Configuration](docs/configuration.md) | Config file reference, merge precedence, ANSI detection |
| [Changelog](CHANGELOG.md) | Feature-based summary of changes since the base branch |

## Credits

Much thanks to the expert teams behind:

| Project                                                            | License    | Credit                         |
| ------------------------------------------------------------------ | ---------- | ------------------------------ |
| [mdcat](https://github.com/swsnr/mdcat)                            | Apache-2.0 | Inspiration                    |
| [markdown-exit](https://github.com/serkodev/markdown-exit)         | MIT        | Markdown parser (CommonMark)   |
| [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid) | MIT        | Mermaid ASCII/Unicode renderer |
| [shiki](https://github.com/shikijs/shiki)                          | MIT        | Syntax highlighting engine     |
| [citty](https://github.com/unjs/citty)                             | MIT        | CLI framework                  |
| [chalk](https://github.com/chalk/chalk)                            | MIT        | Terminal string styling        |
| [string-width](https://github.com/sindresorhus/string-width)       | MIT        | ANSI-aware string width        |
| [strip-ansi](https://github.com/chalk/strip-ansi)                  | MIT        | Strip ANSI escapes             |
| [wrap-ansi](https://github.com/chalk/wrap-ansi)                    | MIT        | ANSI-aware text wrapping       |
| [Tiptap](https://github.com/ueberdosis/tiptap)                     | MIT        | Browser editor framework       |
| [Yjs](https://github.com/yjs/yjs)                                  | MIT        | CRDT sync for live preview     |
| [lowlight](https://github.com/wooorm/lowlight)                     | MIT        | Code block highlighting        |
| [fast-diff](https://github.com/jhchen/fast-diff)                   | Apache-2.0 | Diff algorithm for undo/redo   |
| [Zod](https://github.com/colinhacks/zod)                           | MIT        | Schema validation              |
| [DOMPurify](https://github.com/cure53/DOMPurify)                   | Apache-2.0 | HTML sanitization              |
| [jtbl](https://github.com/kellyjonbrazil/jtbl)                     | MIT        | json to table                  |
| [get-shit-done](https://github.com/gsd-build/get-shit-done)        | -          | TÂCHES glittercowboy           |
| Claude Opus 4.6 (1M context) `<noreply@anthropic.com>`             | -          | AI collaboration               |
| Codex GPT 5.4 `<codex@openai.com>`                                 | -          | AI collaboration               |

## Development

Bun and Node.js are both fully supported. Source uses standard Node.js APIs (which Bun also supports) — no runtime branching.

```sh
# Build
npm run build               # node
bun run build               # bun

# Test (suite lives under `tests/` only; avoids symlinked `external/` trees)
npm test                    # node (vitest; see vitest.config.ts)
bun test ./tests            # bun
```

The build bundles `src/cli/index.ts` → `dist/cli.js` and pre-builds the web frontend into `dist/web/`. It runs automatically on install via postinstall.

| Test Suite  | Directory            | Description                                     |
| ----------- | -------------------- | ----------------------------------------------- |
| Unit        | `tests/unit/`        | Pure function and module tests                  |
| Contract    | `tests/contract/`    | API-spec contract tests (config, pipeline, FSM) |
| Integration | `tests/integration/` | End-to-end CLI, server, and render tests        |
| E2E         | `tests/e2e/`         | Spawned CLI/server behavior tests               |

## License

MIT
