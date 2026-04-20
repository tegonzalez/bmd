# Configuration

bmd supports project-level configuration via `bmd.config.yaml`.

## Config File Location

Place `bmd.config.yaml` in your project root (current working directory).

## Merge Precedence

```
defaults < config file < CLI flags
```

CLI flags always win. Config file values override built-in defaults.

## Full Reference

```yaml
# Terminal rendering
width: auto          # positive integer or "auto" (terminal columns)
ansi: auto           # "auto", "on", or "off"
pager: true          # boolean — auto-page if output exceeds terminal height
theme: ""            # theme spec: "syn:dracula+md:dark"
unsafe_html: false   # boolean — allow raw HTML in output
unicode: true        # boolean — enable invisible/ambiguous Unicode highlighting

# Template expansion
templates:
  enabled: true      # false to disable globally (same effect as CLI --no-templates)
  map: ""            # optional path to a YAML map file
  auto_map: false    # discover paired .yaml/.yml for .t source files
  list_spec: "join/, /" # optional operator pipeline for unterminated lists

# Browser preview server
serve:
  host: localhost    # bind address
  port: 3000         # listen port
  open: true         # auto-open browser
  mode: both         # editor | preview | both
  color_mode: auto   # day | night | auto
  readonly: false    # disable browser editing

# Browser editor undo/redo
undo:
  group_delay: 500   # milliseconds before adjacent edits become separate undo entries
  depth: 200         # maximum undo history depth
```

## ANSI Detection

Priority order for ANSI color output:

1. `--ansi` / `--no-ansi` CLI flag (highest)
2. `NO_COLOR` environment variable
3. TTY detection (lowest)

## Template Map Resolution

Template values are resolved with this precedence:

```
--var > --map > templates.map > auto_map
```

`--map` and `templates.map` point to YAML files whose top-level value must be a mapping. `--var KEY=VALUE` overrides are parsed as single-line YAML and deep-merged on top.

Auto-map discovery is opt-in. It only runs when `templates.auto_map: true`, templating is enabled, and the source file has a `.t` extension. `README.t` looks for `README.yaml` first, then `README.yml`, in the same directory. There is no implicit search for `bmd.map.yaml`.

If no values source is available, templating still runs with an empty map and unresolved expressions are kept as literal text.

`templates.enabled: false` and `--no-templates` disable template expansion in the render pipeline. Explicit map loading can still be used by commands that only resolve values, but disabled templating means expressions are not expanded during rendering.

## Example Config

See `bmd.config.example.yaml` in the repository root for a fully commented example.
