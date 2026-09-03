# @webmcp-contract/extract

Playwright-based WebMCP tool-contract extractor.

```ts
import { extractContract } from "@webmcp-contract/extract";

const contract = await extractContract({
  baseUrl: "http://localhost:3000",
  app: { name: "my-app" },
  routes: [
    { path: "/" },
    { path: "/cart", setup: "setup/add-item.mjs", state: "cart-has-item" },
  ],
});
```

How it works:

- Injects the standalone `@mcp-b/webmcp-polyfill` IIFE via an init script (with the testing shim
  enabled), so it owns `document.modelContext` before app code runs.
- Loads each route, waits for `load` + network idle + a **registration-quiescence window**
  (the tool list must be stable across two reads), then reads `document.modelContext.getTools()`.
- Also scans the DOM for declarative `form[toolname]` tools — to label `source: "declarative-form"`
  and detect `toolautosubmit`, and as a fallback where the polyfill doesn't materialize them.
- Optional per-route `setup` modules put the app in a non-default state; tools that appear only
  then are recorded `lifecycle: "conditional"` with the state label.
- `storageState` is accepted for logged-in captures and never written into the contract.

Two runs against the same build produce byte-identical contracts.
