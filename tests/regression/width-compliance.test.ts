/**
 * Width Compliance Regression Tests
 *
 * Verifies two invariants for ALL block types:
 *   1. Width ceiling: every non-code-block output line has display width <= requested width
 *   2. Overcompensation idempotency: rendering at natural width produces identical output
 *
 * Uses runPipeline() as the ONLY entry point (the real CLI path).
 * Uses string-width for display-column-correct measurement.
 */

import { test, expect, describe } from 'vitest';
import { runPipeline } from '../../src/pipeline/index.ts';
import type { BmdConfig } from '../../src/config/schema';
import { getDefaults } from '../../src/theme/defaults';
import stringWidth from 'string-width';

// ─── Helpers ───

function makeConfig(width: number, overrides?: Partial<BmdConfig>): BmdConfig {
  return {
    format: 'utf8',
    width,
    ansiEnabled: false,
    pager: 'never',
    unsafeHtml: false,
    unicode: true,
    filePath: undefined,
    theme: getDefaults(),
    templates: { enabled: false, map: undefined, auto_map: false, list_spec: undefined },
    undo: { groupDelay: 500, depth: 200 },
    serve: { host: '0.0.0.0', port: 3000, open: true, mode: 'both', colorMode: 'auto', readonly: false },
    ...overrides,
  };
}

function maxDisplayWidth(text: string): number {
  return Math.max(0, ...text.split('\n').map(l => stringWidth(l)));
}

function lineWidths(text: string): { lineNum: number; width: number; text: string }[] {
  return text.split('\n').map((line, i) => ({
    lineNum: i + 1,
    width: stringWidth(line),
    text: line,
  }));
}

// ─── Fixtures (19 total) ───

const LONG_PROSE = 'The quick brown fox jumps over the lazy dog near the riverbank where the willows sway gently in the warm summer breeze while birds sing their melodious songs from the treetops and squirrels chase each other playfully across the emerald meadow stretching far beyond the horizon into the distant misty mountains that rise majestically against the golden sunset sky painting everything in hues of orange amber and deep crimson light.';

const FIXTURES: Record<string, { source: string }> = {
  'paragraph': {
    source: LONG_PROSE,
  },
  'heading-h1': {
    source: `# ${LONG_PROSE.slice(0, 220)}`,
  },
  'heading-h3': {
    source: `### ${LONG_PROSE.slice(0, 220)}`,
  },
  'table-wide': {
    source: [
      '| Column Alpha Description | Column Beta Information | Column Gamma Details Here | Column Delta Extended | Column Epsilon Final Notes |',
      '|---|---|---|---|---|',
      '| This cell contains a fairly long piece of text that should trigger wrapping | Another cell with substantial content for testing | More detailed information goes here in this cell | Extended data for the delta column entry | Final notes column with plenty of text content |',
      '| Additional row with even more content to ensure the table is wide enough | Second cell in this row also has long text | Third cell continues the pattern of long content | Fourth cell keeps going with descriptive text | Fifth cell wraps up this row with more words |',
    ].join('\n'),
  },
  'table-narrow': {
    source: [
      '| Name | Value | Description |',
      '|---|---|---|',
      '| configuration_parameter_alpha | some_extended_value_here | This describes the configuration parameter alpha in detail |',
      '| another_setting_beta | different_value_string | Explanation of the beta setting and its purpose in the system |',
    ].join('\n'),
  },
  'table-in-blockquote': {
    source: [
      '> | Column One Header | Column Two Header | Column Three Header |',
      '> |---|---|---|',
      '> | First cell with some reasonable text content | Second cell also containing enough words | Third cell rounding out the table row content |',
      '> | Another row first cell has text content here | More text for the second cell in this row | Final cell completing the second table row |',
    ].join('\n'),
  },
  'table-many-columns': {
    source: [
      '| Col A | Col B | Col C | Col D | Col E | Col F | Col G |',
      '|---|---|---|---|---|---|---|',
      '| alpha val | beta val | gamma val | delta val | epsilon | zeta val | eta value |',
      '| more alpha | more beta | more gamma | more delta | more eps | more zeta | more eta |',
    ].join('\n'),
  },
  'ordered-list-nested': {
    source: [
      `1. ${LONG_PROSE.slice(0, 120)}`,
      `   1. ${LONG_PROSE.slice(0, 120)}`,
      `      1. ${LONG_PROSE.slice(0, 120)}`,
      `2. ${LONG_PROSE.slice(0, 120)}`,
      `   1. ${LONG_PROSE.slice(0, 120)}`,
      `      1. ${LONG_PROSE.slice(0, 120)}`,
    ].join('\n'),
  },
  'unordered-list-nested': {
    source: [
      `- ${LONG_PROSE.slice(0, 120)}`,
      `  - ${LONG_PROSE.slice(0, 120)}`,
      `    - ${LONG_PROSE.slice(0, 120)}`,
      `- ${LONG_PROSE.slice(0, 120)}`,
      `  - ${LONG_PROSE.slice(0, 120)}`,
      `    - ${LONG_PROSE.slice(0, 120)}`,
    ].join('\n'),
  },
  'blockquote-nested': {
    source: `> > ${LONG_PROSE}`,
  },
  'blockquote-list': {
    source: [
      `> - ${LONG_PROSE.slice(0, 150)}`,
      `> - ${LONG_PROSE.slice(0, 150)}`,
      `> - ${LONG_PROSE.slice(0, 150)}`,
    ].join('\n'),
  },
  'horizontal-rule': {
    source: '---',
  },
  'code-block': {
    source: [
      '```javascript',
      `const veryLongVariableName = "${'x'.repeat(200)}";`,
      '```',
    ].join('\n'),
  },
  'mermaid-flowchart-td': {
    source: [
      '```mermaid',
      'graph TD',
      '    subgraph "Authentication and Authorization Service Module"',
      '        A["User Registration with Email Verification and Phone Confirmation"] --> B["Multi-Factor Authentication Processing Engine"]',
      '        B --> C["Session Token Generation and Secure Storage Management"]',
      '        C --> D["Role-Based Access Control Permission Evaluation System"]',
      '    end',
      '    subgraph "Data Processing and Analytics Pipeline"',
      '        E["Raw Data Ingestion from Multiple External Source Systems"] --> F["Data Transformation and Normalization Processing Layer"]',
      '        F --> G["Statistical Analysis and Machine Learning Model Training"]',
      '    end',
      '    D --> E',
      '```',
    ].join('\n'),
  },
  'mermaid-flowchart-lr': {
    source: [
      '```mermaid',
      'graph LR',
      '    A["Request Handler Module"] --> B["Input Validation Layer"]',
      '    B --> C["Business Logic Engine"]',
      '    C --> D["Data Access Object Layer"]',
      '    D --> E["Cache Management System"]',
      '    E --> F["Response Formatter Module"]',
      '    F --> G["Output Serialization Engine"]',
      '```',
    ].join('\n'),
  },
  'mermaid-sequence': {
    source: [
      '```mermaid',
      'sequenceDiagram',
      '    participant WebClient as Web Client Application',
      '    participant APIGateway as API Gateway Service',
      '    participant AuthService as Authentication Service',
      '    participant UserDB as User Database Server',
      '    participant CacheLayer as Redis Cache Layer',
      '    participant NotifyService as Notification Service',
      '    WebClient->>APIGateway: Send authentication request with encrypted credentials and session token',
      '    APIGateway->>AuthService: Forward validated request with additional metadata headers',
      '    AuthService->>UserDB: Query user credentials and permissions from the database',
      '    UserDB-->>AuthService: Return user record with role assignments and access policies',
      '    AuthService->>CacheLayer: Store authenticated session with expiration configuration',
      '    AuthService-->>APIGateway: Return authentication result with bearer token and refresh token',
      '    APIGateway-->>WebClient: Deliver final response with authentication cookies and redirect URL',
      '    APIGateway->>NotifyService: Trigger login notification email to registered user address',
      '```',
    ].join('\n'),
  },
  'mermaid-er': {
    source: [
      '```mermaid',
      'erDiagram',
      '    CUSTOMER_ACCOUNT_INFORMATION ||--o{ ORDER_TRANSACTION_RECORD : places',
      '    ORDER_TRANSACTION_RECORD ||--|{ LINE_ITEM_DETAIL_ENTRY : contains',
      '    CUSTOMER_ACCOUNT_INFORMATION {',
      '        string customer_full_legal_name',
      '        string customer_primary_email_address',
      '        string customer_billing_street_address',
      '        int customer_loyalty_program_level',
      '    }',
      '    ORDER_TRANSACTION_RECORD {',
      '        int order_sequential_identifier',
      '        string order_processing_status_code',
      '        date order_placement_timestamp',
      '    }',
      '    LINE_ITEM_DETAIL_ENTRY {',
      '        string product_description_text',
      '        int quantity_ordered_amount',
      '        float unit_price_in_currency',
      '    }',
      '```',
    ].join('\n'),
  },
  'mermaid-class': {
    source: [
      '```mermaid',
      'classDiagram',
      '    class AuthenticationServiceController {',
      '        +String authenticateUserWithCredentials(String username, String password, String mfaToken)',
      '        +Boolean validateSessionTokenAndRefreshExpiration(String sessionToken, int extensionMinutes)',
      '        +UserProfile getUserProfileWithPermissions(String userId, String[] requestedScopes)',
      '        -HashMap~String,Object~ internalConfigurationSettingsMap',
      '        -List~AuditLogEntry~ recentAuthenticationAuditTrail',
      '    }',
      '    class DatabaseConnectionPoolManager {',
      '        +Connection acquireConnectionFromPool(String databaseIdentifier, int timeoutMilliseconds)',
      '        +void releaseConnectionBackToPool(Connection activeConnection, boolean forceClose)',
      '        +PoolStatistics getConnectionPoolHealthStatistics(String poolName)',
      '    }',
      '    AuthenticationServiceController --> DatabaseConnectionPoolManager',
      '```',
    ].join('\n'),
  },
  'mixed-all': {
    source: [
      `# ${LONG_PROSE.slice(0, 100)}`,
      '',
      LONG_PROSE,
      '',
      '> > ' + LONG_PROSE.slice(0, 200),
      '',
      `- ${LONG_PROSE.slice(0, 120)}`,
      `  - ${LONG_PROSE.slice(0, 120)}`,
      '',
      '| Column Alpha Long Name | Column Beta Long Name | Column Gamma Long Name |',
      '|---|---|---|',
      '| Cell with fairly long content here | Another cell with long text | Third cell also has content |',
      '',
      '---',
      '',
      '```python',
      `very_long_variable = "${'y'.repeat(200)}"`,
      '```',
      '',
      '```mermaid',
      'graph TD',
      '    A["Long Node Label for Testing Width Compliance"] --> B["Another Node with Extended Description"]',
      '    B --> C["Final Node in the Flowchart Diagram"]',
      '```',
    ].join('\n'),
  },
};

// Known code-block content markers for mixed-all fixture
const MIXED_ALL_CODE_CONTENT = 'y'.repeat(200);

// ─── Invariant 1: Width Ceiling ───

describe('width ceiling', () => {
  for (const [name, fixture] of Object.entries(FIXTURES)) {
    for (const w of [60, 80, 100, 120]) {
      test(`${name} at width ${w}`, async () => {
        const { rendered } = await runPipeline({ source: fixture.source, config: makeConfig(w) });
        const widths = lineWidths(rendered);
        const violations = widths.filter(l => l.width > w);

        if (name === 'code-block') {
          // Code blocks are EXEMPT from width ceiling
          return;
        }

        if (name === 'mixed-all') {
          // Filter out lines that are code-block content (contain the known sentinel)
          const nonCodeViolations = violations.filter(v => !v.text.includes(MIXED_ALL_CODE_CONTENT));
          if (nonCodeViolations.length > 0) {
            const detail = nonCodeViolations.map(v =>
              `  line ${v.lineNum}: width=${v.width} (expected <=${w}): ${JSON.stringify(v.text)}`
            ).join('\n');
            throw new Error(`Width violations at width=${w}:\n${detail}`);
          }
          return;
        }

        if (violations.length > 0) {
          const detail = violations.map(v =>
            `  line ${v.lineNum}: width=${v.width} (expected <=${w}): ${JSON.stringify(v.text)}`
          ).join('\n');
          throw new Error(`Width violations at width=${w}:\n${detail}`);
        }
      });
    }
  }
});

// ─── Invariant 2: Overcompensation Idempotency ───

describe('overcompensation idempotency', () => {
  for (const [name, fixture] of Object.entries(FIXTURES)) {
    if (name === 'code-block') continue; // exempt from width entirely

    test(`${name}`, async () => {
      const pass1 = await runPipeline({ source: fixture.source, config: makeConfig(120) });

      // For mixed-all: exclude code-block lines (exempt from width) when measuring natural width
      let measuredLines = pass1.rendered.split('\n');
      if (name === 'mixed-all') {
        measuredLines = measuredLines.filter(l => !l.includes(MIXED_ALL_CODE_CONTENT));
      }
      const W2 = Math.max(0, ...measuredLines.map(l => stringWidth(l)));
      expect(W2).toBeGreaterThan(0); // sanity
      expect(W2).toBeLessThanOrEqual(120); // ceiling holds

      const pass2 = await runPipeline({ source: fixture.source, config: makeConfig(W2) });
      expect(pass2.rendered).toBe(pass1.rendered);
    });
  }
});
