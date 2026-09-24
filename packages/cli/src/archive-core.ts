import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { serializeContract, type Contract } from "@webmcp-contract/contract";

export interface ArchiveIndexEntry {
  /** Stable key for this snapshot — a git short SHA by convention, but any string works. */
  label: string;
  /** Filename within the archive dir, e.g. "<label>.json". */
  file: string;
  digest: string;
  app: { name: string; version?: string };
  /** The contract's own `capturedAt`. */
  capturedAt: string;
  /** When this entry was added to the archive — may differ from `capturedAt` on replay. */
  archivedAt: string;
}

export interface ArchiveIndex {
  entries: ArchiveIndexEntry[];
}

export interface ArchiveOptions {
  /** Directory holding one JSON file per archived snapshot plus `index.json`. */
  dir: string;
  /** Stable key for this snapshot, e.g. a git short SHA. */
  label: string;
  /** Injectable for tests; defaults to the real clock. */
  now?: () => string;
}

export interface ArchiveOutcome {
  /** False when the contract's digest matches the most recently archived entry — nothing to add. */
  archived: boolean;
  entry: ArchiveIndexEntry;
  index: ArchiveIndex;
  reason?: string;
}

const INDEX_FILE = "index.json";

async function readIndex(dir: string): Promise<ArchiveIndex> {
  try {
    const text = await readFile(path.join(dir, INDEX_FILE), "utf8");
    const parsed = JSON.parse(text) as ArchiveIndex;
    if (!Array.isArray(parsed.entries)) throw new Error(`${INDEX_FILE}: missing entries[]`);
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { entries: [] };
    throw err;
  }
}

async function writeIndex(dir: string, index: ArchiveIndex): Promise<void> {
  await writeFile(path.join(dir, INDEX_FILE), `${JSON.stringify(index, null, 2)}\n`);
}

/**
 * Add a contract snapshot to the cross-release archive, keyed by `label` (a git short SHA by
 * convention — any push-to-main can archive one, not just tagged releases). Diffing any two past
 * releases later is then just the ordinary diff command against two archived files:
 *
 *   webmcp-contract diff <dir>/<labelA>.json <dir>/<labelB>.json
 *
 * A no-op when the contract's digest matches the archive's most recent entry: pushes that don't
 * change the tool contract don't grow the archive. Re-archiving an existing label overwrites that
 * entry in place (an idempotent replay of the same commit).
 */
export async function archiveContract(
  contract: Contract,
  options: ArchiveOptions,
): Promise<ArchiveOutcome> {
  const now = options.now ?? (() => new Date().toISOString());
  await mkdir(options.dir, { recursive: true });
  const index = await readIndex(options.dir);

  const last = index.entries.at(-1);
  if (last && last.digest === contract.digest) {
    return {
      archived: false,
      entry: last,
      index,
      reason: `digest unchanged since '${last.label}' — nothing to archive`,
    };
  }

  const entry: ArchiveIndexEntry = {
    label: options.label,
    file: `${options.label}.json`,
    digest: contract.digest,
    app: {
      name: contract.app.name,
      ...(contract.app.version ? { version: contract.app.version } : {}),
    },
    capturedAt: contract.capturedAt,
    archivedAt: now(),
  };

  const existingIdx = index.entries.findIndex((e) => e.label === options.label);
  const entries =
    existingIdx === -1
      ? [...index.entries, entry]
      : index.entries.map((e, i) => (i === existingIdx ? entry : e));
  const nextIndex: ArchiveIndex = { entries };

  await writeFile(path.join(options.dir, entry.file), serializeContract(contract));
  await writeIndex(options.dir, nextIndex);

  return { archived: true, entry, index: nextIndex };
}
