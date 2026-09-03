import { describe, expect, it } from "vitest";
import { buildContract, type RawCapture, type RawTool } from "@webmcp-contract/contract";
import { diffContracts } from "../src/index.js";

function contract(tools: RawTool[], routesCaptured = ["/x"]): ReturnType<typeof buildContract> {
  const capture: RawCapture = {
    app: { name: "t" },
    environment: { polyfill: "p@1", surface: "document.modelContext", extractor: "0.1.0" },
    routesCaptured,
    routes: [{ path: "/x", tools }],
    capturedAt: "2026-01-01T00:00:00.000Z",
  };
  return buildContract(capture);
}

const search: RawTool = {
  name: "search",
  description: "Search the catalog",
  source: "imperative",
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      size: { type: "string", enum: ["s", "m", "l"] },
      color: { type: "string", enum: ["black", "blue", "red"] },
    },
    required: ["query"],
  },
};

async function codesFor(from: RawTool[], to: RawTool[]) {
  const result = await diffContracts(contract(from), contract(to));
  return { result, codes: result.changes.map((c) => c.code) };
}

describe("diffContracts — breaking changes", () => {
  it("flags a removed tool", async () => {
    const { result, codes } = await codesFor([search], []);
    expect(codes).toContain("tool.removed");
    expect(result.exitCode).toBe(1);
  });

  it("flags an added required input", async () => {
    const tightened: RawTool = {
      ...search,
      inputSchema: { ...(search.inputSchema as object), required: ["query", "size"] } as RawTool["inputSchema"],
    };
    const { codes } = await codesFor([search], [tightened]);
    expect(codes).toContain("input.required-added");
  });

  it("flags a removed enum value", async () => {
    const narrowed: RawTool = {
      ...search,
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          size: { type: "string", enum: ["s", "m", "l"] },
          color: { type: "string", enum: ["black", "red"] },
        },
        required: ["query"],
      },
    };
    const { codes } = await codesFor([search], [narrowed]);
    expect(codes).toContain("input.enum-value-removed");
  });

  it("flags readOnlyHint being dropped", async () => {
    const notReadOnly: RawTool = { ...search, annotations: { readOnlyHint: false } };
    const { result } = await diffContractsPair([search], [notReadOnly]);
    const change = result.changes.find((c) => c.code === "annotation.readonly-dropped");
    expect(change?.severity).toBe("breaking");
  });

  it("detects a rename via schema similarity", async () => {
    const renamed: RawTool = { ...search, name: "find_products" };
    const { result } = await diffContractsPair([search], [renamed]);
    const rename = result.changes.find((c) => c.code === "tool.renamed");
    expect(rename).toBeDefined();
    expect(rename?.severity).toBe("breaking");
    // should NOT also report removed + added
    expect(result.changes.map((c) => c.code)).not.toContain("tool.removed");
  });
});

describe("diffContracts — risk-increasing changes", () => {
  it("flags a new destructive tool and fails by default", async () => {
    const del: RawTool = {
      name: "delete_account",
      description: "Permanently delete the account",
      source: "imperative",
    };
    const { result, codes } = await codesFor([search], [search, del]);
    expect(codes).toContain("tool.added-destructive");
    expect(result.exitCode).toBe(1);
  });

  it("--risk-as-warning lets a risk-only diff pass", async () => {
    const del: RawTool = { name: "purchase_now", description: "Buy immediately", source: "imperative" };
    const result = await diffContracts(contract([search]), contract([search, del]), {
      riskAsWarning: true,
    });
    expect(result.summary.risk).toBeGreaterThan(0);
    expect(result.exitCode).toBe(0);
  });

  it("flags toolautosubmit being added to a form tool", async () => {
    const form: RawTool = { name: "filter", description: "Filter list", source: "declarative-form" };
    const formAuto: RawTool = { ...form, annotations: { autoSubmit: true } };
    const { codes } = await codesFor([form], [formAuto]);
    expect(codes).toContain("form.autosubmit-added");
  });
});

describe("diffContracts — non-breaking changes", () => {
  it("treats an optional input and enum widening as info", async () => {
    const widened: RawTool = {
      ...search,
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          size: { type: "string", enum: ["s", "m", "l", "xl"] },
          color: { type: "string", enum: ["black", "blue", "red"] },
          sort: { type: "string" },
        },
        required: ["query"],
      },
    };
    const result = await diffContracts(contract([search]), contract([widened]));
    const codes = result.changes.map((c) => c.code);
    expect(codes).toContain("input.optional-added");
    expect(codes).toContain("input.enum-widened");
    expect(result.exitCode).toBe(0);
  });

  it("reports a description change as info", async () => {
    const reworded: RawTool = { ...search, description: "Search the product catalog thoroughly" };
    const { result, codes } = await codesFor([search], [reworded]);
    expect(codes).toContain("description.changed");
    expect(result.exitCode).toBe(0);
  });

  it("no changes ⇒ empty diff, exit 0", async () => {
    const result = await diffContracts(contract([search]), contract([search]));
    expect(result.changes).toHaveLength(0);
    expect(result.exitCode).toBe(0);
  });
});

describe("diffContracts — coverage awareness", () => {
  it("does not report a tool as removed when its route was not re-captured", async () => {
    const from = buildContract({
      app: { name: "t" },
      environment: { polyfill: "p", surface: "document.modelContext", extractor: "0" },
      routesCaptured: ["/x", "/y"],
      routes: [
        { path: "/x", tools: [search] },
        { path: "/y", tools: [{ name: "y_tool", description: "y", source: "imperative" }] },
      ],
      capturedAt: "2026-01-01T00:00:00.000Z",
    });
    const to = buildContract({
      app: { name: "t" },
      environment: { polyfill: "p", surface: "document.modelContext", extractor: "0" },
      routesCaptured: ["/x"],
      routes: [{ path: "/x", tools: [search] }],
      capturedAt: "2026-01-01T00:00:00.000Z",
    });
    const result = await diffContracts(from, to);
    expect(result.changes.map((c) => c.code)).toContain("route.uncaptured");
    expect(result.changes.map((c) => c.code)).not.toContain("tool.removed");
  });
});

async function diffContractsPair(from: RawTool[], to: RawTool[]) {
  const result = await diffContracts(contract(from), contract(to));
  return { result };
}
