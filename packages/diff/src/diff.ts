import {
  RISK_ORDER,
  canonicalJson,
  type Contract,
  type ContractRoute,
  type ContractTool,
  type JsonValue,
} from "@webmcp-contract/contract";
import { diffSchema } from "./schema-diff.js";
import {
  SEVERITY_ORDER,
  type Change,
  type DiffOptions,
  type DiffResult,
  type Severity,
} from "./types.js";

const DEFAULT_RENAME_THRESHOLD = 0.7;

/** Diff two contracts. `from` is the baseline, `to` is the candidate. */
export async function diffContracts(
  from: Contract,
  to: Contract,
  options: DiffOptions = {},
): Promise<DiffResult> {
  const changes: Change[] = [];
  const renameThreshold = options.renameThreshold ?? DEFAULT_RENAME_THRESHOLD;

  const fromRoutes = new Map(from.routes.map((r) => [r.path, r]));
  const toRoutes = new Map(to.routes.map((r) => [r.path, r]));
  const allPaths = [...new Set([...fromRoutes.keys(), ...toRoutes.keys()])].sort();

  // Coverage: a route present in one capture but not the other may just be
  // uncaptured rather than genuinely gone.
  const fromCovered = new Set(from.coverage?.routesCaptured ?? []);
  const toCovered = new Set(to.coverage?.routesCaptured ?? []);

  for (const path of allPaths) {
    const oldRoute = fromRoutes.get(path);
    const newRoute = toRoutes.get(path);

    if (oldRoute && !newRoute) {
      if (!toCovered.has(path) && toCovered.size > 0) {
        changes.push({
          severity: "warn",
          code: "route.uncaptured",
          route: path,
          message: `route '${path}' was not captured in the new contract — its ${oldRoute.tools.length} tool(s) can't be compared`,
        });
      } else {
        for (const tool of oldRoute.tools) {
          changes.push(removedToolChange(path, tool));
        }
      }
      continue;
    }
    if (!oldRoute && newRoute) {
      if (!fromCovered.has(path) && fromCovered.size > 0) {
        changes.push({
          severity: "info",
          code: "route.newly-captured",
          route: path,
          message: `route '${path}' is new in the capture set`,
        });
      }
      for (const tool of newRoute.tools) {
        changes.push(addedToolChange(path, tool));
      }
      continue;
    }
    if (oldRoute && newRoute) {
      changes.push(...(await diffRoute(oldRoute, newRoute, renameThreshold, options)));
    }
  }

  return finalize(from, to, changes, options);
}

async function diffRoute(
  oldRoute: ContractRoute,
  newRoute: ContractRoute,
  renameThreshold: number,
  options: DiffOptions,
): Promise<Change[]> {
  const changes: Change[] = [];
  const path = oldRoute.path;
  const oldByName = new Map(oldRoute.tools.map((t) => [t.name, t]));
  const newByName = new Map(newRoute.tools.map((t) => [t.name, t]));

  const removed = oldRoute.tools.filter((t) => !newByName.has(t.name));
  const added = newRoute.tools.filter((t) => !oldByName.has(t.name));
  const matchedRenames = detectRenames(removed, added, renameThreshold);

  for (const { from: oldTool, to: newTool, score } of matchedRenames) {
    changes.push({
      severity: "breaking",
      code: "tool.renamed",
      route: path,
      tool: oldTool.name,
      message: `tool '${oldTool.name}' renamed to '${newTool.name}' (schema ${Math.round(score * 100)}% similar) — agents referencing the old name break`,
      before: oldTool.name,
      after: newTool.name,
    });
    changes.push(...(await diffTool(path, oldTool, newTool, options)));
  }

  const renamedFrom = new Set(matchedRenames.map((m) => m.from.name));
  const renamedTo = new Set(matchedRenames.map((m) => m.to.name));

  for (const tool of removed) {
    if (!renamedFrom.has(tool.name)) changes.push(removedToolChange(path, tool));
  }
  for (const tool of added) {
    if (!renamedTo.has(tool.name)) changes.push(addedToolChange(path, tool));
  }
  for (const oldTool of oldRoute.tools) {
    const newTool = newByName.get(oldTool.name);
    if (newTool) changes.push(...(await diffTool(path, oldTool, newTool, options)));
  }

  return changes;
}

async function diffTool(
  route: string,
  oldTool: ContractTool,
  newTool: ContractTool,
  options: DiffOptions,
): Promise<Change[]> {
  const changes: Change[] = [];
  const tool = oldTool.name;
  if (oldTool.hash === newTool.hash && oldTool.description === newTool.description) {
    return changes;
  }

  // --- annotations: readOnlyHint ---
  const oldRO = oldTool.annotations["readOnlyHint"];
  const newRO = newTool.annotations["readOnlyHint"];
  if (oldRO === true && newRO !== true) {
    changes.push({
      severity: "breaking",
      code: "annotation.readonly-dropped",
      route,
      tool,
      message: `'${tool}' was readOnlyHint:true and no longer is — a "safe" tool became state-changing`,
      before: true,
      after: newRO ?? null,
    });
  } else if (oldRO !== true && newRO === true) {
    changes.push({
      severity: "info",
      code: "annotation.readonly-added",
      route,
      tool,
      message: `'${tool}' is now marked readOnlyHint:true`,
    });
  }

  // --- annotations: destructiveHint ---
  if (oldTool.annotations["destructiveHint"] !== true && newTool.annotations["destructiveHint"] === true) {
    changes.push({
      severity: "risk",
      code: "annotation.destructive-added",
      route,
      tool,
      message: `'${tool}' is now marked destructiveHint:true`,
    });
  }

  // --- declarative autosubmit ---
  const oldAuto = oldTool.annotations["autoSubmit"] === true;
  const newAuto = newTool.annotations["autoSubmit"] === true;
  if (!oldAuto && newAuto) {
    changes.push({
      severity: "risk",
      code: "form.autosubmit-added",
      route,
      tool,
      message: `'${tool}' gained toolautosubmit — an agent can now submit this form without a human step`,
    });
  } else if (oldAuto && !newAuto) {
    changes.push({
      severity: "info",
      code: "form.autosubmit-removed",
      route,
      tool,
      message: `'${tool}' no longer auto-submits`,
    });
  }

  // --- other annotation changes ---
  for (const key of annotationKeys(oldTool, newTool)) {
    if (["readOnlyHint", "destructiveHint", "autoSubmit"].includes(key)) continue;
    const ov = oldTool.annotations[key];
    const nv = newTool.annotations[key];
    if (canonicalJson(ov ?? null) === canonicalJson(nv ?? null)) continue;
    changes.push({
      severity: "warn",
      code: "annotation.changed",
      route,
      tool,
      message: `'${tool}' annotation '${key}' changed: ${JSON.stringify(ov ?? null)} → ${JSON.stringify(nv ?? null)}`,
      before: (ov ?? null) as JsonValue,
      after: (nv ?? null) as JsonValue,
    });
  }

  // --- risk ---
  if (RISK_ORDER[newTool.risk] > RISK_ORDER[oldTool.risk]) {
    changes.push({
      severity: "risk",
      code: "tool.risk-increased",
      route,
      tool,
      message: `'${tool}' risk classification rose ${oldTool.risk} → ${newTool.risk}`,
      before: oldTool.risk,
      after: newTool.risk,
    });
  } else if (RISK_ORDER[newTool.risk] < RISK_ORDER[oldTool.risk]) {
    changes.push({
      severity: "info",
      code: "tool.risk-decreased",
      route,
      tool,
      message: `'${tool}' risk classification fell ${oldTool.risk} → ${newTool.risk}`,
      before: oldTool.risk,
      after: newTool.risk,
    });
  }

  // --- lifecycle ---
  if (oldTool.lifecycle === "static" && newTool.lifecycle === "conditional") {
    changes.push({
      severity: "warn",
      code: "lifecycle.now-conditional",
      route,
      tool,
      message: `'${tool}' is now conditional (only appears in: ${(newTool.states ?? []).join(", ") || "some states"}) — agents may stop finding it`,
    });
  } else if (oldTool.lifecycle === "conditional" && newTool.lifecycle === "static") {
    changes.push({
      severity: "info",
      code: "lifecycle.now-static",
      route,
      tool,
      message: `'${tool}' is now always present`,
    });
  }

  // --- source ---
  if (oldTool.source !== newTool.source) {
    changes.push({
      severity: "warn",
      code: "tool.source-changed",
      route,
      tool,
      message: `'${tool}' changed source ${oldTool.source} → ${newTool.source}`,
      before: oldTool.source,
      after: newTool.source,
    });
  }

  // --- input schema ---
  for (const sc of diffSchema(oldTool.inputSchema, newTool.inputSchema)) {
    changes.push({
      severity: sc.severity,
      code: sc.code,
      route,
      tool,
      message: `'${tool}': ${sc.message}`,
      ...(sc.before !== undefined ? { before: sc.before } : {}),
      ...(sc.after !== undefined ? { after: sc.after } : {}),
    });
  }

  // --- description ---
  if (oldTool.description !== newTool.description) {
    let semanticNote: Change | undefined;
    if (options.semantic && oldTool.description && newTool.description) {
      try {
        const verdict = await options.semantic({
          route,
          tool,
          before: oldTool.description,
          after: newTool.description,
        });
        if (verdict.behaviorChanged) {
          semanticNote = {
            severity: "risk",
            code: "description.behavior-drift",
            route,
            tool,
            message: `'${tool}' description implies a behavior change: ${verdict.rationale}`,
            before: oldTool.description,
            after: newTool.description,
          };
        }
      } catch {
        // semantic judge is best-effort; fall through to the plain info change
      }
    }
    changes.push(
      semanticNote ?? {
        severity: "info",
        code: "description.changed",
        route,
        tool,
        message: `'${tool}' description changed`,
        before: oldTool.description,
        after: newTool.description,
      },
    );
  }

  return changes;
}

function annotationKeys(a: ContractTool, b: ContractTool): string[] {
  return [...new Set([...Object.keys(a.annotations), ...Object.keys(b.annotations)])].sort();
}

function removedToolChange(route: string, tool: ContractTool): Change {
  return {
    severity: "breaking",
    code: "tool.removed",
    route,
    tool: tool.name,
    message: `tool '${tool.name}' removed — any agent relying on it breaks`,
    before: toolFragment(tool),
  };
}

function addedToolChange(route: string, tool: ContractTool): Change {
  const risky = tool.risk === "destructive";
  return {
    severity: risky ? "risk" : "info",
    code: risky ? "tool.added-destructive" : "tool.added",
    route,
    tool: tool.name,
    message: risky
      ? `new destructive tool '${tool.name}' added — agents can now trigger it`
      : `new tool '${tool.name}' added (${tool.risk})`,
    after: toolFragment(tool),
  };
}

function toolFragment(tool: ContractTool): JsonValue {
  return {
    name: tool.name,
    risk: tool.risk,
    source: tool.source,
    annotations: tool.annotations as JsonValue,
    inputSchema: tool.inputSchema as JsonValue,
  };
}

// --- rename detection ---------------------------------------------------------

interface RenameMatch {
  from: ContractTool;
  to: ContractTool;
  score: number;
}

/** Greedy best-match pairing of removed↔added tools by schema + name similarity. */
function detectRenames(
  removed: ContractTool[],
  added: ContractTool[],
  threshold: number,
): RenameMatch[] {
  const candidates: RenameMatch[] = [];
  for (const r of removed) {
    for (const a of added) {
      const score = similarity(r, a);
      if (score >= threshold) candidates.push({ from: r, to: a, score });
    }
  }
  candidates.sort((x, y) => y.score - x.score);
  const usedFrom = new Set<string>();
  const usedTo = new Set<string>();
  const matches: RenameMatch[] = [];
  for (const c of candidates) {
    if (usedFrom.has(c.from.name) || usedTo.has(c.to.name)) continue;
    usedFrom.add(c.from.name);
    usedTo.add(c.to.name);
    matches.push(c);
  }
  return matches;
}

function similarity(a: ContractTool, b: ContractTool): number {
  const schemaEqual =
    canonicalJson(a.inputSchema as JsonValue) === canonicalJson(b.inputSchema as JsonValue);
  const schemaScore = schemaEqual ? 1 : jaccardTokens(a.inputSchema, b.inputSchema);
  const nameScore = diceCoefficient(a.name, b.name);
  const descScore = a.description && b.description ? diceCoefficient(a.description, b.description) : 0;
  return 0.6 * schemaScore + 0.25 * nameScore + 0.15 * descScore;
}

function jaccardTokens(a: unknown, b: unknown): number {
  const ta = new Set(JSON.stringify(a).match(/[A-Za-z0-9_]+/g) ?? []);
  const tb = new Set(JSON.stringify(b).match(/[A-Za-z0-9_]+/g) ?? []);
  if (ta.size === 0 && tb.size === 0) return 1;
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return union === 0 ? 0 : inter / union;
}

function diceCoefficient(a: string, b: string): number {
  const bigrams = (s: string): string[] => {
    const g: string[] = [];
    for (let i = 0; i < s.length - 1; i++) g.push(s.slice(i, i + 2));
    return g;
  };
  const ga = bigrams(a.toLowerCase());
  const gb = bigrams(b.toLowerCase());
  if (ga.length === 0 && gb.length === 0) return a === b ? 1 : 0;
  const counts = new Map<string, number>();
  for (const g of ga) counts.set(g, (counts.get(g) ?? 0) + 1);
  let overlap = 0;
  for (const g of gb) {
    const c = counts.get(g) ?? 0;
    if (c > 0) {
      counts.set(g, c - 1);
      overlap++;
    }
  }
  return (2 * overlap) / (ga.length + gb.length);
}

// --- finalize ---------------------------------------------------------------

function finalize(
  from: Contract,
  to: Contract,
  changes: Change[],
  options: DiffOptions,
): DiffResult {
  changes.sort((a, b) => {
    const s = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
    if (s !== 0) return s;
    if (a.route !== b.route) return a.route < b.route ? -1 : 1;
    return (a.tool ?? "").localeCompare(b.tool ?? "") || a.code.localeCompare(b.code);
  });

  const summary: Record<Severity, number> = { info: 0, warn: 0, risk: 0, breaking: 0 };
  for (const c of changes) summary[c.severity]++;

  const fatal = summary.breaking > 0 || (summary.risk > 0 && !options.riskAsWarning);

  return {
    changes,
    summary,
    exitCode: fatal ? 1 : 0,
    from: { app: from.app.name, digest: from.digest },
    to: { app: to.app.name, digest: to.digest },
  };
}
