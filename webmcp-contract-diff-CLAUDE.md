# CLAUDE.md — webmcp-contract-diff

A "tool contract" inspector and differ: it snapshots exactly what a web app exposes to agents via WebMCP (tools, schemas, descriptions, annotations, per-route lifecycle), stores that as a versioned contract file, and diffs contracts across releases — failing CI on breaking or risk-increasing changes.

## Why this exists

A page's registered tools form its Tool Contract — the machine-readable menu of everything an agent can do. Today that contract is implicit and invisible: a refactor can silently drop a tool, change a schema, widen agent access to a destructive action, or break every agent integration relying on it. API-schema diffing is standard for REST/GraphQL (openapi-diff, graphql-inspector); nothing equivalent exists for WebMCP. This is that tool.

## Deliverables

1. `packages/extract` — Playwright-based extractor: crawls configured routes, captures registered tools into a canonical contract document
2. `packages/contract` — contract format, canonicalization, semver-style classification of changes
3. `packages/diff` — structural + semantic diff engine, reporters (text, markdown, json, sarif, html)
4. `packages/cli` — `webmcp-contract snapshot|diff|check`
5. `action/` — GitHub Action: snapshot on main, diff on PRs, comment the delta
6. Later: tiny web viewer (static HTML) for browsing/sharing a contract or a diff

## Contract format

`webmcp-contract.json` (canonical, sorted, stable ordering so plain `git diff` is also readable):

```jsonc
{
  "contractVersion": 1,
  "app": { "name": "try-on", "version": "1.4.0", "commit": "abc123" },
  "capturedAt": "…",
  "environment": { "polyfill": "@mcp-b/webmcp-polyfill@x.y", "surface": "document.modelContext" },
  "routes": [
    {
      "path": "/dresses",
      "tools": [
        {
          "name": "search_dresses",
          "description": "…",
          "inputSchema": { /* canonicalized JSON Schema */ },
          "annotations": { "readOnlyHint": true },
          "source": "imperative",            // or "declarative-form"
          "risk": "read",                    // read | write | destructive (heuristic + overridable)
          "lifecycle": "static"              // static | conditional (appears only in some states)
        }
      ]
    }
  ]
}
```

Canonicalization rules: sort keys, normalize schema (resolve `$ref`s where local, drop key ordering, normalize `required` arrays), strip volatile fields. Hash each tool for fast identity checks.

## Extractor

- Playwright loads each route with `@mcp-b/webmcp-polyfill` injected (init script), then reads the registered tool list via the polyfill's introspection/testing surface; `--chrome-native` mode for flag-enabled Chrome + inspector-extension parity checks
- Also parse declarative forms straight from the DOM (`form[toolname]` + inputs → schema, matching browser inference: enums from `<select>`, required from `required`, types from `input type`) so declarative tools appear even where the polyfill doesn't materialize them
- **Stateful capture**: contracts can differ by app state (tools that appear mid-flow). Support optional per-route `setup` scripts (Playwright steps: "add item to cart") and record those tools with `lifecycle: "conditional"` + the state label
- Auth: accept storageState / cookie file for logged-in captures; never store credentials in the contract
- Determinism: two runs on the same build must produce byte-identical contracts (retry/settle logic for async registration; wait for network idle + a registration-quiescence window)

## Diff engine

Change classification (drives exit codes):

**Breaking (error)**
- Tool removed or renamed (rename detected via schema-hash similarity → reported as rename, still breaking)
- Required input added; input removed; type narrowed; enum value removed
- `readOnlyHint` true→false (a "safe" tool became state-changing)

**Risk-increasing (error by default, configurable)**
- New `destructive`-classified tool added
- `toolautosubmit` added to a form tool
- Confirmation/gating removed (annotation or detected pattern)

**Non-breaking (warn/info)**
- Tool added (read), optional input added, enum widened, description changed (info, but flag *semantic* description drift — see below)
- Lifecycle change static↔conditional (warn: agents may stop finding it)

**Semantic layer (optional, LLM-assisted)**
- `--semantic` flag: send old/new descriptions to Claude API to flag meaning changes that structural diff misses ("searches products" → "searches and adds first result to cart" = behavior change hiding in prose). Off by default; runs only on changed descriptions to keep cost near zero.

## CLI

```
webmcp-contract snapshot --url http://localhost:3000 --routes routes.json -o contract.json
webmcp-contract diff old.json new.json [--format md|json|sarif|html] [--semantic]
webmcp-contract check --base main       # snapshot current, diff vs contract committed on base branch
```

`check` is the CI entry: exit 1 on breaking/risk-increasing, 0 otherwise. Encourage committing `webmcp-contract.json` to the repo (like a lockfile) so PR diffs show contract changes in review even without CI output.

## GitHub Action

- On PR: build+serve, `check`, post a markdown comment: summary table + per-change details (before/after schema fragments), collapsible
- On main: refresh committed contract (or store as artifact/release asset per release tag for cross-release diffs)

## Testing

- Fixture app with scripted contract mutations (remove tool, tighten schema, flip readOnlyHint, add autosubmit); assert classification for each
- Determinism test: snapshot twice, assert byte equality
- Golden markdown diff outputs

## Risks / open questions

- Registration surface drift (`navigator.` vs `document.modelContext`) across Chrome/polyfill versions — record surface in `environment`, abstract behind one adapter, and re-verify current spec at implementation time
- Conditional tools are the hard 20%: keep v1 honest by marking coverage ("routes captured, states captured") in the contract header so absence of a tool in the diff is distinguishable from absence in the capture
- Polyfill introspection API may change under the 4.x beta — pin versions, wrap in an interface

## Relationship to the other two tools

- `webmcp-codemod` creates tools → `webmcp-lint` validates them per-build → `webmcp-contract-diff` governs how they evolve across builds. Shared bits worth extracting into a common package early: risk classification heuristics, schema canonicalization, the registration-surface adapter, and the Playwright+polyfill page harness.

## Milestones

- M1: extractor + contract format, deterministic snapshots of a fixture app
- M2: diff engine with breaking/non-breaking classification, markdown reporter
- M3: `check` + GitHub Action + committed-contract workflow
- M4: semantic diff flag, rename detection, cross-release archive; dogfood on try-on app; publish

## Implementation status

pnpm monorepo (`packages/{contract,extract,diff,cli}`, `fixtures/shop`, `action/`). `pnpm lint`
(Biome), `pnpm typecheck`, `pnpm test` (40), `pnpm build` all green; see `README.md` for usage,
`CONTRIBUTING.md` / `RELEASING.md` for workflow. Versioning via changesets (the four packages are
a fixed group); `.github/workflows/{ci,release}.yml`.

- **M1 — done.** `@webmcp-contract/contract` (canonicalization, risk classify, digest,
  serialize/parse-with-digest-check) and `@webmcp-contract/extract` (Playwright + injected
  `@mcp-b/webmcp-polyfill@5.1.0` IIFE + testing shim, registration-quiescence wait, declarative
  `form[toolname]` DOM scan, per-route `setup` state capture → `lifecycle: conditional`).
  Byte-identical repeat snapshots are asserted in the integration test.
- **M2 — done.** `@webmcp-contract/diff`: severity model (`info|warn|risk|breaking`), schema diff
  (required/removed/type-narrowed/enum), annotation + risk + lifecycle + source diff, rename
  detection (schema+name similarity), coverage-aware route handling. Reporters: text, markdown
  (grouped, collapsible before/after), json, sarif.
- **M3 — mostly done.** CLI `snapshot|diff|check`. `check` core is `packages/cli/src/check-core.ts`
  (`runContractCheck` / `resolveBaseline` / `BaselineError`), exported at `@webmcp-contract/cli/check`;
  it reads the baseline with `git show <ref>:./<path>` (cwd-relative, works from subdirs) and treats
  an explicit `--base` failure as fatal rather than silently comparing the snapshot to itself.
  `test/check.integration.test.ts` exercises it against a real temp git repo (mutation classification,
  clean build, missing ref, uncommitted path, non-repo). `action/action.yml` composite Action:
  fetch base ref → start app → `check` → PR comment (upsert via `gh api`) → optional contract refresh
  on push. Release automation is wired (`release.yml` + changesets, moves `v0`/`v0.x`/`v0.x.y` tags).
  Repo is `pravoobi/webmcp-diff`. **Published** — `@webmcp-contract/{contract,extract,diff,cli}@0.2.0`
  are live on npm (manual first publish 2026-09-23; org + `NPM_TOKEN` set up); `pravoobi/webmcp-diff/action@v0`
  is tagged and usable. **Open:** the release workflow's `NPM_TOKEN` is a token type that still requires
  interactive npm OTP, so CI-driven publishes on future changesets will fail until it's swapped for an
  npm Automation token (see `RELEASING.md`).
- **M4 — mostly done.** Rename detection done. `--semantic` implemented
  (`createClaudeSemanticJudge`, `@anthropic-ai/sdk`, default model `claude-opus-5`, runs only on
  changed descriptions). Dogfooded 2026-09-23 against a real WebMCP app (`try-on`): `snapshot`
  correctly captured all 5 real tools; `diff`/`check` correctly classified real breaking edits
  (readOnlyHint drop, required-input-added) with exit code 1, confirmed against the published npm
  package via `npx`, not just the local build. Testing `action/action.yml` itself via `act` (local
  GitHub Actions runner) surfaced and fixed a real bug: the "Diff contract" / "Comment on PR" steps
  crashed on `cat`ing a report that doesn't exist when `check` hits a `BaselineError` (the standard
  first-time-setup state) — fixed in `aeadfda`, `v0`/`v0.2` moved, `v0.2.1` cut. Not done:
  cross-release archive.

Fixture `fixtures/shop` has a `v1` and `v2` differing by scripted mutations (readOnlyHint flip,
tightened schema, enum removal, form `toolautosubmit`, tool rename, new destructive tool); the
integration test asserts each is classified correctly end to end.
