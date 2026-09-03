import type { JsonValue, ToolRisk } from "./types.js";

export const RISK_ORDER: Record<ToolRisk, number> = { read: 0, write: 1, destructive: 2 };

/** Returns the higher-risk of the two levels. */
export function maxRisk(a: ToolRisk, b: ToolRisk): ToolRisk {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

const DESTRUCTIVE_RE =
  /\b(delete|destroy|remove|drop|wipe|erase|purge|cancel|refund|charge|pay|payment|checkout|purchase|buy|order|deactivate|close[_-]?account|unsubscribe|revoke|terminate)\b/i;
const WRITE_RE =
  /\b(add|create|update|edit|set|write|save|submit|post|send|book|apply|upload|register|assign|move|rename|toggle|enable|disable|mark)\b/i;
const READ_RE =
  /\b(search|list|get|find|show|view|read|query|fetch|lookup|browse|check|describe|count|preview)\b/i;

export interface ClassifyInput {
  name: string;
  description?: string;
  annotations?: Record<string, JsonValue> | undefined;
}

export interface ClassifyOptions {
  /** Explicit per-tool overrides keyed by tool name. Wins over every heuristic. */
  overrides?: Record<string, ToolRisk>;
}

/**
 * Heuristic risk classification. Precedence:
 *  1. explicit override
 *  2. `destructiveHint` / `readOnlyHint` annotations
 *  3. keyword match on name, then description
 *  4. conservative default: `write`
 */
export function classifyRisk(input: ClassifyInput, opts: ClassifyOptions = {}): ToolRisk {
  const override = opts.overrides?.[input.name];
  if (override) return override;

  const ann = input.annotations ?? {};
  if (ann["destructiveHint"] === true) return "destructive";
  if (ann["readOnlyHint"] === true) return "read";
  if (ann["idempotentHint"] === true && ann["readOnlyHint"] !== false) {
    // idempotent + not explicitly state-changing leans read/write; fall through.
  }

  for (const text of [input.name, input.description ?? ""]) {
    if (!text) continue;
    if (DESTRUCTIVE_RE.test(text)) return "destructive";
    if (WRITE_RE.test(text)) return "write";
    if (READ_RE.test(text)) return "read";
  }

  return "write";
}
