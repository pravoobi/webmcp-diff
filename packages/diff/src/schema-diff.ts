import type { JsonSchema, JsonValue } from "@webmcp-contract/contract";
import type { Severity } from "./types.js";

export interface SchemaChange {
  severity: Severity;
  code: string;
  /** Dotted path to the affected sub-schema, e.g. `query` or `filter.size`. */
  path: string;
  message: string;
  before?: JsonValue;
  after?: JsonValue;
}

function asObject(v: JsonValue | undefined): Record<string, JsonValue> | undefined {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, JsonValue>)
    : undefined;
}

function typeSet(schema: Record<string, JsonValue> | undefined): Set<string> {
  if (!schema) return new Set();
  const t = schema.type;
  if (typeof t === "string") return new Set([t]);
  if (Array.isArray(t)) return new Set(t.filter((x): x is string => typeof x === "string"));
  return new Set();
}

function enumValues(schema: Record<string, JsonValue> | undefined): JsonValue[] | undefined {
  if (!schema) return undefined;
  const e = schema.enum;
  return Array.isArray(e) ? e : undefined;
}

function requiredSet(schema: Record<string, JsonValue> | undefined): Set<string> {
  if (!schema) return new Set();
  const r = schema.required;
  return new Set(Array.isArray(r) ? r.filter((x): x is string => typeof x === "string") : []);
}

/** `after` is a strict, non-empty subset of `before` (or `before` was "any"). */
function isNarrowed(before: Set<string>, after: Set<string>): boolean {
  if (after.size === 0) return false;
  if (before.size === 0) return true; // any → specific
  if (before.has("number") && after.has("integer") && !after.has("number")) return true;
  if ([...after].every((t) => before.has(t)) && after.size < before.size) return true;
  return false;
}

function isWidened(before: Set<string>, after: Set<string>): boolean {
  if (before.size === 0) return false;
  if (after.size === 0) return true; // specific → any
  if (after.has("number") && before.has("integer") && !before.has("number")) return true;
  if ([...before].every((t) => after.has(t)) && after.size > before.size) return true;
  return false;
}

/**
 * Compare two canonicalized JSON Schemas and report the changes that matter for
 * agent compatibility. Recurses into nested `properties`.
 */
export function diffSchema(before: JsonSchema, after: JsonSchema, path = ""): SchemaChange[] {
  const changes: SchemaChange[] = [];
  const b = asObject(before);
  const a = asObject(after);
  if (!b || !a) return changes;

  const here = path || "(root)";

  // --- type ---
  const bt = typeSet(b);
  const at = typeSet(a);
  if (JSON.stringify([...bt].sort()) !== JSON.stringify([...at].sort())) {
    const bl = [...bt].sort().join("|") || "any";
    const al = [...at].sort().join("|") || "any";
    if (isNarrowed(bt, at)) {
      changes.push({
        severity: "breaking",
        code: "input.type-narrowed",
        path: here,
        message: `${here}: type narrowed ${bl} → ${al}`,
        before: bl,
        after: al,
      });
    } else if (isWidened(bt, at)) {
      changes.push({
        severity: "info",
        code: "input.type-widened",
        path: here,
        message: `${here}: type widened ${bl} → ${al}`,
        before: bl,
        after: al,
      });
    } else {
      changes.push({
        severity: "breaking",
        code: "input.type-changed",
        path: here,
        message: `${here}: type changed ${bl} → ${al}`,
        before: bl,
        after: al,
      });
    }
  }

  // --- enum ---
  const be = enumValues(b);
  const ae = enumValues(a);
  if (be || ae) {
    const bset = new Set((be ?? []).map((v) => JSON.stringify(v)));
    const aset = new Set((ae ?? []).map((v) => JSON.stringify(v)));
    if (!be && ae) {
      changes.push({
        severity: "breaking",
        code: "input.enum-added",
        path: here,
        message: `${here}: values now restricted to an enum (${ae.map((v) => JSON.stringify(v)).join(", ")})`,
        after: ae as JsonValue,
      });
    } else if (be && !ae) {
      changes.push({
        severity: "info",
        code: "input.enum-removed",
        path: here,
        message: `${here}: enum restriction removed`,
        before: be as JsonValue,
      });
    } else if (be && ae) {
      const removed = [...bset].filter((v) => !aset.has(v));
      const added = [...aset].filter((v) => !bset.has(v));
      if (removed.length > 0) {
        changes.push({
          severity: "breaking",
          code: "input.enum-value-removed",
          path: here,
          message: `${here}: enum value(s) removed: ${removed.join(", ")}`,
          before: be as JsonValue,
          after: ae as JsonValue,
        });
      }
      if (added.length > 0 && removed.length === 0) {
        changes.push({
          severity: "info",
          code: "input.enum-widened",
          path: here,
          message: `${here}: enum value(s) added: ${added.join(", ")}`,
          before: be as JsonValue,
          after: ae as JsonValue,
        });
      }
    }
  }

  // --- properties + required ---
  const bProps = asObject(b.properties) ?? {};
  const aProps = asObject(a.properties) ?? {};
  const bReq = requiredSet(b);
  const aReq = requiredSet(a);
  const allProps = new Set([...Object.keys(bProps), ...Object.keys(aProps)]);

  for (const prop of [...allProps].sort()) {
    const childPath = path ? `${path}.${prop}` : prop;
    const inB = prop in bProps;
    const inA = prop in aProps;

    if (inB && !inA) {
      changes.push({
        severity: "breaking",
        code: "input.removed",
        path: childPath,
        message: `input '${childPath}' removed`,
        before: bProps[prop] as JsonValue,
      });
      continue;
    }
    if (!inB && inA) {
      const req = aReq.has(prop);
      changes.push({
        severity: req ? "breaking" : "info",
        code: req ? "input.required-added" : "input.optional-added",
        path: childPath,
        message: `${req ? "required" : "optional"} input '${childPath}' added`,
        after: aProps[prop] as JsonValue,
      });
      continue;
    }
    // present in both: required transition + recurse
    if (!bReq.has(prop) && aReq.has(prop)) {
      changes.push({
        severity: "breaking",
        code: "input.required-added",
        path: childPath,
        message: `input '${childPath}' is now required`,
      });
    } else if (bReq.has(prop) && !aReq.has(prop)) {
      changes.push({
        severity: "info",
        code: "input.required-relaxed",
        path: childPath,
        message: `input '${childPath}' is no longer required`,
      });
    }
    changes.push(...diffSchema(bProps[prop] as JsonSchema, aProps[prop] as JsonSchema, childPath));
  }

  return changes;
}
