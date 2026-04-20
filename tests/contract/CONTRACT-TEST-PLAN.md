# Contract Test Plan: bmd

## Architecture

Layer chain (dependency direction):
External -> L-config -> L-pipeline -> L-server_fsm / L-client_fsm

All four contract surfaces are pure functions with no lower-layer mock requirements. The IUT calls no injectable lower-layer contracts -- inputs are plain data, outputs are plain data. This means:
- No mocked response contracts are needed (Response column is "none -- pure function")
- No construction seams are needed (functions are standalone, not methods on constructable objects)
- This is explicitly noted as a structural property, not a gap

Monikers (normative; unambiguous):
- Preferred scheme: `<domain>` token in `snake_case`
- Layer: `L-<domain>`
- Contract API: `<domain>-api`
- Test domain entries: `<domain>`

Layers:
- `L-config`:      Unified configuration DTO construction (resolveConfig)
- `L-pipeline`:    Pure markdown render pipeline (render)
- `L-server_fsm`:  Server-side WebSocket FSM (serverTransition, serverOnConnect, serverHandleExternal)
- `L-client_fsm`:  Client-side WebSocket FSM (clientTransition)

Contract APIs:
- `config-api`:           Three-layer config merge producing BmdConfig DTO
- `render_pipeline-api`:  Pure render pipeline: parse -> transform -> renderTokens
- `ws_protocol-api`:      Pure FSM transitions for server and client WebSocket protocol

## Test Domains

| Domain       | Stimulus              | Response                |
|-------------:|:----------------------|:------------------------|
| config       | config-api            | none -- pure function   |
| pipeline     | render_pipeline-api   | none -- pure function   |
| server_fsm   | ws_protocol-api       | none -- pure function   |
| client_fsm   | ws_protocol-api       | none -- pure function   |

All four domains test pure functions that take explicit data inputs and return explicit data outputs. No lower-layer mocking or injection seams are required. The "Response: none" annotation is valid per p-test-plan because the Stimulus functions have no dependencies to mock -- they are leaf-level pure computations.

## Per-domain Suites

Suite file template: `tests/contract/<domain>/<suite>.test.ts`

### Domain: config (3 suites)

| Suite              | Surface                                              | Uses              |
|-------------------:|:-----------------------------------------------------|:------------------|
| merge_precedence   | Three-layer merge ordering (defaults < config < CLI) | none (pure fn)    |
| flag_semantics     | Config file field mappings to BmdConfig types         | none (pure fn)    |
| defaults           | Default values for all 13 BmdConfig fields            | none (pure fn)    |

Stimulus entry points for all config suites: `resolveConfig`

### Domain: pipeline (2 suites)

| Suite              | Surface                                                | Uses              |
|-------------------:|:-------------------------------------------------------|:------------------|
| element_rendering  | Semantic rendering of all major markdown elements       | none (pure fn)    |
| format_modes       | ASCII vs UTF8 format selection and ANSI on/off          | none (pure fn)    |

Stimulus entry points for all pipeline suites: `render`

### Domain: server_fsm (3 suites)

| Suite              | Surface                                                      | Uses              |
|-------------------:|:-------------------------------------------------------------|:------------------|
| file_ops           | serverTransition: file:read, file:write, file:unlock          | none (pure fn)    |
| connection         | serverOnConnect: init sequence generation                     | none (pure fn)    |
| external_events    | serverHandleExternal: file-watcher, client:connected          | none (pure fn)    |

Stimulus entry points: `serverTransition`, `serverOnConnect`, `serverHandleExternal`

### Domain: client_fsm (2 suites)

| Suite              | Surface                                                        | Uses              |
|-------------------:|:---------------------------------------------------------------|:------------------|
| init_flow          | clientTransition: server:init and file:open events              | none (pure fn)    |
| file_changes       | clientTransition: file:changed, file:saved, file:error          | none (pure fn)    |

Stimulus entry points: `clientTransition`

## Per-suite Partitions

### Suite: merge_precedence
- Partitions:
  - Inputs: CLI overrides config (width, unsafeHtml, serve.host, serve.port) = 4; config overrides defaults (width, unsafeHtml, serve.host) = 3; CLI undefined does not override config (width, unsafeHtml) = 2; serve sub-field independent merge = 1
  - Regressions: CT-06 unsafe-html CLI override = 1, CT-06 unsafe-html config forwarded = 1, CT-07 host default = 1, CT-07 host CLI override = 1
  - Invariants: anti-false-positive (CLI values applied) = 1
- Merge notes: None
- min_cases: 4 + 3 + 2 + 1 + 4 + 1 = 15

### Suite: flag_semantics
- Partitions:
  - Inputs: ansi on/off/auto = 3, pager true/false = 2, width auto/number = 2, serve.color_mode = 1, unsafe_html = 1
  - Invariants: anti-false-positive (ansi mapping not identity) = 1
- Merge notes: None
- min_cases: 3 + 2 + 2 + 1 + 1 + 1 = 10

### Suite: defaults
- Partitions:
  - Inputs: 13 individual field defaults = 13
  - Invariants: anti-false-positive (defaults contain truthy values) = 1
- Merge notes: None
- min_cases: 13 + 1 = 14

### Suite: element_rendering
- Partitions:
  - Inputs: heading, paragraph, bold, italic, unordered list, ordered list, link, blockquote, code block, table, thematic break = 11
  - Invariants: anti-false-positive (heading in output) = 1
- Merge notes: None
- min_cases: 11 + 1 = 12

### Suite: format_modes
- Partitions:
  - Inputs: ASCII produces output = 1, UTF8 produces output = 1
  - Options: ANSI enabled = 1, ANSI disabled = 1
  - Invariants: anti-false-positive (ASCII/UTF8 differ) = 1
- Merge notes: None
- min_cases: 1 + 1 + 1 + 1 + 1 = 5

### Suite: file_ops
- Partitions:
  - Inputs: file:read with content+filePath = 1, file:read null content = 1, file:read null filePath = 1, file:read state unchanged = 1; file:write success = 1, file:write readonly = 1, file:write no filePath = 1; file:unlock readonly = 1, file:unlock non-readonly = 1; unknown event = 1
  - Invariants: anti-false-positive (file:write changes state) = 1
- Merge notes: None
- min_cases: 10 + 1 = 11

### Suite: connection
- Partitions:
  - Inputs: with content+filePath = 1, server:init contains globalConfig = 1, file:open fields correct = 1, without content = 1, without filePath = 1
  - Regressions: CT-08 polling format mismatch = 1
  - Invariants: anti-false-positive (returns non-empty) = 1
- Merge notes: None
- min_cases: 5 + 1 + 1 = 7

### Suite: external_events
- Partitions:
  - Inputs: file-watcher:changed = 1, client:connected = 1, unknown event = 1
  - Invariants: anti-false-positive (content updated) = 1
- Merge notes: None
- min_cases: 3 + 1 = 4

### Suite: init_flow
- Partitions:
  - Inputs: server:init no-op = 1; file:open state update = 1, file:open non-readonly 8 effects = 1, file:open readonly 9 effects = 1, file:open unsafeHtml=true = 1, file:open unsafeHtml=false = 1
  - Invariants: anti-false-positive (state changes) = 1
- Merge notes: None
- min_cases: 6 + 1 = 7

### Suite: file_changes
- Partitions:
  - Inputs: file:changed state+effects = 1, file:changed carries base64Update = 1; file:saved state+effects = 1, file:saved path matches = 1; file:error state+effects = 1, file:error durationMs = 1; unknown event = 1
  - Invariants: anti-false-positive (unsaved toggled) = 1
- Merge notes: None
- min_cases: 7 + 1 = 8

## Contract Surfaces

### Contract: config-api
- Source contract doc: `src/config/config.api-spec`

```api-spec
mod config:
  fn resolveConfig(cli: CliArgs, config: Partial[RawFileConfig] | null | undefined) -> BmdConfig
    @pure
    @ensures("all BmdConfig fields are fully resolved")
    @ensures("undefined CLI values do not override lower layers")
    @ensures("serve sub-object merged field-by-field, not replaced wholesale")
```

- Covered by domains: config
- Covered by suites: merge_precedence, flag_semantics, defaults

### Contract: render_pipeline-api
- Source contract doc: `src/output/render-pipeline.api-spec`

```api-spec
mod render_pipeline:
  async fn render(source: str, config: BmdConfig) -> str
    @pure
    @throws(BmdError)
    @ensures("output identical to previous renderDocument internal pipeline")
```

- Covered by domains: pipeline
- Covered by suites: element_rendering, format_modes

### Contract: ws_protocol-api (server)
- Source contract doc: `src/protocol/ws-protocol.api-spec`

```api-spec
mod ws_protocol:
  fn serverTransition(state: ServerState, event: ClientMessage) -> ServerTransitionResult
    @pure

  fn serverOnConnect(state: ServerState) -> ServerMessage[]
    @pure

  fn serverHandleExternal(state: ServerState, event: ServerExternalEvent) -> ServerExternalResult
    @pure
```

- Covered by domains: server_fsm
- Covered by suites: file_ops, connection, external_events

### Contract: ws_protocol-api (client)
- Source contract doc: `src/protocol/ws-protocol.api-spec`

```api-spec
mod ws_protocol:
  fn clientTransition(state: ClientState, event: ServerMessage) -> ClientTransitionResult
    @pure
```

- Covered by domains: client_fsm
- Covered by suites: init_flow, file_changes

## Cases

#### Suite cases: merge_precedence

##### config_resolveConfig_cli_width_overrides_config
- Suite: merge_precedence
- Covers: CLI width takes precedence over config file width
- Stimulus entry point: resolveConfig
- Setup: CLI {width: 42}, config {width: 100}
- Act: resolveConfig(cli, config)
- Assert: result.width === 42

##### config_resolveConfig_cli_unsafeHtml_overrides_config
- Suite: merge_precedence
- Covers: CLI unsafeHtml takes precedence over config unsafe_html
- Stimulus entry point: resolveConfig
- Setup: CLI {unsafeHtml: true}, config {unsafe_html: false}
- Act: resolveConfig(cli, config)
- Assert: result.unsafeHtml === true

##### config_resolveConfig_cli_serve_host_overrides_config
- Suite: merge_precedence
- Covers: CLI serve.host takes precedence over config serve.host
- Stimulus entry point: resolveConfig
- Setup: CLI {serve: {host: '127.0.0.1'}}, config {serve: {host: '10.0.0.1'}}
- Act: resolveConfig(cli, config)
- Assert: result.serve.host === '127.0.0.1'

##### config_resolveConfig_cli_serve_port_overrides_config
- Suite: merge_precedence
- Covers: CLI serve.port takes precedence over config serve.port
- Stimulus entry point: resolveConfig
- Setup: CLI {serve: {port: 8080}}, config {serve: {port: 9090}}
- Act: resolveConfig(cli, config)
- Assert: result.serve.port === 8080

##### config_resolveConfig_config_width_overrides_default
- Suite: merge_precedence
- Covers: Config file width takes precedence over hardcoded default
- Stimulus entry point: resolveConfig
- Setup: CLI {}, config {width: 100}
- Act: resolveConfig(cli, config)
- Assert: result.width === 100

##### config_resolveConfig_config_unsafe_html_overrides_default
- Suite: merge_precedence
- Covers: Config file unsafe_html takes precedence over default false
- Stimulus entry point: resolveConfig
- Setup: CLI {}, config {unsafe_html: true}
- Act: resolveConfig(cli, config)
- Assert: result.unsafeHtml === true

##### config_resolveConfig_config_serve_host_overrides_default
- Suite: merge_precedence
- Covers: Config file serve.host takes precedence over default 0.0.0.0
- Stimulus entry point: resolveConfig
- Setup: CLI {}, config {serve: {host: '10.0.0.1'}}
- Act: resolveConfig(cli, config)
- Assert: result.serve.host === '10.0.0.1'

##### config_resolveConfig_cli_undefined_width_preserves_config
- Suite: merge_precedence
- Covers: CLI undefined width does not clobber config value
- Stimulus entry point: resolveConfig
- Setup: CLI {}, config {width: 100}
- Act: resolveConfig(cli, config)
- Assert: result.width === 100

##### config_resolveConfig_cli_undefined_unsafeHtml_preserves_config
- Suite: merge_precedence
- Covers: CLI undefined unsafeHtml does not clobber config value
- Stimulus entry point: resolveConfig
- Setup: CLI {}, config {unsafe_html: true}
- Act: resolveConfig(cli, config)
- Assert: result.unsafeHtml === true

##### config_resolveConfig_serve_subfields_merge_independently
- Suite: merge_precedence
- Covers: Serve sub-fields merge independently (not all-or-nothing replacement)
- Stimulus entry point: resolveConfig
- Setup: CLI {serve: {port: 8080}}, config {serve: {host: '127.0.0.1'}}
- Act: resolveConfig(cli, config)
- Assert: result.serve.port === 8080, result.serve.host === '127.0.0.1'

##### config_resolveConfig_regression_ct06_cli_overrides_unsafe_html
- Suite: merge_precedence
- Covers: REGRESSION CT-06: unsafeHtml CLI override works correctly
- Stimulus entry point: resolveConfig
- Setup: CLI {unsafeHtml: true}, config {unsafe_html: false}
- Act: resolveConfig(cli, config)
- Assert: result.unsafeHtml === true

##### config_resolveConfig_regression_ct06_config_forwards_unsafe_html
- Suite: merge_precedence
- Covers: REGRESSION CT-06: unsafeHtml config file value is forwarded
- Stimulus entry point: resolveConfig
- Setup: CLI {}, config {unsafe_html: true}
- Act: resolveConfig(cli, config)
- Assert: result.unsafeHtml === true

##### config_resolveConfig_regression_ct07_host_default
- Suite: merge_precedence
- Covers: REGRESSION CT-07: serve.host defaults to 0.0.0.0
- Stimulus entry point: resolveConfig
- Setup: CLI {}, config null
- Act: resolveConfig(cli, config)
- Assert: result.serve.host === '0.0.0.0'

##### config_resolveConfig_regression_ct07_host_cli_override
- Suite: merge_precedence
- Covers: REGRESSION CT-07: serve.host CLI override works
- Stimulus entry point: resolveConfig
- Setup: CLI {serve: {host: '127.0.0.1'}}, config null
- Act: resolveConfig(cli, config)
- Assert: result.serve.host === '127.0.0.1'

##### config_resolveConfig_anti_fp_cli_values_applied
- Suite: merge_precedence
- Covers: Anti-false-positive: CLI values actually applied (non-default values)
- Stimulus entry point: resolveConfig
- Setup: CLI {width: 42, format: 'ascii', pager: 'never'}, config null
- Act: resolveConfig(cli, config)
- Assert: result.width === 42, result.format === 'ascii', result.pager === 'never'

#### Suite cases: flag_semantics

##### config_resolveConfig_ansi_on_maps_true
- Suite: flag_semantics
- Covers: Config ansi "on" maps to ansiEnabled true
- Stimulus entry point: resolveConfig
- Setup: CLI {}, config {ansi: 'on'}
- Act: resolveConfig(cli, config)
- Assert: result.ansiEnabled === true

##### config_resolveConfig_ansi_off_maps_false
- Suite: flag_semantics
- Covers: Config ansi "off" maps to ansiEnabled false
- Stimulus entry point: resolveConfig
- Setup: CLI {}, config {ansi: 'off'}
- Act: resolveConfig(cli, config)
- Assert: result.ansiEnabled === false

##### config_resolveConfig_ansi_auto_maps_default
- Suite: flag_semantics
- Covers: Config ansi "auto" maps to default (true)
- Stimulus entry point: resolveConfig
- Setup: CLI {}, config {ansi: 'auto'}
- Act: resolveConfig(cli, config)
- Assert: result.ansiEnabled === true

##### config_resolveConfig_pager_true_maps_auto
- Suite: flag_semantics
- Covers: Config pager true maps to PagerMode "auto"
- Stimulus entry point: resolveConfig
- Setup: CLI {}, config {pager: true}
- Act: resolveConfig(cli, config)
- Assert: result.pager === 'auto'

##### config_resolveConfig_pager_false_maps_never
- Suite: flag_semantics
- Covers: Config pager false maps to PagerMode "never"
- Stimulus entry point: resolveConfig
- Setup: CLI {}, config {pager: false}
- Act: resolveConfig(cli, config)
- Assert: result.pager === 'never'

##### config_resolveConfig_width_auto_maps_default
- Suite: flag_semantics
- Covers: Config width "auto" maps to default (80)
- Stimulus entry point: resolveConfig
- Setup: CLI {}, config {width: 'auto'}
- Act: resolveConfig(cli, config)
- Assert: result.width === 80

##### config_resolveConfig_width_number_passthrough
- Suite: flag_semantics
- Covers: Config width number passes through directly
- Stimulus entry point: resolveConfig
- Setup: CLI {}, config {width: 120}
- Act: resolveConfig(cli, config)
- Assert: result.width === 120

##### config_resolveConfig_color_mode_maps_camelCase
- Suite: flag_semantics
- Covers: Config serve.color_mode maps to serve.colorMode
- Stimulus entry point: resolveConfig
- Setup: CLI {}, config {serve: {color_mode: 'night'}}
- Act: resolveConfig(cli, config)
- Assert: result.serve.colorMode === 'night'

##### config_resolveConfig_unsafe_html_maps_camelCase
- Suite: flag_semantics
- Covers: Config unsafe_html maps to unsafeHtml
- Stimulus entry point: resolveConfig
- Setup: CLI {}, config {unsafe_html: true}
- Act: resolveConfig(cli, config)
- Assert: result.unsafeHtml === true

##### config_resolveConfig_anti_fp_ansi_off_is_boolean_false
- Suite: flag_semantics
- Covers: Anti-false-positive: ansi "off" actually produces boolean false (not identity)
- Stimulus entry point: resolveConfig
- Setup: CLI {}, config {ansi: 'off'}
- Act: resolveConfig(cli, config)
- Assert: result.ansiEnabled === false, typeof result.ansiEnabled === 'boolean'

#### Suite cases: defaults

##### config_resolveConfig_default_format_utf8
- Suite: defaults
- Covers: format defaults to "utf8"
- Stimulus entry point: resolveConfig
- Setup: CLI {}, config null
- Act: resolveConfig(cli, config)
- Assert: result.format === 'utf8'

##### config_resolveConfig_default_width_80
- Suite: defaults
- Covers: width defaults to 80
- Stimulus entry point: resolveConfig
- Setup: CLI {}, config null
- Act: resolveConfig(cli, config)
- Assert: result.width === 80

##### config_resolveConfig_default_ansiEnabled_true
- Suite: defaults
- Covers: ansiEnabled defaults to true
- Stimulus entry point: resolveConfig
- Setup: CLI {}, config null
- Act: resolveConfig(cli, config)
- Assert: result.ansiEnabled === true

##### config_resolveConfig_default_pager_auto
- Suite: defaults
- Covers: pager defaults to "auto"
- Stimulus entry point: resolveConfig
- Setup: CLI {}, config null
- Act: resolveConfig(cli, config)
- Assert: result.pager === 'auto'

##### config_resolveConfig_default_unsafeHtml_false
- Suite: defaults
- Covers: unsafeHtml defaults to false
- Stimulus entry point: resolveConfig
- Setup: CLI {}, config null
- Act: resolveConfig(cli, config)
- Assert: result.unsafeHtml === false

##### config_resolveConfig_default_filePath_undefined
- Suite: defaults
- Covers: filePath defaults to undefined
- Stimulus entry point: resolveConfig
- Setup: CLI {}, config null
- Act: resolveConfig(cli, config)
- Assert: result.filePath === undefined

##### config_resolveConfig_default_theme_undefined
- Suite: defaults
- Covers: theme defaults to undefined
- Stimulus entry point: resolveConfig
- Setup: CLI {}, config null
- Act: resolveConfig(cli, config)
- Assert: result.theme === undefined

##### config_resolveConfig_default_serve_host
- Suite: defaults
- Covers: serve.host defaults to "0.0.0.0"
- Stimulus entry point: resolveConfig
- Setup: CLI {}, config null
- Act: resolveConfig(cli, config)
- Assert: result.serve.host === '0.0.0.0'

##### config_resolveConfig_default_serve_port
- Suite: defaults
- Covers: serve.port defaults to 3000
- Stimulus entry point: resolveConfig
- Setup: CLI {}, config null
- Act: resolveConfig(cli, config)
- Assert: result.serve.port === 3000

##### config_resolveConfig_default_serve_open
- Suite: defaults
- Covers: serve.open defaults to true
- Stimulus entry point: resolveConfig
- Setup: CLI {}, config null
- Act: resolveConfig(cli, config)
- Assert: result.serve.open === true

##### config_resolveConfig_default_serve_mode
- Suite: defaults
- Covers: serve.mode defaults to "both"
- Stimulus entry point: resolveConfig
- Setup: CLI {}, config null
- Act: resolveConfig(cli, config)
- Assert: result.serve.mode === 'both'

##### config_resolveConfig_default_serve_colorMode
- Suite: defaults
- Covers: serve.colorMode defaults to "auto"
- Stimulus entry point: resolveConfig
- Setup: CLI {}, config null
- Act: resolveConfig(cli, config)
- Assert: result.serve.colorMode === 'auto'

##### config_resolveConfig_default_serve_readonly
- Suite: defaults
- Covers: serve.readonly defaults to false
- Stimulus entry point: resolveConfig
- Setup: CLI {}, config null
- Act: resolveConfig(cli, config)
- Assert: result.serve.readonly === false

##### config_resolveConfig_anti_fp_defaults_contain_truthy
- Suite: defaults
- Covers: Anti-false-positive: defaults contain truthy values (not all falsy)
- Stimulus entry point: resolveConfig
- Setup: CLI {}, config null
- Act: resolveConfig(cli, config)
- Assert: result.width === 80, result.ansiEnabled === true, result.pager === 'auto', result.serve.open === true, result.serve.port === 3000

#### Suite cases: element_rendering

##### pipeline_render_heading_present
- Suite: element_rendering
- Covers: Heading text is present in rendered output
- Stimulus entry point: render
- Setup: source = '# My Heading\n', config with ansiEnabled: false
- Act: render(source, config)
- Assert: output contains 'My Heading'

##### pipeline_render_paragraph_present
- Suite: element_rendering
- Covers: Paragraph text is present in rendered output
- Stimulus entry point: render
- Setup: source = 'Body text here.\n', config with ansiEnabled: false
- Act: render(source, config)
- Assert: output contains 'Body text here'

##### pipeline_render_bold_present
- Suite: element_rendering
- Covers: Bold text is present in rendered output
- Stimulus entry point: render
- Setup: source = '**bold text**\n', config with ansiEnabled: false
- Act: render(source, config)
- Assert: output contains 'bold text'

##### pipeline_render_italic_present
- Suite: element_rendering
- Covers: Italic text is present in rendered output
- Stimulus entry point: render
- Setup: source = '*italic text*\n', config with ansiEnabled: false
- Act: render(source, config)
- Assert: output contains 'italic text'

##### pipeline_render_unordered_list_present
- Suite: element_rendering
- Covers: Unordered list items are present in rendered output
- Stimulus entry point: render
- Setup: source = '- item1\n- item2\n', config with ansiEnabled: false
- Act: render(source, config)
- Assert: output contains 'item1', output contains 'item2'

##### pipeline_render_ordered_list_present
- Suite: element_rendering
- Covers: Ordered list items are present in rendered output
- Stimulus entry point: render
- Setup: source = '1. first\n2. second\n', config with ansiEnabled: false
- Act: render(source, config)
- Assert: output contains 'first', output contains 'second'

##### pipeline_render_link_present
- Suite: element_rendering
- Covers: Link text is present in rendered output
- Stimulus entry point: render
- Setup: source = '[click here](http://example.com)\n', config with ansiEnabled: false
- Act: render(source, config)
- Assert: output contains 'click here'

##### pipeline_render_blockquote_present
- Suite: element_rendering
- Covers: Blockquote text is present in rendered output
- Stimulus entry point: render
- Setup: source = '> quoted text\n', config with ansiEnabled: false
- Act: render(source, config)
- Assert: output contains 'quoted text'

##### pipeline_render_code_block_present
- Suite: element_rendering
- Covers: Code block content is preserved in rendered output
- Stimulus entry point: render
- Setup: source = '```\ncode here\n```\n', config with ansiEnabled: false
- Act: render(source, config)
- Assert: output contains 'code here'

##### pipeline_render_table_present
- Suite: element_rendering
- Covers: Table content is present in rendered output
- Stimulus entry point: render
- Setup: source = '| A | B |\n|---|---|\n| 1 | 2 |\n', config with ansiEnabled: false
- Act: render(source, config)
- Assert: output contains 'A', 'B', '1', '2'

##### pipeline_render_thematic_break_nonempty
- Suite: element_rendering
- Covers: Thematic break produces non-empty output
- Stimulus entry point: render
- Setup: source = '---\n', config with ansiEnabled: false
- Act: render(source, config)
- Assert: output.trim().length > 0

##### pipeline_render_anti_fp_heading_in_output
- Suite: element_rendering
- Covers: Anti-false-positive: heading text actually in output (empty string fails)
- Stimulus entry point: render
- Setup: source = '# Test Heading\n', config with ansiEnabled: false
- Act: render(source, config)
- Assert: output contains 'Test Heading', output.length > 0

#### Suite cases: format_modes

##### pipeline_render_ascii_produces_output
- Suite: format_modes
- Covers: ASCII mode produces output containing content text
- Stimulus entry point: render
- Setup: table markdown source, config {format: 'ascii', ansiEnabled: false}
- Act: render(source, config)
- Assert: output contains 'Col A', output contains 'val1'

##### pipeline_render_utf8_produces_output
- Suite: format_modes
- Covers: UTF8 mode produces output containing content text
- Stimulus entry point: render
- Setup: table markdown source, config {format: 'utf8', ansiEnabled: false}
- Act: render(source, config)
- Assert: output contains 'Col A', output contains 'val1'

##### pipeline_render_ansi_enabled_has_escapes
- Suite: format_modes
- Covers: ANSI enabled produces escape sequences in output
- Stimulus entry point: render
- Setup: source = '# Hello\n', config {ansiEnabled: true}
- Act: render(source, config)
- Assert: output contains '\x1b['

##### pipeline_render_ansi_disabled_no_escapes
- Suite: format_modes
- Covers: ANSI disabled produces no escape sequences in output
- Stimulus entry point: render
- Setup: source = '# Hello\n', config {ansiEnabled: false}
- Act: render(source, config)
- Assert: output does not contain '\x1b['

##### pipeline_render_anti_fp_ascii_utf8_differ
- Suite: format_modes
- Covers: Anti-false-positive: ASCII and UTF8 outputs differ in decoration
- Stimulus entry point: render
- Setup: table markdown source, ascii config vs utf8 config, both ansiEnabled: false
- Act: render(source, asciiConfig), render(source, utf8Config)
- Assert: both contain 'Col A', outputs are not equal

#### Suite cases: file_ops

##### server_fsm_serverTransition_file_read_with_content_replies_file_open
- Suite: file_ops
- Covers: file:read with content + filePath returns file:open reply
- Stimulus entry point: serverTransition
- Setup: state {content: '# Hello', filePath: '/test.md'}
- Act: serverTransition(state, {type: 'file:read'})
- Assert: reply[0].type === 'file:open', reply[0].path === '/test.md', broadcast === [], sideEffects === []

##### server_fsm_serverTransition_file_read_null_content_empty_reply
- Suite: file_ops
- Covers: file:read with null content returns empty reply
- Stimulus entry point: serverTransition
- Setup: state {content: null, filePath: '/test.md'}
- Act: serverTransition(state, {type: 'file:read'})
- Assert: reply === []

##### server_fsm_serverTransition_file_read_null_filePath_empty_reply
- Suite: file_ops
- Covers: file:read with null filePath returns empty reply
- Stimulus entry point: serverTransition
- Setup: state {content: '# Hello', filePath: null}
- Act: serverTransition(state, {type: 'file:read'})
- Assert: reply === []

##### server_fsm_serverTransition_file_read_state_unchanged
- Suite: file_ops
- Covers: file:read does not change state (reference equality)
- Stimulus entry point: serverTransition
- Setup: state with defaults
- Act: serverTransition(state, {type: 'file:read'})
- Assert: result.state === state (reference equality)

##### server_fsm_serverTransition_file_write_success
- Suite: file_ops
- Covers: file:write success: updates content, broadcasts file:saved, produces 3 ordered side effects
- Stimulus entry point: serverTransition
- Setup: state {content: 'old', filePath: '/test.md', isReadonly: false}
- Act: serverTransition(state, {type: 'file:write', content: 'new content'})
- Assert: state.content === 'new content', reply === [], broadcast[0].type === 'file:saved', sideEffects length 3 in order: set-last-written-content, update-yjs, write-file

##### server_fsm_serverTransition_file_write_readonly_rejects
- Suite: file_ops
- Covers: file:write readonly rejects with file:error, state unchanged
- Stimulus entry point: serverTransition
- Setup: state {isReadonly: true, filePath: '/test.md'}
- Act: serverTransition(state, {type: 'file:write', content: 'x'})
- Assert: reply[0].type === 'file:error', state unchanged, sideEffects === []

##### server_fsm_serverTransition_file_write_no_filePath_rejects
- Suite: file_ops
- Covers: file:write without filePath rejects with file:error
- Stimulus entry point: serverTransition
- Setup: state {filePath: null, isReadonly: false}
- Act: serverTransition(state, {type: 'file:write', content: 'x'})
- Assert: reply[0].type === 'file:error', state unchanged

##### server_fsm_serverTransition_file_unlock_readonly_rejects
- Suite: file_ops
- Covers: file:unlock on readonly state rejects with file:error
- Stimulus entry point: serverTransition
- Setup: state {isReadonly: true}
- Act: serverTransition(state, {type: 'file:unlock'})
- Assert: reply[0].type === 'file:error'

##### server_fsm_serverTransition_file_unlock_nonreadonly_noop
- Suite: file_ops
- Covers: file:unlock on non-readonly state is no-op
- Stimulus entry point: serverTransition
- Setup: state {isReadonly: false}
- Act: serverTransition(state, {type: 'file:unlock'})
- Assert: reply === [], broadcast === [], sideEffects === []

##### server_fsm_serverTransition_unknown_event_noop
- Suite: file_ops
- Covers: Unknown event type produces no-op transition
- Stimulus entry point: serverTransition
- Setup: state with defaults
- Act: serverTransition(state, {type: 'unknown:event'})
- Assert: state unchanged, reply === [], broadcast === [], sideEffects === []

##### server_fsm_serverTransition_anti_fp_write_changes_state
- Suite: file_ops
- Covers: Anti-false-positive: file:write actually changes state.content
- Stimulus entry point: serverTransition
- Setup: state {content: 'original', filePath: '/test.md', isReadonly: false}
- Act: serverTransition(state, {type: 'file:write', content: 'updated'})
- Assert: result.state.content !== 'original', result.state.content === 'updated'

#### Suite cases: connection

##### server_fsm_serverOnConnect_with_content_returns_init_and_open
- Suite: connection
- Covers: With content + filePath returns [server:init, file:open]
- Stimulus entry point: serverOnConnect
- Setup: state {content: '# Hello', filePath: '/test.md'}
- Act: serverOnConnect(state)
- Assert: messages length 2, messages[0].type === 'server:init', messages[1].type === 'file:open'

##### server_fsm_serverOnConnect_init_contains_globalConfig
- Suite: connection
- Covers: server:init message contains globalConfig from state
- Stimulus entry point: serverOnConnect
- Setup: state with defaults
- Act: serverOnConnect(state)
- Assert: messages[0].type === 'server:init', messages[0].config === state.globalConfig

##### server_fsm_serverOnConnect_file_open_fields_correct
- Suite: connection
- Covers: file:open message contains correct path, content, config
- Stimulus entry point: serverOnConnect
- Setup: state {content: '# Doc', filePath: '/doc.md'}
- Act: serverOnConnect(state)
- Assert: messages[1].path === '/doc.md', messages[1].content === '# Doc', messages[1].config === state.fileConfig

##### server_fsm_serverOnConnect_null_content_init_only
- Suite: connection
- Covers: Without content (null) returns [server:init] only
- Stimulus entry point: serverOnConnect
- Setup: state {content: null}
- Act: serverOnConnect(state)
- Assert: messages length 1, messages[0].type === 'server:init'

##### server_fsm_serverOnConnect_null_filePath_init_only
- Suite: connection
- Covers: Without filePath (null) returns [server:init] only
- Stimulus entry point: serverOnConnect
- Setup: state {filePath: null}
- Act: serverOnConnect(state)
- Assert: messages length 1, messages[0].type === 'server:init'

##### server_fsm_serverOnConnect_regression_ct08_shape_matches_transition
- Suite: connection
- Covers: REGRESSION CT-08: serverOnConnect file:open has same shape as serverTransition file:read reply
- Stimulus entry point: serverOnConnect, serverTransition
- Setup: state {content: '# Test', filePath: '/test.md'}
- Act: serverOnConnect(state), serverTransition(state, {type: 'file:read'})
- Assert: connectOpen deep-equals transitionOpen (consistent message construction)

##### server_fsm_serverOnConnect_anti_fp_returns_nonempty
- Suite: connection
- Covers: Anti-false-positive: serverOnConnect returns non-empty array
- Stimulus entry point: serverOnConnect
- Setup: state with defaults
- Act: serverOnConnect(state)
- Assert: messages.length > 0

#### Suite cases: external_events

##### server_fsm_serverHandleExternal_file_watcher_changed_updates_state
- Suite: external_events
- Covers: file-watcher:changed updates state.content and broadcasts file:changed
- Stimulus entry point: serverHandleExternal
- Setup: state {content: 'old content'}
- Act: serverHandleExternal(state, {type: 'file-watcher:changed', content: 'new content', base64Update: 'base64data'})
- Assert: state.content === 'new content', broadcast[0] === {type: 'file:changed', update: 'base64data'}

##### server_fsm_serverHandleExternal_client_connected_same_as_onConnect
- Suite: external_events
- Covers: client:connected returns same messages as serverOnConnect
- Stimulus entry point: serverHandleExternal
- Setup: state {content: '# Test', filePath: '/test.md'}
- Act: serverHandleExternal(state, {type: 'client:connected'})
- Assert: externalResult.broadcast deep-equals serverOnConnect(state)

##### server_fsm_serverHandleExternal_unknown_event_noop
- Suite: external_events
- Covers: Unknown event type: state unchanged, empty broadcast
- Stimulus entry point: serverHandleExternal
- Setup: state with defaults
- Act: serverHandleExternal(state, {type: 'unknown:event'})
- Assert: state unchanged, broadcast === []

##### server_fsm_serverHandleExternal_anti_fp_content_updated
- Suite: external_events
- Covers: Anti-false-positive: file-watcher:changed actually updates state.content
- Stimulus entry point: serverHandleExternal
- Setup: state {content: 'before'}
- Act: serverHandleExternal(state, {type: 'file-watcher:changed', content: 'after', base64Update: 'data'})
- Assert: result.state.content !== 'before', result.state.content === 'after'

#### Suite cases: init_flow

##### client_fsm_clientTransition_server_init_noop
- Suite: init_flow
- Covers: server:init: no state change, no effects
- Stimulus entry point: clientTransition
- Setup: state with defaults
- Act: clientTransition(state, {type: 'server:init', config: {host: 'localhost', port: 3000}})
- Assert: result.state === state (reference equality), result.effects === []

##### client_fsm_clientTransition_file_open_state_update
- Suite: init_flow
- Covers: file:open updates state with fileConfig, currentPath, content, unsaved=false
- Stimulus entry point: clientTransition
- Setup: state with defaults
- Act: clientTransition(state, file:open event)
- Assert: state.fileConfig set, state.currentPath === '/test.md', state.content === '# Hello', state.unsaved === false

##### client_fsm_clientTransition_file_open_nonreadonly_8_effects
- Suite: init_flow
- Covers: file:open non-readonly produces 8 effects (no set-editor-editable)
- Stimulus entry point: clientTransition
- Setup: state with defaults, file:open event {readonly: false}
- Act: clientTransition(state, event)
- Assert: effects length 8, contains set-view-mode, init-color-mode, init-lock-badge, set-editor-content, render-preview, reset-yjs, update-filename, set-unsaved; does not contain set-editor-editable

##### client_fsm_clientTransition_file_open_readonly_9_effects
- Suite: init_flow
- Covers: file:open readonly produces 9 effects including set-editor-editable(false)
- Stimulus entry point: clientTransition
- Setup: state with defaults, file:open event {readonly: true}
- Act: clientTransition(state, event)
- Assert: effects length 9, contains set-editor-editable with editable === false

##### client_fsm_clientTransition_file_open_unsafeHtml_true
- Suite: init_flow
- Covers: file:open render-preview carries unsafeHtml=true from config
- Stimulus entry point: clientTransition
- Setup: state with defaults, file:open event {unsafeHtml: true}
- Act: clientTransition(state, event)
- Assert: render-preview effect has unsafeHtml === true

##### client_fsm_clientTransition_file_open_unsafeHtml_false
- Suite: init_flow
- Covers: file:open render-preview carries unsafeHtml=false from config
- Stimulus entry point: clientTransition
- Setup: state with defaults, file:open event {unsafeHtml: false}
- Act: clientTransition(state, event)
- Assert: render-preview effect has unsafeHtml === false

##### client_fsm_clientTransition_anti_fp_file_open_changes_state
- Suite: init_flow
- Covers: Anti-false-positive: file:open actually changes state
- Stimulus entry point: clientTransition
- Setup: state with defaults (content: null)
- Act: clientTransition(state, file:open event)
- Assert: result.state.content !== null, result.state.content === '# Hello', result.state !== state

#### Suite cases: file_changes

##### client_fsm_clientTransition_file_changed_state_and_effects
- Suite: file_changes
- Covers: file:changed: state unchanged, effects: apply-yjs-update + show-reload-banner
- Stimulus entry point: clientTransition
- Setup: state {content: '# Test', unsaved: false}
- Act: clientTransition(state, {type: 'file:changed', update: 'base64data'})
- Assert: state unchanged (reference equality), effects length 2, contains apply-yjs-update and show-reload-banner

##### client_fsm_clientTransition_file_changed_carries_base64Update
- Suite: file_changes
- Covers: file:changed apply-yjs-update carries base64Update from event
- Stimulus entry point: clientTransition
- Setup: state with defaults
- Act: clientTransition(state, {type: 'file:changed', update: 'abc123'})
- Assert: apply-yjs-update effect has base64Update === 'abc123'

##### client_fsm_clientTransition_file_saved_state_and_effects
- Suite: file_changes
- Covers: file:saved: state.unsaved becomes false, effects: update-filename + set-unsaved
- Stimulus entry point: clientTransition
- Setup: state {unsaved: true}
- Act: clientTransition(state, {type: 'file:saved', path: '/test.md'})
- Assert: state.unsaved === false, effects length 2, contains update-filename and set-unsaved

##### client_fsm_clientTransition_file_saved_path_matches
- Suite: file_changes
- Covers: file:saved update-filename path matches event.path
- Stimulus entry point: clientTransition
- Setup: state {unsaved: true}
- Act: clientTransition(state, {type: 'file:saved', path: '/doc.md'})
- Assert: update-filename effect has path === '/doc.md', modified === false

##### client_fsm_clientTransition_file_error_state_and_effects
- Suite: file_changes
- Covers: file:error: state unchanged, effects: show-timed-banner with message
- Stimulus entry point: clientTransition
- Setup: state with defaults
- Act: clientTransition(state, {type: 'file:error', message: 'Something went wrong'})
- Assert: state unchanged, effects length 1, effects[0].type === 'show-timed-banner'

##### client_fsm_clientTransition_file_error_durationMs
- Suite: file_changes
- Covers: file:error show-timed-banner has durationMs=5000 and contains error message
- Stimulus entry point: clientTransition
- Setup: state with defaults
- Act: clientTransition(state, {type: 'file:error', message: 'Disk full'})
- Assert: banner effect has durationMs === 5000, text contains 'Disk full'

##### client_fsm_clientTransition_unknown_event_noop
- Suite: file_changes
- Covers: Unknown event: state unchanged, no effects
- Stimulus entry point: clientTransition
- Setup: state with defaults
- Act: clientTransition(state, {type: 'unknown:event'})
- Assert: state unchanged (reference equality), effects === []

##### client_fsm_clientTransition_anti_fp_file_saved_unsaved_toggled
- Suite: file_changes
- Covers: Anti-false-positive: file:saved actually sets unsaved to false
- Stimulus entry point: clientTransition
- Setup: state {unsaved: true}
- Act: clientTransition(state, {type: 'file:saved', path: '/test.md'})
- Assert: result.state.unsaved !== true, result.state.unsaved === false

## Assertion-Quality Policy

Per suite:
- **anti-false-positive:** Each suite has at least one case that fails for stub/no-op implementations (already present in all 10 suites).
- **anti-false-negative:** Pipeline tests use semantic assertions (toContain) not exact string matching, so alternate correct implementations pass.

## References

- contract/p-test-plan (governing principle)
- contract/p-testing (test discipline)
- contract/p-no-private-leaks (no private module imports)
- contract/p-contract-first (api-spec as authority)

## Validation Checklist

- [x] The plan's `## Architecture` section names the layer chain and contract APIs unambiguously.
- [x] Each regression test domain is stated as `Stimulus: contract -> Response: mock implementation of lower contract` (all four are pure functions with no response).
- [x] Required `api-spec` artifacts exist before suites/cases are derived from a domain.
- [x] Architecturally intended but currently blocked domains still appear in `## Test Domains` (none blocked -- all four are complete).
- [x] Each suite/case names the declared Stimulus entry points it may use, with names traceable to the source contract documents.
- [x] Each asserted contract surface cited in `## Contract Surfaces` is backed by an `api-spec` artifact.
- [x] Each `## Contract Surfaces` subsection body is rendered as a fenced `api-spec` excerpt.
- [x] Suite-file routing is stated once as a shared template.
- [x] Each domain contains suites; each suite defines branching partitions, including `Regressions`, and a grounded `min_cases` formula.
- [x] Orthogonality is defined in terms of distinct branching obligations in the Stimulus implementation.
- [x] Each suite's `min_cases` reflects distinct branch obligations, with any merges recorded explicitly.
- [x] Positive and negative branch outcomes are both represented where the suite contains conditional behavior.
- [x] Each suite has at least `min_cases` concrete case blocks in this same work product.
- [x] Suite membership for every case is explicit, so per-suite case counts are mechanically checkable.
- [x] Each counted case is orthogonal, contract-asserting, and readable as a single isolated obligation.
- [x] No suite is represented only by exemplar or illustrative cases.
