# Releasing

Publishing is automated with [changesets](https://github.com/changesets/changesets) +
`.github/workflows/release.yml`.

## One-time setup

Repo: `pravoobi/webmcp-diff`. Scope: `@webmcp-contract` (unclaimed on npm as of this writing).

1. ~~Replace `OWNER` placeholders~~ — done; everything points at `pravoobi/webmcp-diff`.
2. ~~Own/rename the npm scope~~ — keeping `@webmcp-contract/*`; create that npm org (free tier)
   under your npm account before the first publish.
3. **`NPM_TOKEN`** — create an npm automation token and add it as a repository secret
   (`pravoobi/webmcp-diff` → Settings → Secrets and variables → Actions). The workflow also sets
   `NPM_CONFIG_PROVENANCE=true`, so the repo must stay public or you must drop provenance.
4. Push `main`. With no changesets pending, the first run publishes the current `0.2.0`.

## Cutting a release

1. Land PRs, each with a changeset (`pnpm changeset` → pick bump, write summary). The four
   `@webmcp-contract/*` packages are a **fixed** group — one changeset versions all of them.
2. On merge to `main`, the workflow opens/updates a **"chore: version packages"** PR that applies
   the pending changesets (bumps versions, writes `CHANGELOG.md`).
3. Merge that PR. The workflow then:
   - runs `pnpm lint && typecheck && test && build`,
   - `pnpm release` → `sync-license` + build + `changeset publish` (publishes to npm, pushes
     `@webmcp-contract/<pkg>@<version>` git tags),
   - moves the `v<major>`, `v<major>.<minor>`, `v<major>.<minor>.<patch>` tags for the Action.

## Manual publish (fallback)

```bash
pnpm changeset version      # apply pending changesets locally
pnpm prepublish-check       # lint + typecheck + test
pnpm release                # sync-license + build + changeset publish  (needs npm auth)
```
