import { parseArgs } from "node:util";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { serializeContract } from "@webmcp-contract/contract";
import { resolveFormat } from "../format.js";
import { runContractCheck, BaselineError, type CheckOutcome } from "../check-core.js";

const HELP = `webmcp-contract check — CI entry point

Snapshots the running app and diffs it against the contract committed on <base>.
Exit 1 on breaking / risk-increasing changes (or a missing baseline), 0 otherwise.

  --base <ref>          Git ref holding the baseline contract (default: origin/HEAD, then HEAD)
  --config <file>       Extractor config for the snapshot (required)
  --contract <path>     Path to the committed contract (default: webmcp-contract.json)
  --format <fmt>        text | md | json | sarif | html  (default: text)
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

  const format = resolveFormat(values.format);

  let outcome: CheckOutcome;
  try {
    outcome = await runContractCheck({
      configPath: values.config,
      ...(values.base ? { base: values.base } : {}),
      contractPath: values.contract,
      format,
      riskAsWarning: values["risk-as-warning"],
      semantic: values.semantic,
      onProgress: (m) => console.error(`  ${m}`),
    });
  } catch (err) {
    if (err instanceof BaselineError) {
      console.error(`baseline: ${err.message}`);
      return 1;
    }
    throw err;
  }

  if (values.out) {
    await writeFile(path.resolve(values.out), outcome.reportText);
    console.error(`wrote ${values.out}`);
  } else {
    process.stdout.write(outcome.reportText);
  }
  console.error(`compared against ${outcome.baseline.source}`);

  if (values.update) {
    await writeFile(path.resolve(values.contract), serializeContract(outcome.current));
    console.error(`updated ${values.contract}`);
  }

  return outcome.result.exitCode;
}

// Re-export for tests and programmatic use.
export { runContractCheck, resolveBaseline, BaselineError } from "../check-core.js";
