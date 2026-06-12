// Workaround for happyvertical/smrt#1507 (and the shared root cause of #1506).
//
// SMRT packages self-register field metadata at import time via
// `ObjectRegistry.registerPackageManifest(new URL("./manifest.json", import.meta.url))`.
// When Vite bundles package code into SvelteKit server chunks, `import.meta.url`
// points at `build/server/chunks/<chunk>.js`, so the manifest lookup resolves to
// `build/server/chunks/manifest.json` — which does not exist — and registration
// silently no-ops. Plain (non-relationship) fields then vanish from the registry:
// WHERE validation rejects declared fields (#1507) and `create()`/`save()` drop
// declared field values on insert (#1506).
//
// smrt-core's `registerPackageManifest` has an upward-search recovery that looks
// for `manifest.json` in parent directories of the missing path. This script
// merges every runtime package manifest (plus the app-local manifest) and writes
// it to `build/server/manifest.json`, where that recovery finds it. Runs as part
// of `pnpm build` so the runtime trees and Docker images inherit the file.
//
// Remove once the upstream fix lands and field metadata survives bundling.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { smrtRuntimePackages } from "../smrt-packages.mjs";

const appRoot = fileURLToPath(new URL("..", import.meta.url));

function resolvePackageManifest(packageName) {
  const entry = fileURLToPath(import.meta.resolve(packageName));
  let dir = dirname(entry);
  for (let level = 0; level < 4; level++) {
    const candidate = join(dir, "manifest.json");
    if (existsSync(candidate)) {
      return candidate;
    }
    if (existsSync(join(dir, "package.json"))) {
      break;
    }
    dir = dirname(dir);
  }
  return null;
}

const merged = {
  version: 1,
  packageName: "@happyvertical/smrt-saas-web#runtime-merged",
  generatedBy: "apps/web/scripts/generate-runtime-manifest.mjs",
  objects: {},
};

const missing = [];
for (const packageName of smrtRuntimePackages) {
  const manifestPath = resolvePackageManifest(packageName);
  if (!manifestPath) {
    missing.push(packageName);
    continue;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  Object.assign(merged.objects, manifest.objects ?? {});
}

if (missing.length > 0) {
  console.error(`generate-runtime-manifest: missing dist manifest for: ${missing.join(", ")}`);
  process.exit(1);
}

const localManifestPath = join(appRoot, ".smrt", "manifest.json");
if (existsSync(localManifestPath)) {
  const local = JSON.parse(readFileSync(localManifestPath, "utf-8"));
  Object.assign(merged.objects, local.objects ?? {});
}

const serverDir = join(appRoot, "build", "server");
if (!existsSync(serverDir)) {
  console.error("generate-runtime-manifest: build/server does not exist; run vite build first.");
  process.exit(1);
}

const objectCount = Object.keys(merged.objects).length;
if (objectCount === 0) {
  console.error("generate-runtime-manifest: merged manifest is empty.");
  process.exit(1);
}

const outputPath = join(serverDir, "manifest.json");
writeFileSync(outputPath, JSON.stringify(merged));
console.log(
  `generate-runtime-manifest: wrote ${objectCount} object definitions to build/server/manifest.json`,
);
