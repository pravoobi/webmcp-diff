# Changesets

This folder is managed by [changesets](https://github.com/changesets/changesets).

- Add a changeset for any user-facing change: `pnpm changeset` (pick the bump, write a summary).
- The four `@webmcp-contract/*` packages are a **fixed** group — they always version and publish
  together, so one changeset covers all of them.
- On merge to `main`, the release workflow opens/updates a "Version Packages" PR; merging that PR
  publishes to npm and tags the release.

See [the changesets docs](https://github.com/changesets/changesets/blob/main/docs/adding-a-changeset.md).
