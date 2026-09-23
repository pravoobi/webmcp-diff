import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseContract, type Contract } from "@webmcp-contract/contract";
import { extractContract, type ExtractConfig } from "@webmcp-contract/extract";
import {
  diffContracts,
  report,
  createClaudeSemanticJudge,
  type DiffResult,
  type ReportFormat,
  type SemanticJudge,
} from "@webmcp-contract/diff";

const exec = promisify(execFile);

export class BaselineError extends Error {}

export interface BaselineResult {
  contract: Contract;
  /** Human-readable origin, e.g. `main:webmcp-contract.json`. */
  source: string;
}

/** Turn a filesystem path into a git pathspec that resolves relative to cwd. */
function toGitPathspec(contractPath: string): string {
  if (path.isAbsolute(contractPath)) return contractPath.replace(/\\/g, "/");
  const norm = contractPath.replace(/\\/g, "/").replace(/^\.\//, "");
  return `./${norm}`;
}

interface GitShowError extends Error {
  stderr?: string;
}

/**
 * Read the baseline contract from `<ref>:<contractPath>`.
 *
 * When `base` is given it is the only ref tried — a failure there is fatal, never
 * silently substituted with a local file (that would let a regression pass CI
 * green by comparing the fresh snapshot against itself). When `base` is omitted,
 * `origin/HEAD` then `HEAD` are tried.
 */
export async function resolveBaseline(
  base: string | undefined,
  contractPath: string,
  cwd: string,
): Promise<BaselineResult> {
  const pathspec = toGitPathspec(contractPath);
  const refs = base ? [base] : ["origin/HEAD", "HEAD"];
  const failures: string[] = [];

  for (const ref of refs) {
    try {
      const { stdout } = await exec("git", ["show", `${ref}:${pathspec}`], {
        cwd,
        maxBuffer: 64 * 1024 * 1024,
      });
      const source = `${ref}:${contractPath}`;
      return { contract: parseContract(stdout, source), source };
    } catch (err) {
      const e = err as GitShowError;
      const stderr = (e.stderr ?? e.message ?? "").trim();
      if (/not a git repository/i.test(stderr)) {
        throw new BaselineError(`not inside a git repository (cwd: ${cwd})`);
      }
      if (/exists on disk, but not in|does not exist in|path '.*' does not exist/i.test(stderr)) {
        failures.push(`'${contractPath}' is not committed on '${ref}'`);
      } else if (
        /unknown revision|invalid object name|ambiguous argument|bad revision/i.test(stderr)
      ) {
        failures.push(`ref '${ref}' not found`);
      } else {
        failures.push(stderr || `git show ${ref}:${pathspec} failed`);
      }
    }
  }

  throw new BaselineError(
    `could not read a baseline contract (${failures.join("; ")}). ` +
      `Commit a snapshot first: webmcp-contract snapshot --config <cfg> -o ${contractPath}`,
  );
}

export interface CheckOptions {
  configPath: string;
  /** Git ref for the baseline. Omit to try `origin/HEAD` then `HEAD`. */
  base?: string;
  /** Path to the committed contract (relative to `cwd` or absolute). */
  contractPath: string;
  /** Working directory for git and for resolving the contract path. Default `process.cwd()`. */
  cwd?: string;
  format: ReportFormat;
  riskAsWarning?: boolean;
  /** `true` builds the default Claude judge; pass a function to inject one (tests). */
  semantic?: boolean | SemanticJudge;
  onProgress?: (message: string) => void;
}

export interface CheckOutcome {
  result: DiffResult;
  reportText: string;
  baseline: BaselineResult;
  current: Contract;
}

/** Snapshot the running app and diff it against the committed baseline. */
export async function runContractCheck(options: CheckOptions): Promise<CheckOutcome> {
  const cwd = options.cwd ?? process.cwd();
  const configPath = path.resolve(cwd, options.configPath);
  const config = JSON.parse(await readFile(configPath, "utf8")) as ExtractConfig;

  const baseline = await resolveBaseline(options.base, options.contractPath, cwd);

  const current = await extractContract(config, {
    configDir: path.dirname(configPath),
    ...(options.onProgress ? { onProgress: options.onProgress } : {}),
  });

  const semantic =
    typeof options.semantic === "function"
      ? options.semantic
      : options.semantic
        ? createClaudeSemanticJudge()
        : undefined;

  const result = await diffContracts(baseline.contract, current, {
    riskAsWarning: options.riskAsWarning ?? false,
    ...(semantic ? { semantic } : {}),
  });

  return { result, reportText: report(result, options.format), baseline, current };
}
