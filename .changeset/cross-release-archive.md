---
"@webmcp-contract/cli": minor
---

Add `webmcp-contract archive <contract.json> --dir <path> --label <label>`: writes
`<label>.json` plus an `index.json` manifest to a cross-release archive directory, so
any two releases can be diffed later with the ordinary `diff` command against two
archived files — no new tooling, no checking out old commits. A no-op when the
contract's digest matches the archive's most recent entry; re-running with an existing
label overwrites that entry in place.

`action/`'s `update-on-push` gained `archive` / `archive-path` inputs to automate this
on every push to the default branch that changes the contract, keyed by the commit's
short SHA. That step's own change-detection also moved from `git diff --quiet` to
`git status --porcelain`, fixing a latent bug where a brand-new (untracked) contract
file was never detected as a change.
