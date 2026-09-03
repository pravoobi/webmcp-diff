# @webmcp-contract/diff

Structural + semantic diff engine for WebMCP contracts.

```ts
import { diffContracts, report } from "@webmcp-contract/diff";

const result = await diffContracts(oldContract, newContract, {
  riskAsWarning: false,        // risk-increasing changes fail by default
  renameThreshold: 0.7,        // schema+name similarity to call a remove+add a rename
  semantic: createClaudeSemanticJudge(),  // optional, LLM-assisted description drift
});

process.stdout.write(report(result, "markdown"));  // text | markdown | json | sarif
process.exit(result.exitCode);                      // 1 on breaking / risk-increasing
```

Each `Change` has a `severity` (`info | warn | risk | breaking`), a stable `code`
(`tool.removed`, `input.required-added`, `annotation.readonly-dropped`, `tool.renamed`,
`form.autosubmit-added`, …), the route/tool it applies to, and before/after fragments.

Coverage-aware: a route present in one contract but not re-captured in the other is reported as
`route.uncaptured` (warn), not as its tools being removed.
