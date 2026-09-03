# webmcp-contract-diff

A **tool contract inspector and differ** for [WebMCP](https://webmachinelearning.github.io/webmcp/).

It snapshots exactly what a web app exposes to agents — tools, schemas, descriptions,
annotations, per-route lifecycle — stores that as a versioned contract file, and diffs
contracts across releases, failing CI on breaking or risk-increasing changes.

API-schema diffing is standard for REST and GraphQL (`openapi-diff`, `graphql-inspector`).
Nothing equivalent existed for WebMCP. A page's registered tools form its **Tool Contract**:
the machine-readable menu of everything an agent can do. Today that contract is implicit —
a refactor can silently drop a tool, tighten a schema, widen agent access to a destructive
action, or break every agent integration relying on it. This tool makes the contract explicit
and reviewable.

## Packages

| Package | What it does |
| --- | --- |
| [`@webmcp-contract/contract`](packages/contract) | Contract format, schema canonicalization, risk classification, digesting |
| [`@webmcp-contract/extract`](packages/extract) | Playwright extractor: crawls routes with a WebMCP polyfill injected, captures the tool list |
| [`@webmcp-contract/diff`](packages/diff) | Structural + semantic diff engine and reporters (text, markdown, json, sarif) |
| [`@webmcp-contract/cli`](packages/cli) | `webmcp-contract snapshot \| diff \| check` |
| [`action/`](action) | GitHub Action: snapshot on main, diff on PRs, comment the delta |

## Quick start

```bash
pnpm install
pnpm exec playwright install chromium

# 1. Describe your routes
cat > webmcp.config.json <<'JSON'
{
  "baseUrl": "http://localhost:3000",
  "app": { "name": "my-app" },
  "routes": [
    { "path": "/" },
    { "path": "/products" },
    { "path": "/cart", "setup": "setup/add-item.mjs", "state": "cart-has-item" }
  ]
}
JSON

# 2. Snapshot the running app
webmcp-contract snapshot --config webmcp.config.json -o webmcp-contract.json

# 3. Commit webmcp-contract.json like a lockfile, then diff future builds
webmcp-contract diff webmcp-contract.json ./next.json --format md
webmcp-contract check --base main --config webmcp.config.json   # CI entry: exit 1 on breaking/risk
```

## The contract format

`webmcp-contract.json` is canonical (sorted keys, stable ordering) so a plain `git diff` is
readable and two captures of the same build are **byte-identical**.

```jsonc
{
  "contractVersion": 1,
  "app": { "name": "dress-shop" },
  "capturedAt": "2026-01-01T00:00:00.000Z",
  "environment": { "polyfill": "@mcp-b/webmcp-polyfill@5.1.0", "surface": "document.modelContext", "extractor": "0.1.0" },
  "coverage": { "routesCaptured": ["/", "/cart", "/dresses"], "statesCaptured": ["cart-has-item"] },
  "routes": [
    {
      "path": "/dresses",
      "tools": [
        {
          "name": "search_dresses",
          "description": "Search the dress catalog and return matching products.",
          "inputSchema": { "type": "object", "properties": { "query": { "type": "string" } }, "required": ["query"] },
          "annotations": { "readOnlyHint": true },
          "source": "imperative",          // or "declarative-form"
          "risk": "read",                   // read | write | destructive  (heuristic, overridable)
          "lifecycle": "static",            // static | conditional (appears only in some states)
          "hash": "53c817e2b6bca099"
        }
      ]
    }
  ],
  "digest": "…"   // sha256 over the capture-independent body
}
```

`coverage` records what the capture actually covered, so "tool absent from the diff" is
distinguishable from "tool absent from the capture".

## Change classification

| Class | Exit code | Examples |
| --- | --- | --- |
| **Breaking** | 1 | tool removed / renamed, required input added, input removed, type narrowed, enum value removed, `readOnlyHint` true→false |
| **Risk-increasing** | 1 (configurable) | new `destructive` tool, `toolautosubmit` added to a form, risk classification rose |
| **Non-breaking** | 0 | tool added (read), optional input added, enum widened, description changed, lifecycle static↔conditional (warn) |
| **Semantic** (`--semantic`) | 1 | LLM flags a behavior change hiding in a reworded description |

Renames are detected via schema-hash + name similarity and reported as a rename (still breaking),
not as an unrelated remove + add.

## Development

```bash
pnpm test          # unit + integration (spins up the fixture shop under Playwright)
pnpm typecheck
pnpm build
pnpm fixture       # serve the two-version fixture app locally
```

The fixture in [`fixtures/shop`](fixtures/shop) is a tiny WebMCP storefront with a `v1` and a
`v2` that differ by a scripted set of contract mutations — the integration test asserts every
one is classified correctly end to end.

## License

MIT
