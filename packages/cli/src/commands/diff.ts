import { parseArgs } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseContract } from "@webmcp-contract/contract";
import {
  diffContracts,
  report,
  createClaudeSemanticJudge,
  type DiffOptions,
} from "@webmcp-contract/diff";
import { resolveFormat } from "../format.js";

const HELP = `webmcp-contract diff <old.json> <new.json>

  --format <fmt>        text | md | json | sarif | html   (default: text)
  -o, --out <file>      Write the report here (default: stdout)
  --semantic            LLM-assisted description-drift detection (needs ANTHROPIC_API_KEY)
  --risk-as-warning     Don't fail (exit 0) on risk-increasing-only changes
  --rename-threshold <n>  Similarity 0–1 to treat a remove+add as a rename (default 0.7)`;

export async function runDiff(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      format: { type: "string" },
      out: { type: "string", short: "o" },
      semantic: { type: "boolean", default: false },
      "risk-as-warning": { type: "boolean", default: false },
      "rename-threshold": { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  if (values.help || positionals.length === 0) {
    console.log(HELP);
    return values.help ? 0 : 1;
  }
  if (positionals.length !== 2) {
    console.error("diff needs exactly two contract files: <old.json> <new.json>");
    return 1;
  }

  const [oldPath, newPath] = positionals as [string, string];
  const from = parseContract(await readFile(path.resolve(oldPath), "utf8"), oldPath);
  const to = parseContract(await readFile(path.resolve(newPath), "utf8"), newPath);

  const format = resolveFormat(values.format);
  const options: DiffOptions = {
    riskAsWarning: values["risk-as-warning"],
    ...(values["rename-threshold"] ? { renameThreshold: Number(values["rename-threshold"]) } : {}),
    ...(values.semantic ? { semantic: createClaudeSemanticJudge() } : {}),
  };

  const result = await diffContracts(from, to, options);
  const text = report(result, format);

  if (values.out) {
    await writeFile(path.resolve(values.out), text);
    console.error(`wrote ${values.out}`);
  } else {
    process.stdout.write(text);
  }
  return result.exitCode;
}
