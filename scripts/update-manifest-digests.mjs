import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateRuntimeCandidate } from "./runtime-candidate-lib.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
let [environment, webDigest, workerDigest] = process.argv.slice(2);
const environments = new Set(["dev", "staging", "production"]);
const digestPattern = /^sha256:[a-f0-9]{64}$/;

if (environment === "--candidate") {
  const [, candidatePath, candidateEnvironment, expectedCommit] = process.argv.slice(2);
  const candidate = validateRuntimeCandidate(JSON.parse(await readFile(candidatePath, "utf8")), {
    expectedCommit,
  });
  environment = candidateEnvironment;
  webDigest = candidate.images.find((image) => image.name.endsWith("-web"))?.digest;
  workerDigest = candidate.images.find((image) => image.name.endsWith("-worker"))?.digest;
}

if (!environments.has(environment)) {
  throw new Error(
    "Usage: node scripts/update-manifest-digests.mjs <environment> <webDigest> <workerDigest> | --candidate <path> <environment> <commit>",
  );
}

for (const [name, digest] of [
  ["web", webDigest],
  ["worker", workerDigest],
]) {
  if (!digestPattern.test(digest ?? "")) {
    throw new Error(`${name} digest must be a sha256 digest`);
  }
}

const images = new Map([
  ["ghcr.io/happyvertical/smrt-saas-starter-web", webDigest],
  ["ghcr.io/happyvertical/smrt-saas-starter-worker", workerDigest],
]);

function updateImageDigest(text, imageName, digest) {
  const lines = text.split("\n");
  const updated = [];
  let found = false;

  for (let index = 0; index < lines.length; ) {
    const line = lines[index];

    if (line === `  - name: ${imageName}`) {
      found = true;
      const block = [line];
      index += 1;

      while (index < lines.length && !lines[index].startsWith("  - name: ")) {
        if (lines[index] !== "" && !lines[index].startsWith("    ")) {
          break;
        }
        block.push(lines[index]);
        index += 1;
      }

      const digestIndex = block.findIndex((entry) => entry.trim().startsWith("digest:"));
      if (digestIndex >= 0) {
        block[digestIndex] = `    digest: ${digest}`;
      } else {
        const tagIndex = block.findIndex((entry) => entry.trim().startsWith("newTag:"));
        block.splice(tagIndex >= 0 ? tagIndex + 1 : 1, 0, `    digest: ${digest}`);
      }

      updated.push(...block);
      continue;
    }

    updated.push(line);
    index += 1;
  }

  if (!found) {
    throw new Error(`Overlay is missing image entry: ${imageName}`);
  }

  return updated.join("\n");
}

const overlayPath = join(root, "manifests", "overlays", environment, "kustomization.yaml");
let text = await readFile(overlayPath, "utf8");

for (const [imageName, digest] of images) {
  text = updateImageDigest(text, imageName, digest);
}

await writeFile(overlayPath, text);
console.log(`Updated ${environment} image digests.`);
