/**
 * The canonical WebMCP tool-contract document.
 *
 * A contract captures exactly what a web app exposes to agents via WebMCP at a
 * point in time: the registered tools, their schemas, descriptions, annotations,
 * and per-route lifecycle. It is written canonically (sorted keys, stable
 * ordering) so a plain `git diff` is readable and two captures of the same build
 * are byte-identical.
 */
export interface Contract {
  /** Bumped when the contract document shape changes incompatibly. */
  contractVersion: 1;
  app: AppIdentity;
  /** ISO-8601. Volatile: excluded from {@link Contract.digest} and determinism checks. */
  capturedAt: string;
  environment: Environment;
  /**
   * What the capture actually covered, so "tool absent from the diff" is
   * distinguishable from "tool absent from the capture".
   */
  coverage: Coverage;
  routes: ContractRoute[];
  /** sha256 over the canonical, capture-independent body (see {@link digestContract}). */
  digest: string;
}

export interface AppIdentity {
  name: string;
  /** App/package version, if known. Volatile: excluded from the digest. */
  version?: string;
  /** VCS commit the capture was taken from. Volatile: excluded from the digest. */
  commit?: string;
}

export interface Environment {
  /** e.g. `@mcp-b/webmcp-polyfill@5.1.0`, or `chrome-native@<version>`. */
  polyfill: string;
  /** The registration surface the extractor read from. */
  surface: "document.modelContext" | "navigator.modelContext" | "navigator.modelContextTesting";
  /** Extractor semver, for reproducibility. */
  extractor: string;
}

export interface Coverage {
  /** Route paths that were loaded and captured. */
  routesCaptured: string[];
  /** State labels that were set up and captured (empty = only default state). */
  statesCaptured: string[];
}

export interface ContractRoute {
  /** Route path, normalized (leading slash, no trailing slash except root). */
  path: string;
  tools: ContractTool[];
}

export type ToolRisk = "read" | "write" | "destructive";
export type ToolSource = "imperative" | "declarative-form";
export type ToolLifecycle = "static" | "conditional";

export interface ContractTool {
  name: string;
  description: string;
  /** Canonicalized JSON Schema. Defaults to `{ type: "object", properties: {} }`. */
  inputSchema: JsonSchema;
  /** Canonicalized (sorted) annotation bag, e.g. `{ readOnlyHint: true }`. */
  annotations: Record<string, JsonValue>;
  source: ToolSource;
  /** Heuristic, overridable via config. */
  risk: ToolRisk;
  lifecycle: ToolLifecycle;
  /** State labels this tool appeared in, when `lifecycle: "conditional"`. */
  states?: string[];
  /** Stable identity/content hash (name + schema + annotations + risk). */
  hash: string;
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonSchema = { [key: string]: JsonValue };
