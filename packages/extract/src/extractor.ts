import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import {
  buildContract,
  type Contract,
  type JsonSchema,
  type RawRoute,
  type RawTool,
} from "@webmcp-contract/contract";
import { validateConfig, type ExtractConfig, type RouteConfig } from "./config.js";
import { PROBE_SCRIPT, type ProbeResult } from "./page-probe.js";

const require = createRequire(import.meta.url);
const EXTRACTOR_VERSION = "0.1.0";

let polyfillSourceCache: { source: string; version: string } | undefined;

/** Load the standalone polyfill IIFE bundled with `@mcp-b/webmcp-polyfill`. */
async function loadPolyfill(): Promise<{ source: string; version: string }> {
  if (polyfillSourceCache) return polyfillSourceCache;
  const iifePath = require.resolve("@mcp-b/webmcp-polyfill/iife");
  const source = await readFile(iifePath, "utf8");
  // package.json sits two levels up from dist/index.iife.js
  let version = "unknown";
  try {
    const pkg = JSON.parse(
      await readFile(path.join(path.dirname(iifePath), "..", "package.json"), "utf8"),
    ) as { version: string };
    version = pkg.version;
  } catch {
    /* keep "unknown" */
  }
  polyfillSourceCache = { source, version: `@mcp-b/webmcp-polyfill@${version}` };
  return polyfillSourceCache;
}

export interface ExtractOptions {
  /** Directory that `route.setup` paths resolve against (usually the config file's dir). */
  configDir?: string;
  /** Fixed capture timestamp — pass for deterministic snapshots/tests. */
  capturedAt?: string;
  /** Called with progress messages. */
  onProgress?: (message: string) => void;
}

/** Load a config file (JSON) and run the extraction. */
export async function extractFromConfigFile(
  configPath: string,
  options: ExtractOptions = {},
): Promise<Contract> {
  const text = await readFile(configPath, "utf8");
  const config = validateConfig(JSON.parse(text), configPath);
  return extractContract(config, { ...options, configDir: path.dirname(path.resolve(configPath)) });
}

/** Crawl the configured routes and produce a canonical contract. */
export async function extractContract(
  rawConfig: ExtractConfig,
  options: ExtractOptions = {},
): Promise<Contract> {
  const config = validateConfig(rawConfig, "<config>");
  const configDir = options.configDir ?? process.cwd();
  const log = options.onProgress ?? (() => {});
  const quiescenceMs = config.quiescenceMs ?? 500;
  const routeTimeoutMs = config.routeTimeoutMs ?? 15_000;

  const { source: polyfillSource, version: polyfillVersion } = await loadPolyfill();

  const browser: Browser = await chromium.launch();
  let context: BrowserContext | undefined;
  const routes: RawRoute[] = [];
  const routesCaptured: string[] = [];
  const statesCaptured = new Set<string>();
  let surface: ProbeResult["surface"] = "none";

  try {
    context = await browser.newContext(
      config.storageState
        ? { storageState: path.resolve(configDir, config.storageState) }
        : undefined,
    );
    await context.addInitScript(`window.__webMCPPolyfillOptions = { installTestingShim: true };`);
    await context.addInitScript({ content: polyfillSource });

    for (const routeConfig of config.routes) {
      const url = new URL(routeConfig.path, config.baseUrl).toString();
      log(`capturing ${routeConfig.path}${routeConfig.state ? ` [${routeConfig.state}]` : ""}`);
      const page = await context.newPage();
      page.setDefaultTimeout(routeTimeoutMs);
      try {
        await page.goto(url, { waitUntil: "load" });
        await settleNetwork(page, routeTimeoutMs);

        if (routeConfig.setup) {
          await runSetup(page, path.resolve(configDir, routeConfig.setup));
        }

        const probe = await captureWithQuiescence(
          page,
          quiescenceMs,
          routeTimeoutMs,
          routeConfig.settleMs ?? 0,
        );
        if (probe.surface !== "none") surface = probe.surface;

        const state = routeConfig.setup ? routeConfig.state ?? "post-setup" : undefined;
        if (state) statesCaptured.add(state);

        routes.push({
          path: routeConfig.path,
          tools: probe.tools
            .filter((t) => t.name)
            .map((t): RawTool => {
              const isDeclarative = probe.declarativeNames.includes(t.name);
              const annotations: Record<string, unknown> = { ...t.annotations };
              if (probe.autoSubmitNames.includes(t.name)) annotations["autoSubmit"] = true;
              return {
                name: t.name,
                description: t.description,
                inputSchema: t.inputSchema as JsonSchema,
                annotations: annotations as RawTool["annotations"],
                source: isDeclarative ? "declarative-form" : "imperative",
                ...(state ? { states: [state] } : {}),
              };
            }),
        });
        routesCaptured.push(routeConfig.path);
      } finally {
        await page.close();
      }
    }
  } finally {
    await context?.close();
    await browser.close();
  }

  const mergedRoutes = mergeRouteStates(routes);

  return buildContract({
    app: config.app,
    environment: {
      polyfill: polyfillVersion,
      surface: surface === "none" ? "document.modelContext" : surface,
      extractor: EXTRACTOR_VERSION,
    },
    routesCaptured,
    statesCaptured: [...statesCaptured],
    routes: mergedRoutes,
    ...(options.capturedAt ? { capturedAt: options.capturedAt } : {}),
    ...(config.riskOverrides ? { riskOverrides: config.riskOverrides } : {}),
  });
}

/** A route may be captured twice (default + a setup state). Fold them together. */
function mergeRouteStates(routes: RawRoute[]): RawRoute[] {
  interface Entry {
    tool: RawTool;
    /** True once the tool was seen in a capture with no state label (default state). */
    staticSeen: boolean;
    states: Set<string>;
  }
  const byPath = new Map<string, Map<string, Entry>>();
  const order: string[] = [];

  for (const route of routes) {
    if (!byPath.has(route.path)) {
      byPath.set(route.path, new Map());
      order.push(route.path);
    }
    const bucket = byPath.get(route.path)!;
    for (const tool of route.tools) {
      let entry = bucket.get(tool.name);
      if (!entry) {
        entry = { tool: { ...tool }, staticSeen: false, states: new Set() };
        bucket.set(tool.name, entry);
      }
      if (tool.states && tool.states.length > 0) {
        for (const s of tool.states) entry.states.add(s);
      } else {
        entry.staticSeen = true;
      }
    }
  }

  return order.map((path) => ({
    path,
    tools: [...byPath.get(path)!.values()].map(({ tool, staticSeen, states }) => {
      const out: RawTool = { ...tool };
      delete out.states;
      if (!staticSeen && states.size > 0) out.states = [...states].sort();
      return out;
    }),
  }));
}

async function settleNetwork(page: Page, timeoutMs: number): Promise<void> {
  try {
    await page.waitForLoadState("networkidle", { timeout: timeoutMs });
  } catch {
    // networkidle can never arrive on pages with long-poll/websocket traffic
  }
}

/**
 * Poll the tool list until it is stable across two reads `quiescenceMs` apart
 * (async tool registration settles), bounded by `timeoutMs`.
 */
async function captureWithQuiescence(
  page: Page,
  quiescenceMs: number,
  timeoutMs: number,
  extraSettleMs: number,
): Promise<ProbeResult> {
  if (extraSettleMs > 0) await page.waitForTimeout(extraSettleMs);
  const deadline = Date.now() + timeoutMs;
  const probe = () => page.evaluate(PROBE_SCRIPT) as Promise<ProbeResult>;
  let previous = await probe();
  let stableSince = Date.now();

  while (Date.now() < deadline) {
    await page.waitForTimeout(Math.min(quiescenceMs, 250));
    const current = await probe();
    if (fingerprint(current) === fingerprint(previous)) {
      if (Date.now() - stableSince >= quiescenceMs) return current;
    } else {
      stableSince = Date.now();
    }
    previous = current;
  }
  return previous;
}

function fingerprint(probe: ProbeResult): string {
  return JSON.stringify(
    probe.tools
      .map((t) => [t.name, t.description, t.inputSchema, t.annotations])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
}

async function runSetup(page: Page, setupPath: string): Promise<void> {
  const mod = (await import(pathToFileURL(setupPath).href)) as {
    default?: (page: Page) => Promise<void>;
  };
  if (typeof mod.default !== "function") {
    throw new Error(`setup module ${setupPath} must have a default export (page) => Promise<void>`);
  }
  await mod.default(page);
}

export type { ExtractConfig, RouteConfig } from "./config.js";
