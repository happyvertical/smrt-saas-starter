import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { updateImageDigest } from "./manifest-digests-lib.mjs";
import { validateRuntimeCandidate } from "./runtime-candidate-lib.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
let [environment, webDigest, workerDigest] = process.argv.slice(2);
let webImageName = "ghcr.io/happyvertical/smrt-saas-starter-web";
let workerImageName = "ghcr.io/happyvertical/smrt-saas-starter-worker";
const environments = new Set(["dev", "staging", "production"]);
const digestPattern = /^sha256:[a-f0-9]{64}$/;

if (environment === "--candidate") {
  const [, candidatePath, candidateEnvironment, expectedSourceCommit] = process.argv.slice(2);
  const candidate = validateRuntimeCandidate(JSON.parse(await readFile(candidatePath, "utf8")), {
    expectedSourceCommit,
  });
  environment = candidateEnvironment;
  const webImage = candidate.images.find((image) => image.name.endsWith("-web"));
  const workerImage = candidate.images.find((image) => image.name.endsWith("-worker"));
  webImageName = webImage.name;
  workerImageName = workerImage.name;
  webDigest = webImage.digest;
  workerDigest = workerImage.digest;
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

const images = [
  { role: "web", name: webImageName, digest: webDigest },
  { role: "worker", name: workerImageName, digest: workerDigest },
];

const overlayPath = join(root, "manifests", "overlays", environment, "kustomization.yaml");
let text = await readFile(overlayPath, "utf8");

for (const image of images) {
  text = updateImageDigest(text, image);
}

await writeFile(overlayPath, text);
console.log(`Updated ${environment} image digests.`);
