// Copy the root LICENSE into every publishable package so npm ships it.
// Run by `pnpm release` before publishing; the copies are git-ignored.
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const license = await readFile(path.join(root, "LICENSE"), "utf8");
const pkgDir = path.join(root, "packages");

for (const name of await readdir(pkgDir)) {
  const dir = path.join(pkgDir, name);
  try {
    JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
  } catch {
    continue;
  }
  await writeFile(path.join(dir, "LICENSE"), license);
  console.log(`LICENSE → packages/${name}`);
}
