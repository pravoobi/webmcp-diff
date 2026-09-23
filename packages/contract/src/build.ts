import { canonicalizeSchema, sortKeysDeep } from "./canonicalize.js";
import { classifyRisk } from "./classify.js";
import { contentHash, sha256 } from "./hash.js";
import type {
  AppIdentity,
  Contract,
  ContractRoute,
  ContractTool,
  Environment,
  JsonSchema,
  JsonValue,
  ToolRisk,
  ToolSource,
} from "./types.js";

export interface RawTool {
  name: string;
  description?: string;
  inputSchema?: JsonSchema;
  annotations?: Record<string, JsonValue>;
  source: ToolSource;
  /** State labels the tool appeared in. Empty/absent ⇒ present in the default state. */
  states?: string[];
}

export interface RawRoute {
  path: string;
  tools: RawTool[];
}

export interface RawCapture {
  app: AppIdentity;
  environment: Environment;
  routesCaptured: string[];
  statesCaptured?: string[];
  routes: RawRoute[];
  /** Defaults to `new Date().toISOString()`. Pass a fixed value for determinism tests. */
  capturedAt?: string;
  /** Per-tool risk overrides keyed by tool name. */
  riskOverrides?: Record<string, ToolRisk>;
}

/** Normalize a route path: ensure a leading slash, strip a trailing slash (except root). */
export function normalizePath(path: string): string {
  let p = path.trim();
  if (!p.startsWith("/")) p = `/${p}`;
  p = p.replace(/\/+/g, "/");
  if (p.length > 1) p = p.replace(/\/$/, "");
  return p;
}

function buildTool(raw: RawTool, overrides: Record<string, ToolRisk> | undefined): ContractTool {
  const inputSchema = canonicalizeSchema(raw.inputSchema);
  const annotations = sortKeysDeep((raw.annotations ?? {}) as JsonValue) as Record<
    string,
    JsonValue
  >;
  const description = (raw.description ?? "").trim();
  const risk = classifyRisk({ name: raw.name, description, annotations }, { overrides });
  const states = raw.states && raw.states.length > 0 ? [...new Set(raw.states)].sort() : undefined;
  const lifecycle = states ? "conditional" : "static";

  const identity: JsonValue = {
    name: raw.name,
    inputSchema: inputSchema as JsonValue,
    annotations: annotations as JsonValue,
    risk,
    source: raw.source,
  };

  const tool: ContractTool = {
    name: raw.name,
    description,
    inputSchema,
    annotations,
    source: raw.source,
    risk,
    lifecycle,
    hash: contentHash(identity),
  };
  if (states) tool.states = states;
  return tool;
}

/** Assemble a canonical {@link Contract} from raw extractor output. */
export function buildContract(capture: RawCapture): Contract {
  const routes: ContractRoute[] = capture.routes
    .map((route) => ({
      path: normalizePath(route.path),
      tools: route.tools
        .map((t) => buildTool(t, capture.riskOverrides))
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const contract: Contract = {
    contractVersion: 1,
    app: capture.app,
    capturedAt: capture.capturedAt ?? new Date().toISOString(),
    environment: capture.environment,
    coverage: {
      routesCaptured: [...new Set(capture.routesCaptured.map(normalizePath))].sort(),
      statesCaptured: [...new Set(capture.statesCaptured ?? [])].sort(),
    },
    routes,
    digest: "",
  };
  contract.digest = digestContract(contract);
  return contract;
}

/**
 * sha256 over the capture-independent body: contract shape, app *name*,
 * environment, coverage, and routes. Excludes `capturedAt`, `app.version`, and
 * `app.commit` so two captures of the same build share a digest.
 */
export function digestContract(contract: Contract): string {
  return sha256({
    contractVersion: contract.contractVersion,
    app: { name: contract.app.name },
    environment: contract.environment as unknown as JsonValue,
    coverage: contract.coverage as unknown as JsonValue,
    routes: contract.routes as unknown as JsonValue,
  });
}

/** True when two contracts describe the same surface (ignoring capture metadata). */
export function sameContractBody(a: Contract, b: Contract): boolean {
  return digestContract(a) === digestContract(b);
}
