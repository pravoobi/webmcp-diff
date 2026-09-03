import type { ToolRisk } from "@webmcp-contract/contract";

export interface RouteConfig {
  /** Route path relative to `baseUrl`, e.g. `/dresses`. */
  path: string;
  /**
   * Optional setup that puts the app in a non-default state before capture.
   * A path (relative to the config file) to an ESM module whose default export
   * is `(page: import("playwright").Page) => Promise<void>`.
   */
  setup?: string;
  /** State label recorded on tools that appear only after `setup` runs. */
  state?: string;
  /** Extra settle time (ms) for this route on top of the global quiescence wait. */
  settleMs?: number;
}

export interface ExtractConfig {
  baseUrl: string;
  app: { name: string; version?: string; commit?: string };
  routes: RouteConfig[];
  /** Playwright storageState file for logged-in captures. Never copied into the contract. */
  storageState?: string;
  /** Per-tool risk overrides keyed by tool name. */
  riskOverrides?: Record<string, ToolRisk>;
  /** Global registration-quiescence window in ms (default 500). */
  quiescenceMs?: number;
  /** Hard timeout per route in ms (default 15000). */
  routeTimeoutMs?: number;
}

export function validateConfig(raw: unknown, source: string): ExtractConfig {
  if (!raw || typeof raw !== "object") throw new Error(`${source}: config must be an object`);
  const c = raw as Partial<ExtractConfig>;
  if (!c.baseUrl) throw new Error(`${source}: missing baseUrl`);
  if (!c.app?.name) throw new Error(`${source}: missing app.name`);
  if (!Array.isArray(c.routes) || c.routes.length === 0) {
    throw new Error(`${source}: missing routes[]`);
  }
  for (const [i, r] of c.routes.entries()) {
    if (!r || typeof r !== "object" || typeof (r as RouteConfig).path !== "string") {
      throw new Error(`${source}: routes[${i}] needs a string 'path'`);
    }
  }
  return c as ExtractConfig;
}
