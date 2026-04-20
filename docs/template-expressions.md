# Template Expressions

## Overview

`bmd` integrates a template engine as the first stage of the render pipeline. Template expressions in Markdown source are expanded against a YAML map file before Markdown parsing. Templating is enabled by default and can be disabled with `--no-templates` or via config.

Purpose:

- define the expression syntax, operators, and map-file contract for template expansion in `bmd`
- provide a complete operator reference with semantics, argument rules, and examples

Audience:

- users authoring Markdown with template expressions
- implementers extending the operator registry

In scope:

- expression syntax and parsing rules
- operator definitions and behavior
- map file format and field resolution
- pipeline position and CLI integration

Non-goals:

- Markdown rendering semantics (see the main spec)
- CLI flag reference beyond template-specific flags
- theme or serve configuration

## Terms

| Term             | Meaning                                                                              |
| ---------------- | ------------------------------------------------------------------------------------ |
| expression       | a `{{...}}` delimited template in Markdown source                                    |
| field            | a named key resolved against the map; supports dot-path traversal                    |
| default          | a fallback value specified with `:-` when a field is missing or null                 |
| pipeline         | a chain of operators applied left-to-right to a resolved value                       |
| operator         | a named function that transforms a value; may accept slash-delimited arguments       |
| map              | a YAML object binding field names to values                                          |
| dot-path         | nested field access via `.` separators (e.g., `user.name` resolves `map.user.name`) |
| string operator  | an operator that works on string values and auto-maps over lists                     |
| list terminator  | an operator that collapses a list into a string (`join`, `lines`)                    |

## Expression Syntax

Template expressions are delimited by `{{` and `}}`.

| Form                        | Meaning                                    |
| --------------------------- | ------------------------------------------ |
| `{{FIELD}}`                 | substitute the value of `FIELD`            |
| `{{FIELD:-DEFAULT}}`        | use `DEFAULT` when `FIELD` is missing/null |
| `{{FIELD\|op1\|op2/A/B/}}` | apply operators left-to-right to the value |

Field names match `[A-Za-z_][A-Za-z0-9_.]*`. Dots are always treated as nested path traversal.

Whitespace inside delimiters is trimmed: `{{ NAME }}` resolves the same as `{{NAME}}`.

### Escape Sequences

Backslash escapes are supported in defaults and operator arguments:

| Escape | Result          |
| ------ | --------------- |
| `\n`   | newline         |
| `\t`   | tab             |
| `\r`   | carriage return |
| `\\`   | literal `\`     |
| `\/`   | literal `/`     |
| `\|`   | literal `\|`    |

Unknown escapes are preserved literally as `\` + char.

### Pipeline Parsing

Pipelines are split on unescaped `|`. Each segment is an operator invocation. Operator arguments are slash-delimited: `op/ARG1/ARG2/`. A trailing `/` is optional.

```
{{NAME:-World|lower|tr/o/a/|upper}}
```

Parses as:

1. Field: `NAME`, default: `World`
1. Pipeline: `lower` then `tr` (args: `o`, `a`) then `upper`

### Missing Values

When a field is absent and has no default, the raw `{{FIELD}}` expression is kept as literal text.

When a field resolves to an empty string (`""`, `null`, or empty default `{{X:-}}`), surrounding whitespace is compressed: `"The {{BLANK}} fox"` with `BLANK=""` produces `"The fox"` (double space collapsed to single).

### Forgiving Parsing

Malformed expressions (e.g., `{{bad!name}}`, `{{unterminated`) and unknown operators (e.g., `{{X|nope}}`) are kept as literal text. The engine does not have a strict mode.

## Operators

All operators receive a value (string, number, array, object, or null) and a list of string arguments. All operators produce strings.

String operators (`upper`, `lower`, `camel`, `proper`, `tr`) auto-map over arrays, preserving the list container for downstream operators. List terminators (`join`, `lines`) collapse a list into a string.

| Operator            | Args | Behavior                                  |
| ------------------- | ---- | ----------------------------------------- |
| `upper`             | 0    | uppercase the string form                 |
| `lower`             | 0    | lowercase the string form                 |
| `camel`             | 0    | convert to lowerCamelCase                 |
| `proper`            | 0    | convert to Title Case                     |
| `tr/FROM/TO/`       | 2    | character-by-character translation         |
| `join/DELIM/`       | 1-3  | join list items with delimiter            |
| `lines/PREFIX/SUFFIX/` | 0-2 | render each list item as a line        |
| `subst/.../`        | 1, 2, or 4 | prefix/suffix each list item, preserving the list |

### Testing Operators with `bmd eval`

`bmd eval` is useful for testing the operator portion of a template expression against stdin. `bmd meval` does the same for a single multi-line YAML value.

These commands do not resolve `FIELD` names or defaults. Feed them the value that would be produced after field lookup, then pass only the pipeline portion of the expression.

```sh
# {{NAME|upper}}
printf 'hello world\n' | bmd eval upper
# HELLO WORLD

# {{TITLE|proper|tr/ /-/}}
printf 'hello world\n' | bmd eval 'proper|tr/ /-/'
# Hello-World

# {{ITEMS|join/, /}}
printf '[alpha, bravo, charlie]\n' | bmd eval 'join/, /'
# alpha, bravo, charlie

# {{ITEMS|lines/- /}} with multi-line YAML input
printf -- '- alpha\n- bravo\n- charlie\n' | bmd meval 'lines/- /'
# - alpha
# - bravo
# - charlie
```

### Scaffolding a Map with `bmd info`

Use `bmd info` to extract all referenced template fields from a file and emit a YAML mapping skeleton with default empty-string values. The output is suitable for `-m/--map`.

```sh
bmd info README.md > map.yaml
```

### Expanding Templates Only with `bmd map`

Use `bmd map` when you want template expansion output as Markdown text, without terminal rendering.

```sh
bmd map -m map.yaml README.md
```

### `upper`

Uppercase the string form of the value.

```
{{NAME|upper}}  with "hello"  →  "HELLO"
```

### `lower`

Lowercase the string form of the value.

```
{{NAME|lower}}  with "HELLO"  →  "hello"
```

### `camel`

Convert to lowerCamelCase using word splitting.

Word-splitting algorithm:

1. Replace runs of `[^0-9A-Za-z]+` with space.
1. Insert space between `([a-z0-9])([A-Z])` (lower-to-upper boundary).
1. Insert space between `([A-Z]+)([A-Z][a-z])` (acronym boundary).
1. Split on whitespace, discard empty.

Transform: first word is lowercased entirely; subsequent words have their first character uppercased, remainder lowercased.

| Input              | Output           |
| ------------------ | ---------------- |
| `"hello world"`    | `"helloWorld"`   |
| `"HTTP server"`    | `"httpServer"`   |
| `"HTTPServer"`     | `"httpServer"`   |
| `"already-camel"`  | `"alreadyCamel"` |
| `"one"`            | `"one"`          |
| `""`               | `""`             |

### `proper`

Convert to Title Case using the same word-splitting algorithm as `camel`.

Each word is title-cased (first char upper, rest lower), except all-uppercase words with length > 1 are preserved as-is.

| Input              | Output            |
| ------------------ | ----------------- |
| `"hello world"`    | `"Hello World"`   |
| `"HTTP server"`    | `"HTTP Server"`   |
| `"HTTPServer"`     | `"HTTP Server"`   |
| `"already-camel"`  | `"Already Camel"` |

### `tr/FROM/TO/`

Character-by-character translation (like Unix `tr`). `FROM` and `TO` must have the same length. Mismatched lengths keep the original expression as literal text and emit a warning.

| Input      | Args          | Output     |
| ---------- | ------------- | ---------- |
| `"abc"`    | `"abc","xyz"` | `"xyz"`    |
| `"a1b2c3"` | `"abc","xyz"` | `"x1y2z3"` |
| `"hello"`  | `"lo","LO"`   | `"heLLO"`  |

### `join/DELIM/`

Join list-like values with a delimiter.

List coercion: arrays use items directly; scalars are treated as single-item lists; `null`/undefined produces an empty list.

| Arg count | Interpretation                                                          |
| --------- | ----------------------------------------------------------------------- |
| 1         | `join/DELIM/` — join items with delimiter                               |
| 3         | `join/PREFIX/DELIM/SUFFIX/` — prefix + items joined by delim + suffix   |

In the 3-arg form, an empty list returns `""` (prefix and suffix are not emitted).

| Input           | Expression             | Output        |
| --------------- | ---------------------- | ------------- |
| `["a","b","c"]` | `join/, /`             | `"a, b, c"`   |
| `["a","b"]`     | `join//`               | `"ab"`        |
| `"solo"`        | `join/, /`             | `"solo"`      |
| `null`          | `join/, /`             | `""`          |
| `[]`            | `join/, /`             | `""`          |
| `["a","b"]`     | `join/[/, /]/`         | `"[a, b]"`   |
| `[]`            | `join/[/, /]/`         | `""`          |

### `lines/PREFIX/SUFFIX/`

Render each item in a list as a line: `PREFIX + item + SUFFIX`, joined with `\n`.

List coercion follows the same rules as `join`.

| Arg count | Interpretation                                      |
| --------- | --------------------------------------------------- |
| 0         | one item per line                                   |
| 1         | `lines/PREFIX/` — prefix each item                  |
| 2         | `lines/PREFIX/SUFFIX/` — prefix and suffix each item |

```
{{ITEMS|lines/  - /,/}}  with ["a","b","c"]  →
  - a,
  - b,
  - c,
```

### `subst/.../`

Prefix/suffix each list item while preserving the list for downstream operators or `list_spec` formatting.

| Arg count | Interpretation                                          |
| --------- | ------------------------------------------------------- |
| 1         | `subst/PREFIX/` — prefix each item                      |
| 2         | `subst/PREFIX/SUFFIX/` — prefix and suffix each item    |
| 4         | `subst/PREFIX/SUFFIX/LAST_PREFIX/LAST_SUFFIX/` — use the last pair for the final item |

Because `subst` returns a list, an unterminated `{{ITEMS|subst/- /}}` expression is formatted by `list_spec` (`join/, /` by default). Add `join` or `lines` when you want explicit output formatting.

| Input       | Args                       | Output                     |
| ----------- | -------------------------- | -------------------------- |
| `["a","b"]` | `["- "]`                   | `["- a","- b"]`            |
| `["a","b"]` | `["- ", ";"]`              | `["- a;","- b;"]`          |
| `["a","b","c"]` | `["- ", ", ", "- ", "."]` | `["- a, ","- b, ","- c."]` |

### Stringify Rules

Values that are not strings are converted: `null`/`undefined` produce `""`; all other types use `String(value)`.

## Map File

Template fields are bound via a YAML map file.

```yaml
# values.yaml
NAME: World
VERSION: 1.2.3
ITEMS:
  - alpha
  - bravo
  - charlie
user:
  name: "Alice"
  role: "admin"
```

The top-level value must be a mapping (object). Non-mapping top-level values raise an error at load time.

### Discovery

There is no implicit global `bmd.map.yaml` search. Values can come from:

1. `--var KEY=VALUE` overrides
2. `--map values.yaml`
3. `templates.map` in `bmd.config.yaml`
4. `templates.auto_map: true` for paired `.t` files

Auto-map discovery only applies to source files ending in `.t`. `README.t` looks for `README.yaml`, then `README.yml`, in the same directory. If no map file is found, templating runs with an empty map and unresolved expressions are kept as literal text.

### CLI Overrides

`--var KEY=VALUE` overrides are applied after YAML loading. VALUE is parsed as single-line YAML:

| Example                                  | Type    |
| ---------------------------------------- | ------- |
| `--var COUNT=42`                         | number  |
| `--var FLAG=true`                        | boolean |
| `--var NAME=hello`                       | string  |
| `--var ITEMS=[alpha, bravo, charlie]`    | array   |
| `--var user={name: Alice, role: admin}`  | object  |
| `--var LABEL="true"`                     | string  |

Multiline values belong in the map file using YAML block scalars (`|` for literal, `>` for folded).

## Pipeline Integration

Template expansion is the first stage in the render pipeline, before Markdown parsing:

```
input → [template expansion] → sanitize/parse → transform → render → output
```

Templates can produce arbitrary Markdown. A `{{CHART}}` field could expand to a fenced mermaid block.

The preview pipeline tracks template replacement regions for browser highlighting, then decodes those markers before Markdown parsing so marker bytes do not leak into rendered output.

In the `serve` command, template expansion re-runs on file change events and on watched map-file change events. The source file is never modified.

### Template Flags

These flags apply to `render`, `serve`, `map`, and `table`:

| Flag               | Short | Description                          | Default             |
| ------------------ | ----- | ------------------------------------ | ------------------- |
| `--no-templates`   |       | disable template expansion           | off (enabled)       |
| `--map <PATH>`     | `-m`  | YAML map file for template fields    | (none)              |
| `--var KEY=VALUE`  |       | override a single value (repeatable) | (none)              |

### Config

`bmd.config.yaml` supports a `templates` section:

```yaml
templates:
  enabled: true       # false to disable globally
  map: values.yaml    # optional YAML map file
  auto_map: false     # true: README.t discovers README.yaml/README.yml
  list_spec: "join/, /" # optional formatter for unterminated list results
```

Merge order is defaults → config file → CLI. For templates, only `--no-templates` changes behavior relative to config: it forces `templates.enabled` off. Omitting that flag leaves `templates.enabled` from config (or the default `true` when unset).

## Dot-Path Traversal

Dots in field names are always treated as nested path traversal.

| Template        | Map                       | Output              |
| --------------- | ------------------------- | ------------------- |
| `{{user.name}}` | `{user: {name: "Alice"}}` | `"Alice"`           |
| `{{a.b.c}}`     | `{a: {b: {c: "deep"}}}`  | `"deep"`            |
| `{{a.b.c}}`     | `{a: {b: 42}}`           | kept (missing path) |
| `{{a.b}}`       | `{a: {b: {c: "deep"}}}`  | kept (non-scalar)   |

Flat keys with literal dots are not supported. Restructure the map to use nesting.
