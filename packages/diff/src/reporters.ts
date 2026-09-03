import type { Change, DiffResult, Severity } from "./types.js";

export type ReportFormat = "text" | "markdown" | "json" | "sarif";

const SEVERITY_LABEL: Record<Severity, string> = {
  breaking: "BREAKING",
  risk: "RISK",
  warn: "WARN",
  info: "INFO",
};

const SEVERITY_EMOJI: Record<Severity, string> = {
  breaking: "🔴",
  risk: "🟠",
  warn: "🟡",
  info: "🔵",
};

export function report(result: DiffResult, format: ReportFormat): string {
  switch (format) {
    case "text":
      return textReport(result);
    case "markdown":
      return markdownReport(result);
    case "json":
      return JSON.stringify(result, null, 2) + "\n";
    case "sarif":
      return sarifReport(result);
  }
}

function summaryLine(result: DiffResult): string {
  const { summary } = result;
  return `${summary.breaking} breaking · ${summary.risk} risk · ${summary.warn} warn · ${summary.info} info`;
}

export function textReport(result: DiffResult): string {
  const lines: string[] = [];
  lines.push(`webmcp contract diff: ${result.from.app} ${result.from.digest.slice(0, 12)} → ${result.to.digest.slice(0, 12)}`);
  lines.push(summaryLine(result));
  lines.push("");
  if (result.changes.length === 0) {
    lines.push("No contract changes.");
    return lines.join("\n") + "\n";
  }
  for (const c of result.changes) {
    lines.push(`${SEVERITY_LABEL[c.severity].padEnd(8)} ${c.route}${c.tool ? ` › ${c.tool}` : ""}`);
    lines.push(`         ${c.message}  [${c.code}]`);
  }
  lines.push("");
  lines.push(result.exitCode === 1 ? "FAIL — breaking or risk-increasing changes present." : "OK");
  return lines.join("\n") + "\n";
}

export function markdownReport(result: DiffResult): string {
  const lines: string[] = [];
  const verdict = result.exitCode === 1 ? "🔴 **Breaking / risk-increasing changes**" : "🟢 No blocking changes";
  lines.push(`## WebMCP contract diff — ${verdict}`);
  lines.push("");
  lines.push(`\`${result.from.app}\` · \`${result.from.digest.slice(0, 12)}\` → \`${result.to.digest.slice(0, 12)}\``);
  lines.push("");
  lines.push("| Severity | Count |");
  lines.push("| --- | --- |");
  for (const sev of ["breaking", "risk", "warn", "info"] as Severity[]) {
    if (result.summary[sev] > 0) lines.push(`| ${SEVERITY_EMOJI[sev]} ${SEVERITY_LABEL[sev]} | ${result.summary[sev]} |`);
  }
  lines.push("");

  if (result.changes.length === 0) {
    lines.push("_No contract changes._");
    return lines.join("\n") + "\n";
  }

  for (const sev of ["breaking", "risk", "warn", "info"] as Severity[]) {
    const group = result.changes.filter((c) => c.severity === sev);
    if (group.length === 0) continue;
    lines.push(`### ${SEVERITY_EMOJI[sev]} ${SEVERITY_LABEL[sev]}`);
    lines.push("");
    for (const c of group) {
      lines.push(`- **${c.route}${c.tool ? ` › ${c.tool}` : ""}** — ${c.message} \`${c.code}\``);
      const frag = renderFragment(c);
      if (frag) {
        lines.push("");
        lines.push("  <details><summary>before / after</summary>");
        lines.push("");
        lines.push(frag.replace(/^/gm, "  "));
        lines.push("");
        lines.push("  </details>");
      }
    }
    lines.push("");
  }
  return lines.join("\n") + "\n";
}

function renderFragment(c: Change): string | undefined {
  if (c.before === undefined && c.after === undefined) return undefined;
  const parts: string[] = [];
  if (c.before !== undefined) {
    parts.push("```json\n// before\n" + JSON.stringify(c.before, null, 2) + "\n```");
  }
  if (c.after !== undefined) {
    parts.push("```json\n// after\n" + JSON.stringify(c.after, null, 2) + "\n```");
  }
  return parts.join("\n");
}

const SARIF_LEVEL: Record<Severity, "error" | "warning" | "note"> = {
  breaking: "error",
  risk: "error",
  warn: "warning",
  info: "note",
};

export function sarifReport(result: DiffResult): string {
  const ruleIds = [...new Set(result.changes.map((c) => c.code))].sort();
  const sarif = {
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "webmcp-contract-diff",
            informationUri: "https://github.com/webmcp/contract-diff",
            rules: ruleIds.map((id) => ({ id })),
          },
        },
        results: result.changes.map((c) => ({
          ruleId: c.code,
          level: SARIF_LEVEL[c.severity],
          message: { text: c.message },
          properties: { route: c.route, tool: c.tool ?? null, severity: c.severity },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: "webmcp-contract.json" },
                region: { startLine: 1 },
              },
              logicalLocations: [
                { fullyQualifiedName: `${c.route}${c.tool ? `#${c.tool}` : ""}`, kind: "member" },
              ],
            },
          ],
        })),
      },
    ],
  };
  return JSON.stringify(sarif, null, 2) + "\n";
}
