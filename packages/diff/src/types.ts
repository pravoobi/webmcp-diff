import type { JsonValue } from "@webmcp-contract/contract";

/**
 * Severity, in ascending order of concern:
 *  - `info`  — noted, no action needed
 *  - `warn`  — worth a look; agents *may* be affected
 *  - `risk`  — agent access to state-changing/destructive behavior widened
 *  - `breaking` — an existing agent integration will break
 */
export type Severity = "info" | "warn" | "risk" | "breaking";

export const SEVERITY_ORDER: Record<Severity, number> = {
  info: 0,
  warn: 1,
  risk: 2,
  breaking: 3,
};

export interface Change {
  severity: Severity;
  /** Stable machine code, e.g. `tool.removed`, `input.required-added`. */
  code: string;
  route: string;
  tool?: string;
  /** Human-readable one-liner. */
  message: string;
  /** Optional before/after fragments for reporters to render. */
  before?: JsonValue;
  after?: JsonValue;
}

export interface DiffOptions {
  /**
   * Treat `risk`-severity changes as non-fatal (exit 0). Default: false —
   * risk-increasing changes fail CI, matching the spec.
   */
  riskAsWarning?: boolean;
  /** Minimum schema-hash / name similarity (0–1) to report a remove+add as a rename. */
  renameThreshold?: number;
  /** Hook for the optional LLM-assisted semantic description diff. */
  semantic?: SemanticJudge;
}

export type SemanticJudge = (input: {
  route: string;
  tool: string;
  before: string;
  after: string;
}) => Promise<SemanticVerdict>;

export interface SemanticVerdict {
  /** True when the described *behavior* changed, not just the wording. */
  behaviorChanged: boolean;
  rationale: string;
}

export interface DiffResult {
  changes: Change[];
  summary: Record<Severity, number>;
  /** 1 when any `breaking` (or, unless `riskAsWarning`, any `risk`) change exists. */
  exitCode: 0 | 1;
  from: { app: string; digest: string };
  to: { app: string; digest: string };
}
