import type { JsonSchema, JsonValue } from "./types.js";

/**
 * Recursively sort object keys so serialization is deterministic. Arrays keep
 * their order (order is meaningful in JSON Schema — `enum`, `required`, ...).
 */
export function sortKeysDeep<T extends JsonValue>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => sortKeysDeep(v)) as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortKeysDeep((value as Record<string, JsonValue>)[key] as JsonValue);
    }
    return out as T;
  }
  return value;
}

/** Deterministic JSON string: sorted keys, no whitespace. Use for hashing. */
export function canonicalJson(value: JsonValue): string {
  return JSON.stringify(sortKeysDeep(value));
}

/** Deterministic, human-readable JSON: sorted keys, 2-space indent, trailing newline. */
export function stableJson(value: JsonValue): string {
  return JSON.stringify(sortKeysDeep(value), null, 2) + "\n";
}

/** Volatile top-level schema annotations that never affect tool behavior. */
const STRIP_SCHEMA_KEYS = new Set(["$schema", "$id", "$comment"]);

/**
 * Canonicalize a JSON Schema so structurally equivalent schemas serialize
 * identically:
 *  - resolve local `$ref` (`#/$defs/...`, `#/definitions/...`) with a cycle guard
 *  - sort `required` and `enum`-of-scalars, dedupe `required`, drop it when empty
 *  - normalize `type` arrays (sort, dedupe, collapse single-element to a string)
 *  - strip `$schema` / `$id` / `$comment`
 *  - sort all object keys
 */
export function canonicalizeSchema(input: JsonSchema | undefined): JsonSchema {
  if (!input || typeof input !== "object") {
    return { type: "object", properties: {} };
  }
  const root = input;
  const seen = new Set<string>();

  const walk = (node: JsonValue): JsonValue => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;

    const obj = node as Record<string, JsonValue>;

    // Resolve local refs.
    const ref = obj["$ref"];
    if (typeof ref === "string" && ref.startsWith("#/")) {
      if (seen.has(ref)) return { $ref: ref }; // cycle: leave as-is
      const resolved = resolvePointer(root, ref);
      if (resolved !== undefined) {
        seen.add(ref);
        const merged: Record<string, JsonValue> = { ...(resolved as Record<string, JsonValue>) };
        for (const [k, v] of Object.entries(obj)) {
          if (k !== "$ref") merged[k] = v;
        }
        const result = walk(merged);
        seen.delete(ref);
        return result;
      }
    }

    const out: Record<string, JsonValue> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (STRIP_SCHEMA_KEYS.has(key)) continue;
      if (key === "required" && Array.isArray(value)) {
        const req = [...new Set(value.filter((v): v is string => typeof v === "string"))].sort();
        if (req.length > 0) out["required"] = req;
        continue;
      }
      if (key === "type" && Array.isArray(value)) {
        const types = [...new Set(value.filter((v): v is string => typeof v === "string"))].sort();
        out["type"] = types.length === 1 ? (types[0] as string) : types;
        continue;
      }
      if (key === "enum" && Array.isArray(value)) {
        out["enum"] = sortEnum(value);
        continue;
      }
      out[key] = walk(value);
    }
    collapseConstUnion(out);
    return sortObject(out);
  };

  return walk(root) as JsonSchema;
}

/**
 * Browser declarative-form inference emits `anyOf: [{const: "a"}, …]` *alongside*
 * an equivalent `enum`. Collapse a pure-`const` union into the `enum` so two
 * equivalent schemas serialize identically (and diffs stay quiet).
 */
function collapseConstUnion(node: Record<string, JsonValue>): void {
  for (const combiner of ["anyOf", "oneOf"] as const) {
    const branches = node[combiner];
    if (!Array.isArray(branches) || branches.length === 0) continue;
    const consts: JsonValue[] = [];
    let allConst = true;
    for (const b of branches) {
      if (b && typeof b === "object" && !Array.isArray(b) && "const" in b) {
        consts.push((b as Record<string, JsonValue>)["const"] as JsonValue);
      } else {
        allConst = false;
        break;
      }
    }
    if (!allConst) continue;
    delete node[combiner];
    if (!("enum" in node)) node["enum"] = sortEnum(consts);
  }
}

function sortObject(obj: Record<string, JsonValue>): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {};
  for (const key of Object.keys(obj).sort()) out[key] = obj[key] as JsonValue;
  return out;
}

/** Sort an `enum` array when every member is a scalar; otherwise keep order. */
function sortEnum(values: JsonValue[]): JsonValue[] {
  const allScalar = values.every(
    (v) => v === null || ["string", "number", "boolean"].includes(typeof v),
  );
  if (!allScalar) return values.map((v) => sortKeysDeep(v));
  return [...values].sort((a, b) => {
    const sa = JSON.stringify(a);
    const sb = JSON.stringify(b);
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });
}

function resolvePointer(root: JsonValue, ref: string): JsonValue | undefined {
  const parts = ref
    .slice(2)
    .split("/")
    .map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cur: JsonValue = root;
  for (const part of parts) {
    if (cur && typeof cur === "object" && !Array.isArray(cur) && part in cur) {
      cur = (cur as Record<string, JsonValue>)[part] as JsonValue;
    } else {
      return undefined;
    }
  }
  return cur;
}
