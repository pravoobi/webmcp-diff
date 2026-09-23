# @webmcp-contract/extract

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
