# Changelog

This changelog is a history artifact: it records feature-level changes over time, not the current product contract. Entries are listed by date and prefixed with a feature tag from the legend.

## Legend

| Tag         | Feature Area                                                |
| ----------- | ----------------------------------------------------------- |
| `[PIPE]`    | Rendering pipeline and shared document model                |
| `[PREVIEW]` | Browser preview, editor, live reload, and sync              |
| `[CLI]`     | Command-line interface and command behavior                 |
| `[CONFIG]`  | Configuration, defaults, and value resolution               |
| `[TMPL]`    | Template expressions and map handling                       |
| `[THEME]`   | Theme system and bundled/project-local themes               |
| `[UNICODE]` | Unicode detection, safety findings, and glyph decoration    |
| `[MERMAID]` | Mermaid rendering                                           |
| `[SYNTAX]`  | Syntax highlighting and code block handling                 |
| `[TABLE]`   | Markdown table rendering and structured table input         |
| `[DIAG]`    | Diagnostics, logs, and API contracts                        |
| `[BUILD]`   | Runtime support, packaging, and build output                |
| `[DOCS]`    | Documentation                                               |
| `[TEST]`    | Test coverage and verification                              |

## 2026-04-19

- `[PIPE]` Added a unified DocTree-based render pipeline: template expansion, sanitization findings, Markdown parsing, byte-range annotation, tree building, transforms, and rendering now flow through a shared pipeline entrypoint.
- `[PIPE]` Added tree-based terminal and HTML visitors for rendering the same parsed document model to terminal output and browser preview output.
- `[PIPE]` Added byte-range annotation and region metadata so diagnostics, unicode findings, and template regions can be mapped back to source positions.
- `[PIPE]` Added an incremental preview path that can reuse unchanged tree blocks and only re-transform dirty fence nodes.
- `[PIPE]` Added a shared transform cache for expensive fence transforms such as Shiki highlighting and Mermaid rendering.
- `[PIPE]` Added width-compliance handling across paragraphs, headings, lists, blockquotes, tables, horizontal rules, and Mermaid diagrams.
- `[MERMAID]` Added Mermaid width enforcement so rendered Mermaid text respects the requested terminal width even when the upstream renderer treats width as a layout hint.
- `[PREVIEW]` Added `bmd serve` for a local browser preview server with editor, preview, and split modes.
- `[PREVIEW]` Added live reload for source-file changes and template map-file changes.
- `[PREVIEW]` Added WebSocket and polling transports for preview/editor synchronization.
- `[PREVIEW]` Added CRDT-backed editor synchronization with Yjs.
- `[PREVIEW]` Added FSM-backed client and server protocol state machines for connection lifecycle, file operations, and external event handling.
- `[PREVIEW]` Added reconnect and offline-edit handling, including digest-based reconciliation after disconnects.
- `[PREVIEW]` Added file save support from the browser editor, readonly mode, and external file-change handling.
- `[PREVIEW]` Added undo/redo support in the browser editor with toolbar controls, history depth, grouping delay, and diff highlighting for external edits.
- `[PREVIEW]` Added color-mode support for browser preview: `day`, `night`, and `auto`.
- `[CLI]` Replaced separate `ascii` and `utf8` command paths with a default render command and format flags.
- `[CLI]` Added `bmd eval` and `bmd meval` for testing template operator pipelines from stdin and multi-line YAML input.
- `[CLI]` Added `bmd info` for extracting template fields as a YAML map skeleton.
- `[CLI]` Added `bmd map` for expanding templates and emitting Markdown without terminal rendering.
- `[CLI]` Added `bmd table` for rendering JSON or JSON Lines as a Markdown table through the same terminal pipeline.
- `[CLI]` Added `bmd themes` for listing theme facets and bundled/project-local theme names.
- `[CLI]` Added global option handling before subcommands for config, theme, and unsafe HTML flags.
- `[CLI]` Added generated command help with examples and command-specific option metadata.
- `[CLI]` Added CLI validation for ports, widths, modes, file paths, and theme specs.
- `[CONFIG]` Added `bmd.config.yaml` support with schema validation and strict unknown-field rejection.
- `[CONFIG]` Added a commented `bmd.config.example.yaml`.
- `[CONFIG]` Added centralized built-in defaults for render, serve, template, unicode, and undo settings.
- `[CONFIG]` Added config merge precedence: defaults, config file, then CLI flags.
- `[CONFIG]` Added config fields for terminal width, ANSI mode, pager, theme, unsafe HTML, unicode detection, template settings, serve settings, and undo settings.
- `[CONFIG]` Added template value resolution from CLI `--var`, CLI `--map`, config `templates.map`, and opt-in paired `.t` auto-map discovery.
- `[CONFIG]` Added YAML validation and diagnostics for malformed config and template map files.
- `[CONFIG]` Added URL rejection for config file string values as a safety guard.
- `[TMPL]` Added `{{FIELD}}` template expansion before Markdown parsing.
- `[TMPL]` Added defaults with `{{FIELD:-fallback}}`.
- `[TMPL]` Added dot-path traversal for nested YAML map values.
- `[TMPL]` Added template operator pipelines.
- `[TMPL]` Added string operators: `upper`, `lower`, `camel`, `proper`, and `tr`.
- `[TMPL]` Added list operators: `join`, `lines`, and `subst`.
- `[TMPL]` Added configurable `templates.list_spec` behavior for unterminated list results.
- `[TMPL]` Added template warnings with source offsets and CLI diagnostics.
- `[TMPL]` Added code-block and inline-code protection so template expressions inside code are preserved.
- `[TMPL]` Added template replacement regions for preview and terminal decoration.
- `[THEME]` Added a five-facet theme system: `syn`, `md`, `mer`, `web`, and `unic`.
- `[THEME]` Added bundled themes for syntax, Markdown, Mermaid, web preview, and unicode detection.
- `[THEME]` Added project-local theme loading from `.bmd/themes/<facet>/<name>.yaml`.
- `[THEME]` Added theme spec parsing and per-facet theme resolution.
- `[THEME]` Added adapters for Shiki themes, terminal ANSI styling, Mermaid colors, and browser CSS custom properties.
- `[THEME]` Added strict theme schemas and tests for bundled themes.
- `[UNICODE]` Added unicode scanning for invisible, ambiguous, and risky character classes.
- `[UNICODE]` Added glyph substitution and aggregation support for categories such as zero-width characters, bidi controls, tag characters, ANSI escapes, whitespace, private-use characters, variation selectors, annotations, deprecated characters, noncharacters, separators, and combining floods.
- `[UNICODE]` Added unicode theme configuration for category styling and aggregation behavior.
- `[UNICODE]` Added terminal and browser decoration paths for unicode findings.
- `[UNICODE]` Added HTML and ANSI detection as non-mutating sanitization findings.
- `[MERMAID]` Added Mermaid fence rendering through `beautiful-mermaid`.
- `[MERMAID]` Added inline Mermaid support using semicolon-separated one-line Mermaid fences.
- `[MERMAID]` Added unsupported Mermaid diagram placeholders and diagnostics.
- `[SYNTAX]` Added Shiki-powered syntax highlighting with lazy language loading.
- `[SYNTAX]` Added code-block normalization for indentation, tabs, and leading/trailing blank lines.
- `[SYNTAX]` Added theme-aware syntax highlighting defaults and terminal ANSI adaptation.
- `[TABLE]` Added a table data pipeline for structured input.
- `[TABLE]` Added JSON and JSON Lines parsing for `bmd table`.
- `[TABLE]` Added row normalization, first-seen column ordering, and Markdown table generation.
- `[TABLE]` Improved terminal table layout, width handling, wrapping, and alignment.
- `[DIAG]` Added structured diagnostics with severity, source spans, context lines, and caret markers.
- `[DIAG]` Added API specs for diagnostics, config, theme, and WebSocket protocol contracts.
- `[DIAG]` Added log-channel and log-level plumbing for server diagnostics.
- `[BUILD]` Added Bun and Node runtime adapters for file and process operations.
- `[BUILD]` Added Node-compatible package installation and postinstall build support.
- `[BUILD]` Added web frontend bundling into `dist/web`.
- `[BUILD]` Added importable build stages (`buildWeb()`, `buildCli()`) and a bounded Vitest runner preflight with Node 18+ precondition.
- `[BUILD]` Added package metadata and dependency updates for browser preview, CRDT sync, syntax highlighting, Mermaid rendering, sanitization, config validation, and CLI support.
- `[DOCS]` Expanded README coverage for features, commands, flags, templates, Mermaid, themes, browser preview, configuration, development, and tests.
- `[DOCS]` Added docs for browser preview, configuration, Mermaid diagrams, template expressions, themes, and unicode mappings.
- `[DOCS]` Added a full-codebase architecture review baseline in `CODEBASE-REVIEW.md` for future PRD and implementation planning.
- `[TEST]` Added contract tests for config precedence, pipeline behavior, preview template regions, client FSM, and server FSM.
- `[TEST]` Added E2E tests for CLI smoke behavior, serve behavior, WebSocket behavior, polling behavior, and reconnect flows.
- `[TEST]` Added regression tests for width compliance, unicode pipeline behavior, stage-element coverage, CRDT merge behavior, color persistence, and divider state.
- `[TEST]` Added unit tests for pipeline stages, tree building, terminal and HTML visitors, template parsing/operators/scanning, unicode scanning and aggregation, config loading/merging, theme resolution, browser editor behavior, protocol behavior, table parsing, diagnostics, and reconciliation.
- `[TEST]` Added static asset containment tests and hermetic web fixture assets for serve tests.
- `[TEST]` Verified `bun test ./tests/` passes with 2243 tests.
