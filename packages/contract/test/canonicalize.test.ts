import { describe, expect, it } from "vitest";
import {
  canonicalizeSchema,
  buildContract,
  serializeContract,
  parseContract,
  ContractParseError,
  type RawCapture,
} from "../src/index.js";

const baseCapture = (): RawCapture => ({
  app: { name: "demo", version: "1.0.0", commit: "abc" },
  environment: { polyfill: "p@1", surface: "document.modelContext", extractor: "0.1.0" },
  routesCaptured: ["/"],
  routes: [
    {
      path: "/",
      tools: [
        {
          name: "b_tool",
          description: "does b",
          source: "imperative",
          inputSchema: { type: "object", properties: { y: { type: "string" }, x: { type: "number" } } },
        },
        {
          name: "a_tool",
          description: "searches things",
          source: "imperative",
          annotations: { readOnlyHint: true },
        },
      ],
    },
  ],
  capturedAt: "2026-01-01T00:00:00.000Z",
});

describe("canonicalizeSchema", () => {
  it("resolves local $defs and sorts keys", () => {
    const out = canonicalizeSchema({
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: { size: { $ref: "#/$defs/size" } },
      $defs: { size: { type: "string", enum: ["m", "l", "s"] } },
    });
    expect(out["$schema"]).toBeUndefined();
    expect((out["properties"] as any).size).toEqual({ type: "string", enum: ["l", "m", "s"] });
  });

  it("normalizes required (sort, dedupe, drop empty)", () => {
    const out = canonicalizeSchema({
      type: "object",
      properties: { a: {}, b: {} },
      required: ["b", "a", "b"],
    });
    expect(out["required"]).toEqual(["a", "b"]);
    const empty = canonicalizeSchema({ type: "object", properties: {}, required: [] });
    expect(empty["required"]).toBeUndefined();
  });

  it("collapses single-element type arrays", () => {
    expect(canonicalizeSchema({ type: ["string"] })["type"]).toBe("string");
    expect(canonicalizeSchema({ type: ["string", "number"] })["type"]).toEqual(["number", "string"]);
  });

  it("defaults missing schema to an empty object schema", () => {
    expect(canonicalizeSchema(undefined)).toEqual({ type: "object", properties: {} });
  });
});

describe("buildContract", () => {
  it("sorts routes and tools and computes a stable digest", () => {
    const c1 = buildContract(baseCapture());
    const c2 = buildContract(baseCapture());
    expect(c1.routes[0]!.tools.map((t) => t.name)).toEqual(["a_tool", "b_tool"]);
    expect(c1.digest).toBe(c2.digest);
    expect(c1.digest).toHaveLength(64);
  });

  it("digest ignores capturedAt / version / commit", () => {
    const a = buildContract({ ...baseCapture(), capturedAt: "2020-01-01T00:00:00.000Z" });
    const b = buildContract({
      ...baseCapture(),
      capturedAt: "2026-09-09T09:09:09.000Z",
      app: { name: "demo", version: "9.9.9", commit: "zzz" },
    });
    expect(a.digest).toBe(b.digest);
  });

  it("classifies risk from annotations and keywords", () => {
    const c = buildContract(baseCapture());
    const [a, b] = c.routes[0]!.tools;
    expect(a!.risk).toBe("read"); // readOnlyHint
    expect(b!.risk).toBe("write"); // "does b" — conservative default
  });

  it("serialize → parse round-trips and validates the digest", () => {
    const c = buildContract(baseCapture());
    const text = serializeContract(c);
    expect(text.endsWith("\n")).toBe(true);
    const parsed = parseContract(text, "roundtrip");
    expect(parsed.digest).toBe(c.digest);
  });

  it("rejects a hand-edited contract body", () => {
    const c = buildContract(baseCapture());
    const tampered = serializeContract(c).replace('"does b"', '"does something else entirely"');
    expect(() => parseContract(tampered, "tampered")).toThrow(ContractParseError);
  });
});
