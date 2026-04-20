# Themes

bmd uses a five-facet theme system. Each facet controls a different rendering surface.

## Facets

| Facet | Controls                            | Directory       |
| ----- | ----------------------------------- | --------------- |
| `syn` | Syntax highlighting colors          | `themes/syn/`   |
| `md`  | Markdown element styles (terminal)  | `themes/md/`    |
| `mer` | Mermaid diagram colors              | `themes/mer/`   |
| `web` | Browser preview UI colors           | `themes/web/`   |
| `unic`| Unicode detection glyph styles      | `themes/unic/`  |

## Usage

Themes are specified with a composable spec string. Combine facets with `+`:

```sh
# Use dracula syntax + dark markdown
bmd --theme "syn:dracula+md:dark" README.md

# Only override syntax theme
bmd --theme "syn:light" README.md
```

Omitted facets use the built-in defaults from `src/theme/defaults.ts`.

Set a default theme in `bmd.config.yaml`:

```yaml
theme: "syn:dracula+md:dark"
```

## Bundled Themes

| Facet | Themes                    |
| ----- | ------------------------- |
| `syn` | `dark`, `light`, `dracula`|
| `md`  | `dark`, `light`           |
| `mer` | `dark`, `light`, `dracula`|
| `web` | `dark`, `light`           |
| `unic`| `default`                 |

List theme facets (names only):

```sh
bmd themes
```

Add **`-a`** (or **`--all`**) for a terminal table of every facet with bundled and project-local theme names (same columns as above). See **`bmd themes --help`**.

```sh
bmd themes -a
```

## Markdown Theme Properties

The `md` facet controls terminal element rendering:

```yaml
# themes/md/dark.yaml
headings:
  1: { bold: true, color: "#00ffff" }
  2: { bold: true, color: "#00ff00" }
  3: { bold: true, color: "#ffff00" }
  4: { bold: true, color: "#5f87ff" }
  5: { bold: true, color: "#ff00ff" }
  6: { bold: true, color: "#ffffff" }
codeBlockIndent: 4
blockquoteBarChar: "|"
tableBorder: true
listBullets: ["*", "-", "+"]
linkFormat: "inline"
hrChar: "-"
hrWidth: "full"
elementSpacing: 1
boldColor: "#ffffff"
codeColor: "#808080"
blockquoteBarColor: "#808080"
linkColor: "#5f87ff"
```

Colors accept hex strings (`"#rrggbb"`). Heading levels 1–6 each have `bold` (boolean) and `color` (hex string).

## Unicode Theme Properties

The `unic` facet controls per-category styling for invisible character glyph substitutions:

```yaml
# themes/unic/default.yaml
zero-width:
  fg: "#e06c75"
bidi:
  fg: "#e5c07b"
  bg: "#3e3022"
  bold: true
template-region:
  fg: "#60a5fa"
  bg: "#1e293b"
template-unresolved:
  fg: "#94a3b8"
  bg: "#1e293b"
tag:
  fg: "#c678dd"
c0-control:
  fg: "#e06c75"
ansi-escape:
  fg: "#e06c75"
  bg: "#2c1a1a"
  bold: true
whitespace:
  fg: "#7f848e"
pua:
  fg: "#c678dd"
ai-watermark:
  fg: "#61afef"
```

Each category accepts style fields `fg` (hex), `bg` (hex), `bold` (boolean), and `underline` (boolean). Categories can also set aggregation fields: `mode` (`region`, `aggregate`, or `none`), `threshold`, `closer`, and `glyphs`.

The unicode facet must define all detection categories:

`zero-width`, `bidi`, `template-region`, `template-unresolved`, `tag`, `c0-control`, `c1-control`, `ansi-escape`, `whitespace`, `pua`, `ai-watermark`, `variation-sel`, `annotation`, `deprecated`, `noncharacter`, `separator`, `combining-flood`, and `unclassified`.

## Creating Custom Themes

1. Create a YAML file in the appropriate `themes/<facet>/` directory or in `.bmd/themes/<facet>/` for project-local themes.
2. Name it `<theme-name>.yaml`.
3. Include all required properties for the facet (see bundled themes for reference).
4. Use it with `--theme "facet:theme-name"`.

### Project-Local Themes

Place custom themes in `.bmd/themes/<facet>/` at your project root:

```
.bmd/themes/
  syn/
    corporate.yaml
  md/
    corporate.yaml
```

Then use them:

```sh
bmd --theme "syn:corporate+md:corporate" README.md
```

Project-local themes override bundled themes when names collide.
