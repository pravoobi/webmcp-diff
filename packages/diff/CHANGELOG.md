# @webmcp-contract/diff

## 0.3.0

### Minor Changes

- aed87f5: Add an `html` report format alongside `text`/`markdown`/`json`/`sarif` — a single
  self-contained, dependency-free HTML page (dark-mode aware) suitable for opening
  directly, uploading as a CI artifact, or hosting anywhere for a shareable diff
  report. Use `--format html -o report.html` with `diff` or `check`.
  
  Also fixed a stale placeholder repository URL in the `sarif` reporter's
  `informationUri`.

### Patch Changes

- @webmcp-contract/contract@0.3.0

## 0.2.0

### Minor Changes

- Initial release: snapshot, canonicalize, and diff the WebMCP tool contract a web app exposes to agents.
  
  - `@webmcp-contract/contract` — canonical contract format, JSON-Schema canonicalization, risk classification, digesting
  - `@webmcp-contract/extract` — Playwright extractor with an injected WebMCP polyfill, quiescence-based capture, declarative-form and conditional-tool support
  - `@webmcp-contract/diff` — breaking / risk-increasing / non-breaking classification, rename detection, optional LLM-assisted semantic drift; text / markdown / json / sarif reporters
  - `@webmcp-contract/cli` — `webmcp-contract snapshot | diff | check`

### Patch Changes

- Updated dependencies
  - @webmcp-contract/contract@0.2.0
