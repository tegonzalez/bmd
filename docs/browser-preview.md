# Browser Preview

`bmd serve` launches a local server with a split editor/preview UI.

## Quick Start

```sh
bmd serve README.md
bmd serve --port 8080 --mode preview README.md
```

The server opens your default browser automatically. Disable with `--no-open`.

## Options

| Flag              | Short | Description                          | Default     |
| ----------------- | ----- | ------------------------------------ | ----------- |
| `--host <ADDR>`   |       | Address to bind                      | `localhost` |
| `--port <N>`      | `-p`  | Port to listen on                    | `3000`      |
| `--mode <MODE>`   |       | `editor`, `preview`, or `both`       | `both`      |
| `--color-mode`    |       | `day`, `night`, or `auto`            | `auto`      |
| `--readonly`      |       | Disable editing in the browser       | `false`     |
| `--open`/`--no-open` |    | Auto-open browser on start           | `true`      |
| `--map <PATH>`    | `-m`  | YAML map file for template values    | (none)      |
| `--var KEY=VALUE` |       | Override a template value            | (none)      |
| `--no-templates`  |       | Disable template expansion           | off         |
| `--unsafe-html`   |       | Allow raw HTML rendering             | off         |

Config file equivalents in `bmd.config.yaml`:

```yaml
serve:
  host: localhost
  port: 3000
  open: true
  mode: both
  color_mode: auto
  readonly: false
```

## View Modes

- **both** — split view with editor on the left and rendered preview on the right. A draggable divider separates the panes. Divider position persists in `localStorage`.
- **editor** — editor only, full width.
- **preview** — rendered preview only, full width.

## Live Reload

The server watches the source file and any template map file for changes. Edits in the browser editor sync via Yjs CRDT — multiple browser tabs share the same document state.

File changes from disk (external editor saves) appear as undoable operations in the browser editor with diff highlighting showing what changed.

## Connection Status

A colored dot in the bottom-left corner of the editor indicates connection state:

| Color  | State        | Meaning                                           |
| ------ | ------------ | ------------------------------------------------- |
| Green  | Connected    | WebSocket active, real-time sync operational      |
| Yellow | Reconnecting | Connection lost, attempting reconnect with backoff|
| Red    | Disconnected | Connection failed after max retries               |

Edits made while offline are preserved and reconciled when the connection is restored.

## Undo/Redo

The editor supports full undo/redo with toolbar buttons showing operation depth as tooltips (e.g., "3 undos available"). External file changes are captured as undoable deltas with diff decoration highlighting.

## Templates in Serve

Template expansion runs on every file change. When values come from `--map`, `templates.map`, or `templates.auto_map`, changes to that map file also trigger a re-render. The `--map`, `--var`, and `--no-templates` flags work the same as in `bmd render`.

## HTML Safety

By default, raw HTML in Markdown is stripped (sanitized via DOMPurify). Use `--unsafe-html` to allow raw HTML rendering in the preview.
