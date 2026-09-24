import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseContract } from "@webmcp-contract/contract";
import { archiveContract } from "../archive-core.js";

const HELP = `webmcp-contract archive <contract.json> --dir <path> --label <label>

Add a contract snapshot to a cross-release archive: one <label>.json file per
archived snapshot plus an index.json manifest, so any two releases can be
diffed later with the ordinary diff command:

  webmcp-contract diff <dir>/<labelA>.json <dir>/<labelB>.json

A no-op when the contract's digest matches the archive's most recent entry
(nothing changed since the last archived snapshot). Re-running with a label
already in the archive overwrites that entry in place.

  --dir <path>       Archive directory (required)
  --label <label>    Stable key for this snapshot, e.g. a git short SHA (required)`;

export async function runArchive(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      dir: { type: "string" },
      label: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  if (values.help || positionals.length === 0) {
    console.log(HELP);
    return values.help ? 0 : 1;
  }
  if (positionals.length !== 1) {
    console.error("archive needs exactly one contract file\n");
    console.error(HELP);
    return 1;
  }
  if (!values.dir || !values.label) {
    console.error("archive needs --dir <path> and --label <label>\n");
    console.error(HELP);
    return 1;
  }

  const [contractPath] = positionals as [string];
  const contract = parseContract(await readFile(path.resolve(contractPath), "utf8"), contractPath);

  const outcome = await archiveContract(contract, { dir: values.dir, label: values.label });
  if (outcome.archived) {
    console.log(
      `archived '${outcome.entry.label}' -> ${path.join(values.dir, outcome.entry.file)}`,
    );
  } else {
    console.log(outcome.reason ?? "nothing to archive");
  }
  return 0;
}
