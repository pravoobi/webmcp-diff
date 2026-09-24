# @webmcp-contract/cli

## 0.3.0

### Minor Changes

- 017f33c: Add `webmcp-contract archive <contract.json> --dir <path> --label <label>`: writes
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
- aed87f5: Add an `html` report format alongside `text`/`markdown`/`json`/`sarif` — a single
  self-contained, dependency-free HTML page (dark-mode aware) suitable for opening
  directly, uploading as a CI artifact, or hosting anywhere for a shareable diff
  report. Use `--format html -o report.html` with `diff` or `check`.
  
  Also fixed a stale placeholder repository URL in the `sarif` reporter's
  `informationUri`.

## 0.2.0

### Minor Changes

- Initial release: snapshot, canonicalize, and diff the WebMCP tool contract a web app exposes to agents.
  
  - `@webmcp-contract/contract` — canonical contract format, JSON-Schema canonicalization, risk classification, digesting
  - `@webmcp-contract/extract` — Playwright extractor with an injected WebMCP polyfill, quiescence-based capture, declarative-form and conditional-tool support
  - `@webmcp-contract/diff` — breaking / risk-increasing / non-breaking classification, rename detection, optional LLM-assisted semantic drift; text / markdown / json / sarif reporters
  - `@webmcp-contract/cli` — `webmcp-contract snapshot | diff | check`
