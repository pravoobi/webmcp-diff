import { createHash } from "node:crypto";
import { canonicalJson } from "./canonicalize.js";
import type { JsonValue } from "./types.js";

/** Short, stable content hash (first 16 hex chars of sha256 over canonical JSON). */
export function contentHash(value: JsonValue): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex").slice(0, 16);
}

/** Full sha256 hex over canonical JSON. */
export function sha256(value: JsonValue): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
