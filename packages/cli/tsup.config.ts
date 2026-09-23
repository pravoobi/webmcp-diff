import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/bin.ts", "src/check-core.ts"],
  format: ["esm"],
  dts: { entry: "src/check-core.ts" },
  clean: true,
  // Bundle the workspace libs so the published CLI is self-contained;
  // keep playwright and the optional Anthropic SDK external.
  noExternal: [/^@webmcp-contract\//],
  external: ["playwright", "@anthropic-ai/sdk"],
});
