# @webmcp-contract/cli

```
webmcp-contract snapshot --config <file> [-o contract.json] [--captured-at <iso>]
webmcp-contract snapshot --url <baseUrl> --routes <file> [--app <name>] [-o contract.json]
webmcp-contract diff <old.json> <new.json> [--format text|md|json|sarif|html] [-o <file>]
                                           [--semantic] [--risk-as-warning]
                                           [--rename-threshold <0-1>]
webmcp-contract check --base <ref> --config <file> [--contract <path>] [--format ...]
                      [--semantic] [--risk-as-warning] [--update]
webmcp-contract archive <contract.json> --dir <path> --label <label>
```

- **snapshot** — crawl routes with a WebMCP polyfill injected, write a canonical contract.
- **diff** — compare two contract files. Exit `1` on breaking / risk-increasing changes.
- **check** — snapshot the running app, diff against the contract committed on `<ref>`
  (`git show <ref>:<contract-path>`). The CI entry point.
- **archive** — add a snapshot to a cross-release archive (`<label>.json` + an `index.json`
  manifest), so any two releases can be diffed later without checking out old commits. A
  no-op when the digest matches the archive's most recent entry.

Commit `webmcp-contract.json` to your repo like a lockfile so PR diffs show contract changes in
review even without CI output.

`--semantic` needs the optional `@anthropic-ai/sdk` peer and `ANTHROPIC_API_KEY`; it runs only on
tools whose description text changed.
