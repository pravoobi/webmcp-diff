import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildContract,
  parseContract,
  type AppIdentity,
  type RawTool,
} from "@webmcp-contract/contract";
import { archiveContract, type ArchiveIndex } from "../src/archive-core.js";

const env = { polyfill: "p@1", surface: "document.modelContext" as const, extractor: "0.1.0" };

function contract(tools: RawTool[], app: AppIdentity = { name: "shop" }) {
  return buildContract({
    app,
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
const deleteAccount: RawTool = {
  name: "delete_account",
  description: "Delete the account",
  source: "imperative",
};

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "webmcp-archive-test-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function readIndex(): Promise<ArchiveIndex> {
  return JSON.parse(await readFile(path.join(dir, "index.json"), "utf8"));
}

describe("archiveContract", () => {
  it("creates the archive dir, a <label>.json file, and an index on first archive", async () => {
    const outcome = await archiveContract(contract([checkout]), { dir, label: "abc1234" });
    expect(outcome.archived).toBe(true);
    expect(outcome.entry.label).toBe("abc1234");
    expect(outcome.entry.file).toBe("abc1234.json");
    expect(outcome.entry.app).toEqual({ name: "shop" });

    const index = await readIndex();
    expect(index.entries).toHaveLength(1);
    expect(index.entries[0]!.label).toBe("abc1234");

    const archived = parseContract(
      await readFile(path.join(dir, "abc1234.json"), "utf8"),
      "abc1234.json",
    );
    expect(archived.digest).toBe(outcome.entry.digest);
  });

  it("is a no-op when the digest matches the most recent entry, even under a new label", async () => {
    await archiveContract(contract([checkout]), { dir, label: "v1" });
    const outcome = await archiveContract(contract([checkout]), { dir, label: "v2" });

    expect(outcome.archived).toBe(false);
    expect(outcome.reason).toMatch(/digest unchanged since 'v1'/);

    const index = await readIndex();
    expect(index.entries).toHaveLength(1);
    expect(index.entries[0]!.label).toBe("v1");
  });

  it("appends a new entry when the digest changed", async () => {
    await archiveContract(contract([checkout]), { dir, label: "v1" });
    const outcome = await archiveContract(contract([checkout, deleteAccount]), {
      dir,
      label: "v2",
    });

    expect(outcome.archived).toBe(true);
    const index = await readIndex();
    expect(index.entries.map((e) => e.label)).toEqual(["v1", "v2"]);
    expect(index.entries[0]!.digest).not.toBe(index.entries[1]!.digest);
  });

  it("overwrites an existing label in place rather than duplicating it", async () => {
    await archiveContract(contract([checkout]), { dir, label: "v1" });
    const outcome = await archiveContract(contract([checkout, deleteAccount]), {
      dir,
      label: "v1",
    });

    expect(outcome.archived).toBe(true);
    const index = await readIndex();
    expect(index.entries).toHaveLength(1);
    expect(index.entries[0]!.label).toBe("v1");
    expect(index.entries[0]!.digest).toBe(outcome.entry.digest);

    const archived = parseContract(await readFile(path.join(dir, "v1.json"), "utf8"), "v1.json");
    expect(archived.routes[0]!.tools).toHaveLength(2);
  });

  it("records the app version when present", async () => {
    const outcome = await archiveContract(
      contract([checkout], { name: "shop", version: "1.4.0" }),
      {
        dir,
        label: "v1",
      },
    );
    expect(outcome.entry.app).toEqual({ name: "shop", version: "1.4.0" });
  });
});
