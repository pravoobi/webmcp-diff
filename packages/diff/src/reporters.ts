import type { Change, DiffResult, Severity } from "./types.js";

export type ReportFormat = "text" | "markdown" | "json" | "sarif" | "html";

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
      return `${JSON.stringify(result, null, 2)}\n`;
    case "sarif":
      return sarifReport(result);
    case "html":
      return htmlReport(result);
  }
}

function summaryLine(result: DiffResult): string {
  const { summary } = result;
  return `${summary.breaking} breaking · ${summary.risk} risk · ${summary.warn} warn · ${summary.info} info`;
}

export function textReport(result: DiffResult): string {
  const lines: string[] = [];
  lines.push(
    `webmcp contract diff: ${result.from.app} ${result.from.digest.slice(0, 12)} → ${result.to.digest.slice(0, 12)}`,
  );
  lines.push(summaryLine(result));
  lines.push("");
  if (result.changes.length === 0) {
    lines.push("No contract changes.");
    return `${lines.join("\n")}\n`;
  }
  for (const c of result.changes) {
    lines.push(`${SEVERITY_LABEL[c.severity].padEnd(8)} ${c.route}${c.tool ? ` › ${c.tool}` : ""}`);
    lines.push(`         ${c.message}  [${c.code}]`);
  }
  lines.push("");
  lines.push(result.exitCode === 1 ? "FAIL — breaking or risk-increasing changes present." : "OK");
  return `${lines.join("\n")}\n`;
}

export function markdownReport(result: DiffResult): string {
  const lines: string[] = [];
  const verdict =
    result.exitCode === 1 ? "🔴 **Breaking / risk-increasing changes**" : "🟢 No blocking changes";
  lines.push(`## WebMCP contract diff — ${verdict}`);
  lines.push("");
  lines.push(
    `\`${result.from.app}\` · \`${result.from.digest.slice(0, 12)}\` → \`${result.to.digest.slice(0, 12)}\``,
  );
  lines.push("");
  lines.push("| Severity | Count |");
  lines.push("| --- | --- |");
  for (const sev of ["breaking", "risk", "warn", "info"] as Severity[]) {
    if (result.summary[sev] > 0)
      lines.push(`| ${SEVERITY_EMOJI[sev]} ${SEVERITY_LABEL[sev]} | ${result.summary[sev]} |`);
  }
  lines.push("");

  if (result.changes.length === 0) {
    lines.push("_No contract changes._");
    return `${lines.join("\n")}\n`;
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
  return `${lines.join("\n")}\n`;
}

function renderFragment(c: Change): string | undefined {
  if (c.before === undefined && c.after === undefined) return undefined;
  const parts: string[] = [];
  if (c.before !== undefined) {
    parts.push(`\`\`\`json\n// before\n${JSON.stringify(c.before, null, 2)}\n\`\`\``);
  }
  if (c.after !== undefined) {
    parts.push(`\`\`\`json\n// after\n${JSON.stringify(c.after, null, 2)}\n\`\`\``);
  }
  return parts.join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderJsonFragmentHtml(c: Change): string | undefined {
  if (c.before === undefined && c.after === undefined) return undefined;
  const parts: string[] = [];
  if (c.before !== undefined) {
    parts.push(
      `<div class="frag"><div class="frag-label">before</div><pre>${escapeHtml(JSON.stringify(c.before, null, 2))}</pre></div>`,
    );
  }
  if (c.after !== undefined) {
    parts.push(
      `<div class="frag"><div class="frag-label">after</div><pre>${escapeHtml(JSON.stringify(c.after, null, 2))}</pre></div>`,
    );
  }
  return `<div class="frags">${parts.join("")}</div>`;
}

/**
 * A single self-contained HTML file (no external CSS/JS) — safe to open directly via `file://`,
 * upload as a CI artifact, or host anywhere (e.g. GitHub Pages) for a shareable diff report.
 */
export function htmlReport(result: DiffResult): string {
  const verdict =
    result.exitCode === 1 ? "🔴 Breaking / risk-increasing changes" : "🟢 No blocking changes";
  const title = `WebMCP contract diff — ${escapeHtml(result.from.app)}`;

  const summaryRows = (["breaking", "risk", "warn", "info"] as Severity[])
    .filter((sev) => result.summary[sev] > 0)
    .map(
      (sev) =>
        `<span class="pill pill-${sev}">${SEVERITY_EMOJI[sev]} ${SEVERITY_LABEL[sev]} <b>${result.summary[sev]}</b></span>`,
    )
    .join("");

  const groups = (["breaking", "risk", "warn", "info"] as Severity[])
    .map((sev) => {
      const changes = result.changes.filter((c) => c.severity === sev);
      if (changes.length === 0) return "";
      const items = changes
        .map((c) => {
          const where = `${escapeHtml(c.route)}${c.tool ? ` › ${escapeHtml(c.tool)}` : ""}`;
          const frag = renderJsonFragmentHtml(c);
          return `<li class="change">
            <div class="change-head"><span class="where">${where}</span><code class="code">${escapeHtml(c.code)}</code></div>
            <p class="message">${escapeHtml(c.message)}</p>
            ${frag ? `<details><summary>before / after</summary>${frag}</details>` : ""}
          </li>`;
        })
        .join("");
      return `<section class="group group-${sev}">
        <h2>${SEVERITY_EMOJI[sev]} ${SEVERITY_LABEL[sev]}</h2>
        <ul>${items}</ul>
      </section>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #ffffff; --fg: #1a1a1a; --muted: #666666; --border: #e2e2e2; --card: #f7f7f8;
    --breaking: #dc2626; --risk: #ea580c; --warn: #ca8a04; --info: #2563eb;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #17181c; --fg: #eaeaea; --muted: #9a9a9a; --border: #333438; --card: #1f2024; }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2rem 1.25rem 4rem; background: var(--bg); color: var(--fg);
    font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  main { max-width: 860px; margin: 0 auto; }
  h1 { font-size: 1.3rem; margin: 0 0 0.25rem; }
  .digests { color: var(--muted); font-size: 0.9rem; margin: 0 0 1.25rem; }
  .digests code { background: var(--card); padding: 0.1rem 0.4rem; border-radius: 4px; }
  .verdict { font-weight: 600; margin: 0 0 1.25rem; }
  .pills { display: flex; gap: 0.5rem; flex-wrap: wrap; margin: 0 0 2rem; }
  .pill { border: 1px solid var(--border); border-radius: 999px; padding: 0.3rem 0.75rem; font-size: 0.9rem; }
  .pill b { font-variant-numeric: tabular-nums; }
  .group { margin: 0 0 2rem; }
  .group h2 { font-size: 1rem; margin: 0 0 0.75rem; }
  .group-breaking h2 { color: var(--breaking); }
  .group-risk h2 { color: var(--risk); }
  .group-warn h2 { color: var(--warn); }
  .group-info h2 { color: var(--info); }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.75rem; }
  .change { border: 1px solid var(--border); border-radius: 8px; padding: 0.85rem 1rem; background: var(--card); }
  .change-head { display: flex; justify-content: space-between; align-items: baseline; gap: 0.75rem; }
  .where { font-weight: 600; }
  .code { font-size: 0.8rem; color: var(--muted); white-space: nowrap; }
  .message { margin: 0.35rem 0 0; }
  details { margin-top: 0.6rem; }
  summary { cursor: pointer; color: var(--muted); font-size: 0.85rem; }
  .frags { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 0.5rem; }
  .frag { flex: 1 1 260px; min-width: 0; }
  .frag-label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.25rem; }
  pre { margin: 0; padding: 0.6rem 0.7rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; overflow-x: auto; font-size: 0.8rem; }
  .empty { color: var(--muted); }
</style>
</head>
<body>
<main>
  <h1>${title}</h1>
  <p class="digests"><code>${result.from.digest.slice(0, 12)}</code> → <code>${result.to.digest.slice(0, 12)}</code></p>
  <p class="verdict">${verdict}</p>
  ${summaryRows ? `<div class="pills">${summaryRows}</div>` : ""}
  ${result.changes.length === 0 ? '<p class="empty">No contract changes.</p>' : groups}
</main>
</body>
</html>
`;
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
    $schema:
      "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "webmcp-contract-diff",
            informationUri: "https://github.com/pravoobi/webmcp-diff",
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
  return `${JSON.stringify(sarif, null, 2)}\n`;
}
