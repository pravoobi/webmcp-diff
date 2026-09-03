import { parseArgs } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import {
  parseContract,
  serializeContract,
  type Contract,
} from "@webmcp-contract/contract";
import { extractContract, type ExtractConfig } from "@webmcp-contract/extract";
import {
  diffContracts,
  report,
  createClaudeSemanticJudge,
  type DiffOptions,
} from "@webmcp-contract/diff";
import { resolveFormat } from "../format.js";

const exec = promisify(execFile);

const HELP = `webmcp-contract check — CI entry point

Snapshots the running app and diffs it against the contract committed on <base>.
Exit 1 on breaking / risk-increasing changes, 0 otherwise.

  --base <ref>          Git ref to read the baseline contract from (default: origin/HEAD)
  --config <file>       Extractor config for the snapshot (required)
  --contract <path>     Path to the committed contract (default: webmcp-contract.json)
  --format <fmt>        text | md | json | sarif  (default: text)
  -o, --out <file>      Write the report here (default: stdout)
  --semantic            LLM-assisted description-drift detection
  --risk-as-warning     Don't fail on risk-increasing-only changes
  --update              After diffing, overwrite the local contract file with the new snapshot`;

export async function runCheck(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      base: { type: "string" },
      config: { type: "string" },
      contract: { type: "string", default: "webmcp-contract.json" },
      format: { type: "string" },
      out: { type: "string", short: "o" },
      semantic: { type: "boolean", default: false },
      "risk-as-warning": { type: "boolean", default: false },
      update: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    console.log(HELP);
    return 0;
  }
  if (!values.config) {
    console.error("check needs --config <file>\n");
    console.error(HELP);
    return 1;
  }

  const contractPath = values.contract;
  const base = values.base ?? "origin/HEAD";

  const baseline = await readBaselineContract(base, contractPath);
  if (!baseline) {
    console.error(
      `no baseline contract at '${base}:${contractPath}'. ` +
        `Commit a snapshot there first (webmcp-contract snapshot --config ... -o ${contractPath}).`,
    );
    return 1;
  }

  const configPath = path.resolve(values.config);
  const config = JSON.parse(await readFile(configPath, "utf8")) as ExtractConfig;
  const current: Contract = await extractContract(config, {
    configDir: path.dirname(configPath),
    onProgress: (m) => console.error(`  ${m}`),
  });

  const format = resolveFormat(values.format);
  const options: DiffOptions = {
    riskAsWarning: values["risk-as-warning"],
    ...(values.semantic ? { semantic: createClaudeSemanticJudge() } : {}),
  };

  const result = await diffContracts(baseline, current, options);
  const text = report(result, format);
  if (values.out) {
    await writeFile(path.resolve(values.out), text);
    console.error(`wrote ${values.out}`);
  } else {
    process.stdout.write(text);
  }

  if (values.update) {
    await writeFile(path.resolve(contractPath), serializeContract(current));
    console.error(`updated ${contractPath}`);
  }

  return result.exitCode;
}

async function readBaselineContract(ref: string, contractPath: string): Promise<Contract | undefined> {
  const rel = contractPath.replace(/\\/g, "/");
  try {
    const { stdout } = await exec("git", ["show", `${ref}:${rel}`], { maxBuffer: 32 * 1024 * 1024 });
    return parseContract(stdout, `${ref}:${rel}`);
  } catch {
    // ref or file not found — fall back to a local file if one exists
    try {
      return parseContract(await readFile(path.resolve(contractPath), "utf8"), contractPath);
    } catch {
      return undefined;
    }
  }
}
