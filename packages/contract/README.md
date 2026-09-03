# @webmcp-contract/contract

The WebMCP tool-contract format and its primitives.

- `buildContract(capture)` — assemble a canonical `Contract` from raw extractor output
  (canonicalize schemas, sort keys/tools/routes, classify risk, hash tools, compute the digest).
- `canonicalizeSchema(schema)` — resolve local `$ref`, normalize `required`/`type`/`enum`,
  collapse `anyOf`-of-`const` into `enum`, sort keys. Structurally-equivalent schemas serialize
  identically.
- `classifyRisk({ name, description, annotations }, { overrides })` — `read | write | destructive`,
  from annotations then keyword heuristics, conservative default `write`.
- `serializeContract` / `parseContract` — stable JSON on disk; parse re-verifies the digest so a
  hand-edited contract body is rejected.
- `digestContract` / `sameContractBody` — capture-independent identity (ignores `capturedAt`,
  `app.version`, `app.commit`).

Shared with the sibling `webmcp-lint` / `webmcp-codemod` tools: risk heuristics and schema
canonicalization live here on purpose.
