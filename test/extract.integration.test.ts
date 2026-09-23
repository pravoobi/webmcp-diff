import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { extractContract, type ExtractConfig } from "@webmcp-contract/extract";
import { serializeContract, type Contract } from "@webmcp-contract/contract";
import { diffContracts } from "@webmcp-contract/diff";
// @ts-expect-error — plain .mjs fixture helper, no types
import { startShopServer } from "../fixtures/shop/serve.mjs";

const fixtureDir = `${path.dirname(fileURLToPath(import.meta.url)).replace(/test$/, "")}fixtures/shop`;
const CAPTURED_AT = "2026-01-01T00:00:00.000Z";

interface Server {
  url: string;
  close: () => Promise<void>;
}

function configFor(baseUrl: string): ExtractConfig {
  return {
    baseUrl,
    app: { name: "dress-shop" },
    quiescenceMs: 400,
    routeTimeoutMs: 20_000,
    routes: [
      { path: "/" },
      { path: "/dresses" },
      { path: "/cart" },
      { path: "/cart", setup: "setup/cart-has-item.mjs", state: "cart-has-item" },
    ],
  };
}

async function snapshot(baseUrl: string): Promise<Contract> {
  return extractContract(configFor(baseUrl), {
    configDir: fixtureDir,
    capturedAt: CAPTURED_AT,
  });
}

describe("extractor + fixture shop (integration)", () => {
  let v1: Server;
  let v2: Server;

  beforeAll(async () => {
    v1 = (await startShopServer("1", 0)) as Server;
    v2 = (await startShopServer("2", 0)) as Server;
  }, 60_000);

  afterAll(async () => {
    await v1?.close();
    await v2?.close();
  });

  it("captures imperative, declarative, and conditional tools", async () => {
    const contract = await snapshot(v1.url);
    const tools = Object.fromEntries(
      contract.routes.flatMap((r) => r.tools.map((t) => [t.name, { ...t, route: r.path }])),
    );

    expect(tools.get_shop_info?.risk).toBe("read");
    expect(tools.search_dresses?.source).toBe("imperative");
    expect(tools.search_dresses?.inputSchema).toMatchObject({ required: ["query"] });
    expect(tools.filter_dresses?.source).toBe("declarative-form");
    expect(tools.checkout?.risk).toBe("destructive");

    // apply_promo_code only shows up after the cart-has-item setup
    expect(tools.apply_promo_code?.lifecycle).toBe("conditional");
    expect(tools.apply_promo_code?.states).toEqual(["cart-has-item"]);

    expect(contract.coverage.statesCaptured).toEqual(["cart-has-item"]);
  }, 60_000);

  it("produces byte-identical snapshots across runs of the same build", async () => {
    const a = await snapshot(v1.url);
    const b = await snapshot(v1.url);
    expect(serializeContract(a)).toBe(serializeContract(b));
    expect(a.digest).toBe(b.digest);
  }, 60_000);

  it("classifies every v1→v2 mutation end to end", async () => {
    const from = await snapshot(v1.url);
    const to = await snapshot(v2.url);
    const result = await diffContracts(from, to);
    const codes = new Set(result.changes.map((c) => c.code));

    // breaking
    expect(codes).toContain("annotation.readonly-dropped"); // get_shop_info true→false
    expect(codes).toContain("input.required-added"); // search_dresses.size
    expect(codes).toContain("input.enum-value-removed"); // color loses "blue"
    expect(codes).toContain("tool.renamed"); // checkout → place_order

    // risk
    expect(codes).toContain("form.autosubmit-added"); // filter_dresses
    expect(codes).toContain("tool.added-destructive"); // delete_account

    // non-breaking
    expect(codes).toContain("input.optional-added"); // search_dresses.sort
    expect(codes).toContain("description.changed"); // add_to_cart

    expect(result.exitCode).toBe(1);
    expect(codes).not.toContain("tool.removed"); // the rename must absorb checkout
  }, 60_000);
});
