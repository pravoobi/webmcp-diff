import { describe, expect, it } from "vitest";
import { buildContract, type RawTool } from "@webmcp-contract/contract";
import { diffContracts, report } from "../src/index.js";

const env = { polyfill: "p@1", surface: "document.modelContext" as const, extractor: "0.1.0" };

function contract(tools: RawTool[]) {
  return buildContract({
    app: { name: "shop" },
    environment: env,
    routesCaptured: ["/cart"],
    routes: [{ path: "/cart", tools }],
    capturedAt: "2026-01-01T00:00:00.000Z",
  });
}

const checkout: RawTool = {
  name: "checkout",
  description: "Place the order",
  source: "imperative",
  inputSchema: { type: "object", properties: {} },
};

describe("reporters", () => {
  it("text report names the verdict and every change code", async () => {
    const result = await diffContracts(contract([checkout]), contract([]));
    const text = report(result, "text");
    expect(text).toContain("FAIL");
    expect(text).toContain("tool.removed");
    expect(text).toContain("1 breaking");
  });

  it("markdown groups by severity with before/after details", async () => {
    const withDel: RawTool = {
      name: "delete_account",
      description: "Delete the account permanently",
      source: "imperative",
    };
    const result = await diffContracts(contract([checkout]), contract([checkout, withDel]));
    const md = report(result, "markdown");
    expect(md).toContain("## WebMCP contract diff");
    expect(md).toContain("### 🟠 RISK");
    expect(md).toContain("<details><summary>before / after</summary>");
  });

  it("sarif has 2.1.0 shape with error-level results", async () => {
    const result = await diffContracts(contract([checkout]), contract([]));
    const sarif = JSON.parse(report(result, "sarif"));
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0].results[0].level).toBe("error");
    expect(sarif.runs[0].results[0].ruleId).toBe("tool.removed");
  });

  it("json report is the DiffResult", async () => {
    const result = await diffContracts(contract([checkout]), contract([checkout]));
    expect(JSON.parse(report(result, "json"))).toMatchObject({ exitCode: 0, changes: [] });
  });

  it("html report is a self-contained page with the verdict, groups, and escaped content", async () => {
    const evil: RawTool = {
      name: "checkout",
      description: 'Place the order <script>alert(1)</script> & "quote"',
      source: "imperative",
    };
    const result = await diffContracts(contract([checkout]), contract([evil]));
    const html = report(result, "html");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("WebMCP contract diff");
    expect(html).toContain("before / after");
    // description change never reaches raw <script> in the output...
    expect(html).not.toContain("<script>alert(1)</script>");
    // ...it's HTML-escaped instead.
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("html report renders a clean empty state when there are no changes", async () => {
    const result = await diffContracts(contract([checkout]), contract([checkout]));
    const html = report(result, "html");
    expect(html).toContain("No contract changes.");
    expect(html).not.toContain('class="pills"');
  });
});
