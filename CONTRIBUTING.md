# Contributing

## Setup

```bash
pnpm install
pnpm exec playwright install chromium
```

Node 20+ and pnpm (see `packageManager` in `package.json`).

## Workflow

```bash
pnpm lint          # biome — must pass; pnpm lint:fix to auto-fix
pnpm typecheck     # tsc, no emit
pnpm test          # vitest: unit + Playwright integration
pnpm build         # tsup, all packages
```

- **Formatting/linting** is [Biome](https://biomejs.dev) (`biome.json`). Run `pnpm format` before
  committing, or wire up the editor extension.
- **Every user-facing change needs a changeset**: `pnpm changeset`. The four `@webmcp-contract/*`
  packages release as one fixed group.
- Internal packages import from source (`exports` → `./src/index.ts`); `publishConfig` swaps to
  `./dist` at publish time. Don't add `.js`-less relative imports — this is `NodeNext` ESM.

## Layout

| Path | |
| --- | --- |
| `packages/contract` | contract format, canonicalization, risk heuristics, digest |
| `packages/extract` | Playwright + injected WebMCP polyfill extractor |
| `packages/diff` | diff engine + reporters + optional semantic judge |
| `packages/cli` | `webmcp-contract` bin; `check` core is also exported at `@webmcp-contract/cli/check` |
| `fixtures/shop` | two-version WebMCP app driving the integration tests |
| `action/` | composite GitHub Action |

## Tests

`packages/*/test/*.test.ts` are fast unit tests. `test/*.integration.test.ts` spin up the fixture
shop under Chromium (slower). Add unit coverage for new classification rules in
`packages/diff/test/diff.test.ts` and, when it changes what the extractor captures, a fixture
mutation + assertion in `test/extract.integration.test.ts`.
