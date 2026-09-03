import { stableJson } from "./canonicalize.js";
import { digestContract } from "./build.js";
import type { Contract, JsonValue } from "./types.js";

/** Serialize a contract to its canonical on-disk form (stable, git-diff friendly). */
export function serializeContract(contract: Contract): string {
  return stableJson(contract as unknown as JsonValue);
}

export class ContractParseError extends Error {}

/** Parse and minimally validate a contract document. */
export function parseContract(text: string, source = "<contract>"): Contract {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new ContractParseError(`${source}: invalid JSON: ${(err as Error).message}`);
  }
  if (!data || typeof data !== "object") {
    throw new ContractParseError(`${source}: expected an object`);
  }
  const c = data as Partial<Contract>;
  if (c.contractVersion !== 1) {
    throw new ContractParseError(
      `${source}: unsupported contractVersion ${String(c.contractVersion)} (expected 1)`,
    );
  }
  if (!c.app?.name) throw new ContractParseError(`${source}: missing app.name`);
  if (!Array.isArray(c.routes)) throw new ContractParseError(`${source}: missing routes[]`);

  const contract = data as Contract;
  const expected = digestContract(contract);
  if (contract.digest && contract.digest !== expected) {
    throw new ContractParseError(
      `${source}: digest mismatch (file has ${contract.digest.slice(0, 12)}…, ` +
        `recomputed ${expected.slice(0, 12)}…) — the contract body was edited by hand`,
    );
  }
  return contract;
}
