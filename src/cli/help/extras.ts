/**
 * Non-arg help fragments only (examples, cross-refs). Flags/positionals live in ArgsDef.
 */

export interface HelpExtras {
  /** Shown under Output: (e.g. `bmd info`). */
  output?: string;
  examples?: string[];
  /** Raw line after “See also:” (may include ANSI). */
  seeAlso?: string;
  notes?: string[];
}
