#!/usr/bin/env node
import { runSnapshot } from "./commands/snapshot.js";
import { runDiff } from "./commands/diff.js";
import { runCheck } from "./commands/check.js";

const VERSION = "0.1.0";

const USAGE = `webmcp-contract — snapshot and diff the WebMCP tool contract a web app exposes to agents

Usage:
  webmcp-contract snapshot --config <file> [-o contract.json] [--captured-at <iso>]
  webmcp-contract snapshot --url <baseUrl> --routes <file> [--app <name>] [-o contract.json]
  webmcp-contract diff <old.json> <new.json> [--format text|md|json|sarif|html] [-o <file>]
                                             [--semantic] [--risk-as-warning]
  webmcp-contract check --base <ref> --config <file> [--contract <path>] [--format ...]

Commands:
  snapshot   Crawl routes with a WebMCP polyfill injected and write a canonical contract.
  diff       Compare two contract files. Exit 1 on breaking / risk-increasing changes.
  check      Snapshot the running app, diff against the contract committed on <ref>. CI entry point.

Run 'webmcp-contract <command> --help' for command-specific options.`;

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case "snapshot":
      return runSnapshot(rest);
    case "diff":
      return runDiff(rest);
    case "check":
      return runCheck(rest);
    case "-h":
    case "--help":
    case undefined:
      console.log(USAGE);
      return command ? 0 : 1;
    case "-v":
    case "--version":
      console.log(VERSION);
      return 0;
    default:
      console.error(`Unknown command '${command}'.\n\n${USAGE}`);
      return 1;
  }
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  });
