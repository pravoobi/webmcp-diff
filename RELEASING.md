# Releasing

Publishing is automated with [changesets](https://github.com/changesets/changesets) +
`.github/workflows/release.yml`.

## One-time setup — done

Repo: `pravoobi/webmcp-diff`. Scope: `@webmcp-contract` (npm org created, owned by `pravoobi`).
`0.2.0` of all four packages was published manually from a local machine on 2026-09-23 (see
"Manual publish" below) because CI's `NPM_TOKEN` couldn't clear npm's OTP prompt — see the next
section before relying on `release.yml` for the next release.

### Known issue: swap `NPM_TOKEN` for an Automation token

The current `NPM_TOKEN` repo secret is a token type that still requires an interactive OTP on
publish (`ERR_PNPM_OTP_NON_INTERACTIVE` in CI). Non-interactive CI can never supply that code, so
`release.yml` will fail the moment a changeset actually needs publishing. Fix once, before the next
release:

1. npmjs.com → Access Tokens → Generate New Token → **Automation** (not "Publish"). Automation
   tokens are explicitly designed to publish from CI without an OTP prompt, even with 2FA enabled
   on the account.
2. Replace the `NPM_TOKEN` value in `pravoobi/webmcp-diff` → Settings → Secrets and variables →
   Actions with the new token.
3. The workflow also sets `NPM_CONFIG_PROVENANCE=true`, so the repo must stay public or you must
   drop provenance.

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
