/**
 * Shared fixture factories for contract tests.
 * Produces valid typed fixtures for all four contract test domains.
 */

import type { BmdConfig } from '../../src/config/schema.ts';
import type { ServerState, ClientState } from '../../src/protocol/types.ts';
import type { FileConfig, ServerGlobalConfig } from '../../src/types/ws-messages.ts';
import type { PagerMode } from '../../src/pager/index.ts';

// --- Default values ---

const CONFIG_DEFAULTS: BmdConfig = {
  format: 'utf8',
  width: 80,
  ansiEnabled: false,
  pager: 'never' as PagerMode,
  unsafeHtml: false,
  unicode: true,
  filePath: undefined,
  theme: undefined,
  templates: { enabled: true, map: undefined, auto_map: false, list_spec: undefined },
  undo: { groupDelay: 500, depth: 100 },
  serve: {
    host: '0.0.0.0',
    port: 3000,
    open: true,
    mode: 'both',
    colorMode: 'auto',
    readonly: false,
  },
};

const SERVER_STATE_DEFAULTS: ServerState = {
  content: '# Test',
  filePath: '/tmp/test.md',
  globalConfig: { host: 'localhost', port: 3000 },
  fileConfig: {
    readonly: false,
    unsafeHtml: false,
    theme: null,
    mode: 'both',
    colorMode: 'auto',
  },
  isReadonly: false,
  templateValues: null,
  templatesEnabled: true,
};

const CLIENT_STATE_DEFAULTS: ClientState = {
  fileConfig: null,
  currentPath: null,
  content: null,
  unsaved: false,
  lastDigest: null,
  connectionStatus: 'disconnected',
};

// --- Factory functions ---

/**
 * Create a fully resolved BmdConfig with sensible test defaults.
 * Supports deep merge for the `serve` sub-object.
 */
export function makeConfig(overrides?: Partial<BmdConfig>): BmdConfig {
  return {
    ...CONFIG_DEFAULTS,
    ...overrides,
    templates: {
      ...CONFIG_DEFAULTS.templates,
      ...overrides?.templates,
    },
    serve: {
      ...CONFIG_DEFAULTS.serve,
      ...overrides?.serve,
    },
  };
}

/**
 * Create a valid ServerState with sensible test defaults.
 */
export function makeServerState(overrides?: Partial<ServerState>): ServerState {
  return {
    ...SERVER_STATE_DEFAULTS,
    ...overrides,
  };
}

/**
 * Create a valid ClientState with sensible test defaults.
 */
export function makeClientState(overrides?: Partial<ClientState>): ClientState {
  return {
    ...CLIENT_STATE_DEFAULTS,
    ...overrides,
  };
}

/**
 * Default FileConfig object for reuse in FSM tests.
 */
export const testFileConfig: FileConfig = {
  readonly: false,
  unsafeHtml: false,
  theme: null,
  mode: 'both',
  colorMode: 'auto',
};
