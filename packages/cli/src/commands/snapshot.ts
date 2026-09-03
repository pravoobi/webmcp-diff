import { parseArgs } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { extractContract, type ExtractConfig } from "@webmcp-contract/extract";
import { serializeContract } from "@webmcp-contract/contract";

const HELP = `webmcp-contract snapshot — capture a WebMCP tool contract

  --config <file>       Full extractor config (JSON): baseUrl, app, routes[], ...
  --url <baseUrl>       Base URL (alternative to --config)
  --routes <file>       JSON file: array of route paths or route configs (with --url)
  --app <name>          App name (with --url; default: host of --url)
  -o, --out <file>      Write contract here (default: stdout)
  --captured-at <iso>   Fixed capture timestamp (for reproducible snapshots)
  --quiet               Suppress progress output`;

export async function runSnapshot(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      config: { type: "string" },
      url: { type: "string" },
      routes: { type: "string" },
      app: { type: "string" },
      out: { type: "string", short: "o" },
      "captured-at": { type: "string" },
      quiet: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    console.log(HELP);
    return 0;
  }

  let config: ExtractConfig;
  let configDir = process.cwd();

  if (values.config) {
    const configPath = path.resolve(values.config);
    config = JSON.parse(await readFile(configPath, "utf8")) as ExtractConfig;
    configDir = path.dirname(configPath);
  } else if (values.url && values.routes) {
    const routesPath = path.resolve(values.routes);
    const routesRaw = JSON.parse(await readFile(routesPath, "utf8")) as unknown;
    configDir = path.dirname(routesPath);
    let routes: ExtractConfig["routes"];
    let embedded: Partial<ExtractConfig> = {};
    if (Array.isArray(routesRaw)) {
      routes = routesRaw.map((r) => (typeof r === "string" ? { path: r } : (r as ExtractConfig["routes"][number])));
    } else if (routesRaw && typeof routesRaw === "object" && Array.isArray((routesRaw as ExtractConfig).routes)) {
      embedded = routesRaw as Partial<ExtractConfig>;
      routes = (routesRaw as ExtractConfig).routes;
    } else {
      throw new Error(`${values.routes}: expected an array of paths or an object with routes[]`);
    }
    config = {
      baseUrl: values.url,
      app: { name: values.app ?? new URL(values.url).host, ...embedded.app },
      routes,
      ...(embedded.storageState ? { storageState: embedded.storageState } : {}),
      ...(embedded.riskOverrides ? { riskOverrides: embedded.riskOverrides } : {}),
    };
  } else {
    console.error("snapshot needs either --config <file> or --url <baseUrl> --routes <file>\n");
    console.error(HELP);
    return 1;
  }

  const contract = await extractContract(config, {
    configDir,
    ...(values["captured-at"] ? { capturedAt: values["captured-at"] } : {}),
    onProgress: values.quiet ? undefined : (m) => console.error(`  ${m}`),
  });

  const output = serializeContract(contract);
  if (values.out) {
    await writeFile(path.resolve(values.out), output);
    if (!values.quiet) {
      console.error(
        `wrote ${values.out} — ${contract.routes.length} route(s), ` +
          `${contract.routes.reduce((n, r) => n + r.tools.length, 0)} tool(s), digest ${contract.digest.slice(0, 12)}`,
      );
    }
  } else {
    process.stdout.write(output);
  }
  return 0;
}
