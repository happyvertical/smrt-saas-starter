import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("..", import.meta.url));
export const provenancePath = resolve(root, ".ci/generated-context/provenance.json");

export const inputRoots = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
  "apps/web/package.json",
  "apps/web/smrt-packages.mjs",
  "apps/web/smrt.config.mjs",
  "apps/web/vite.config.ts",
  "apps/web/src",
  "packages/app-objects/package.json",
  "packages/app-objects/src",
  "packages/mobile-contract/package.json",
  "packages/mobile-contract/scripts",
  "packages/mobile-contract/src",
  "scripts/ci-context-lib.mjs",
  "scripts/prepare-ci-context.mjs",
  "scripts/verify-ci-context.mjs",
];

export const outputRoots = [
  "apps/web/.smrt",
  "apps/web/build",
  "apps/web/src/routes/api/generated",
  "apps/worker/dist",
  "packages/app-objects/dist",
  "packages/mobile-contract/dist",
  "packages/mobile-contract/generated",
];

async function filesUnder(path) {
  const absolute = resolve(root, path);
  const info = await stat(absolute);
  if (info.isFile()) return [absolute];

  const files = [];
  for (const entry of await readdir(absolute, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    const child = resolve(absolute, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(relative(root, child))));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

async function hashFiles(files) {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(relative(root, file));
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return { files: files.map((file) => relative(root, file)), sha256: hash.digest("hex") };
}

export async function hashRoots(paths) {
  const files = (await Promise.all(paths.map(filesUnder))).flat().sort();
  return hashFiles(files);
}

export async function hashTrackedRoots(paths) {
  const result = spawnSync("git", ["ls-files", "-z", "--", ...paths], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error("Unable to enumerate tracked generated-context inputs");
  const files = result.stdout
    .split("\0")
    .filter(Boolean)
    .map((file) => resolve(root, file))
    .sort();
  return hashFiles(files);
}
