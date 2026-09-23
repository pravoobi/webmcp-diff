import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractContract } from "@webmcp-contract/extract";
import { serializeContract } from "@webmcp-contract/contract";
import { runContractCheck, resolveBaseline, BaselineError } from "@webmcp-contract/cli/check";
// @ts-expect-error — plain .mjs fixture helper, no types
import { startShopServer } from "../fixtures/shop/serve.mjs";

const exec = promisify(execFile);
const fixtureDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "shop",
);

interface Server {
  url: string;
  close: () => Promise<void>;
}

async function git(cwd: string, ...args: string[]): Promise<void> {
  await exec("git", ["-c", "user.email=t@t.dev", "-c", "user.name=Test", ...args], { cwd });
}

function configFor(baseUrl: string) {
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

describe("check — baseline resolution + end-to-end (integration)", () => {
  let v1: Server;
  let v2: Server;
  let repo: string;

  beforeAll(async () => {
    v1 = (await startShopServer("1", 0)) as Server;
    v2 = (await startShopServer("2", 0)) as Server;

    repo = await mkdtemp(path.join(tmpdir(), "webmcp-check-"));
    await mkdir(path.join(repo, "setup"), { recursive: true });
    await cp(path.join(fixtureDir, "setup"), path.join(repo, "setup"), { recursive: true });

    // Config used for the *current* snapshot inside check(): points at v2.
    await writeFile(
      path.join(repo, "webmcp.config.json"),
      JSON.stringify(configFor(v2.url), null, 2),
    );
    // A second config that stays on v1, to prove an unchanged build is clean.
    await writeFile(
      path.join(repo, "webmcp.v1.config.json"),
      JSON.stringify(configFor(v1.url), null, 2),
    );

    // Commit the v1 contract as the baseline on `main`.
    const baseline = await extractContract(configFor(v1.url), {
      configDir: fixtureDir,
      capturedAt: "2026-01-01T00:00:00.000Z",
    });
    await writeFile(path.join(repo, "webmcp-contract.json"), serializeContract(baseline));

    await git(repo, "init", "-b", "main");
    await git(repo, "add", "-A");
    await git(repo, "commit", "-m", "baseline");
  }, 120_000);

  afterAll(async () => {
    await v1?.close();
    await v2?.close();
    if (repo) await rm(repo, { recursive: true, force: true });
  });

  it("reads the baseline from <ref>:<path> and flags every v1→v2 mutation", async () => {
    const { result, baseline } = await runContractCheck({
      configPath: "webmcp.config.json",
      base: "main",
      contractPath: "webmcp-contract.json",
      cwd: repo,
      format: "text",
    });

    expect(baseline.source).toBe("main:webmcp-contract.json");
    const codes = new Set(result.changes.map((c) => c.code));
    expect(codes).toContain("annotation.readonly-dropped");
    expect(codes).toContain("input.required-added");
    expect(codes).toContain("tool.renamed");
    expect(codes).toContain("tool.added-destructive");
    expect(result.exitCode).toBe(1);
  }, 60_000);

  it("exits 0 when the running build matches the committed contract", async () => {
    const { result } = await runContractCheck({
      configPath: "webmcp.v1.config.json",
      base: "main",
      contractPath: "webmcp-contract.json",
      cwd: repo,
      format: "text",
    });
    expect(result.changes).toHaveLength(0);
    expect(result.exitCode).toBe(0);
  }, 60_000);

  it("resolves a relative contract path from a subdirectory", async () => {
    await mkdir(path.join(repo, "ci"), { recursive: true });
    const res = await resolveBaseline("main", "../webmcp-contract.json", path.join(repo, "ci"));
    expect(res.source).toBe("main:../webmcp-contract.json");
    expect(res.contract.routes.length).toBeGreaterThan(0);
  });

  it("throws BaselineError for a missing ref", async () => {
    await expect(resolveBaseline("no-such-ref", "webmcp-contract.json", repo)).rejects.toThrow(
      BaselineError,
    );
  });

  it("throws BaselineError when the contract isn't committed on the ref", async () => {
    await expect(resolveBaseline("main", "not-committed.json", repo)).rejects.toThrow(
      /not committed on 'main'/,
    );
  });

  it("throws BaselineError outside a git repository", async () => {
    const nonRepo = await mkdtemp(path.join(tmpdir(), "webmcp-nogit-"));
    try {
      await expect(resolveBaseline("main", "webmcp-contract.json", nonRepo)).rejects.toThrow(
        /not inside a git repository/,
      );
    } finally {
      await rm(nonRepo, { recursive: true, force: true });
    }
  });
});
