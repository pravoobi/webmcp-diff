import { describe, expect, it, vi } from "vitest";
import { buildContract, type RawTool } from "@webmcp-contract/contract";
import { diffContracts, createClaudeSemanticJudge, type SemanticJudge } from "../src/index.js";

const env = { polyfill: "p@1", surface: "document.modelContext" as const, extractor: "0.1.0" };

function contract(tools: RawTool[]) {
  return buildContract({
    app: { name: "shop" },
    environment: env,
    routesCaptured: ["/x"],
    routes: [{ path: "/x", tools }],
    capturedAt: "2026-01-01T00:00:00.000Z",
  });
}

const before: RawTool = {
  name: "search",
  description: "Search the catalog and return matches.",
  source: "imperative",
  annotations: { readOnlyHint: true },
};
const reworded: RawTool = {
  ...before,
  description: "Search the catalog and add the first match to the cart.",
};

describe("semantic diff wiring", () => {
  it("upgrades description.changed → description.behavior-drift (risk) when the judge says so", async () => {
    const judge = vi.fn<SemanticJudge>(async () => ({
      behaviorChanged: true,
      rationale: "now mutates the cart",
    }));
    const result = await diffContracts(contract([before]), contract([reworded]), {
      semantic: judge,
    });

    expect(judge).toHaveBeenCalledOnce();
    expect(judge.mock.calls[0]![0]).toMatchObject({ route: "/x", tool: "search" });
    const drift = result.changes.find((c) => c.code === "description.behavior-drift");
    expect(drift?.severity).toBe("risk");
    expect(result.changes.some((c) => c.code === "description.changed")).toBe(false);
    expect(result.exitCode).toBe(1);
  });

  it("keeps it as info when the judge sees only wording changes", async () => {
    const judge = vi.fn<SemanticJudge>(async () => ({
      behaviorChanged: false,
      rationale: "reworded",
    }));
    const result = await diffContracts(contract([before]), contract([reworded]), {
      semantic: judge,
    });
    expect(result.changes.find((c) => c.code === "description.changed")?.severity).toBe("info");
    expect(result.exitCode).toBe(0);
  });

  it("does not call the judge when no description changed", async () => {
    const judge = vi.fn<SemanticJudge>(async () => ({ behaviorChanged: false, rationale: "" }));
    const tightened: RawTool = {
      ...before,
      inputSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
    };
    await diffContracts(contract([before]), contract([tightened]), { semantic: judge });
    expect(judge).not.toHaveBeenCalled();
  });

  it("falls back to info when the judge throws", async () => {
    const judge = vi.fn<SemanticJudge>(async () => {
      throw new Error("api down");
    });
    const result = await diffContracts(contract([before]), contract([reworded]), {
      semantic: judge,
    });
    expect(result.changes.find((c) => c.code === "description.changed")?.severity).toBe("info");
  });
});

describe("createClaudeSemanticJudge", () => {
  it("parses a JSON verdict out of the model response", async () => {
    const create = vi.fn(async () => ({
      content: [
        {
          type: "text",
          text: 'Here you go: {"behaviorChanged": true, "rationale": "adds to cart"}',
        },
      ],
    }));
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class {
        messages = { create };
      },
    }));

    const judge = createClaudeSemanticJudge({ apiKey: "test-key", model: "claude-opus-5" });
    const verdict = await judge({ route: "/x", tool: "search", before: "a", after: "b" });

    expect(verdict).toEqual({ behaviorChanged: true, rationale: "adds to cart" });
    expect(create).toHaveBeenCalledOnce();
    vi.doUnmock("@anthropic-ai/sdk");
  });

  it("errors clearly without an API key", async () => {
    const judge = createClaudeSemanticJudge({ apiKey: "" });
    await expect(judge({ route: "/x", tool: "t", before: "a", after: "b" })).rejects.toThrow(
      /ANTHROPIC_API_KEY/,
    );
  });
});
