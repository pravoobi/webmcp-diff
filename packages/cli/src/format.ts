import type { ReportFormat } from "@webmcp-contract/diff";

/** Accept the `md` alias for `markdown`. */
export function resolveFormat(
  value: string | undefined,
  fallback: ReportFormat = "text",
): ReportFormat {
  if (!value) return fallback;
  const v = value === "md" ? "markdown" : value;
  if (v === "text" || v === "markdown" || v === "json" || v === "sarif" || v === "html") return v;
  throw new Error(`unknown --format '${value}' (expected text | md | json | sarif | html)`);
}
