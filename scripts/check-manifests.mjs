import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const digestPattern = /digest:\s+sha256:[a-f0-9]{64}/g;
const required = [
  "manifests/base/kustomization.yaml",
  "manifests/base/web.deployment.yaml",
  "manifests/base/worker.deployment.yaml",
  "manifests/base/postgres.cluster.yaml",
  "manifests/base/app.secret.yaml",
  "manifests/overlays/dev/kustomization.yaml",
  "manifests/overlays/staging/kustomization.yaml",
  "manifests/overlays/production/kustomization.yaml",
];

for (const file of required) {
  await access(join(root, file));
}

for (const env of ["dev", "staging", "production"]) {
  const text = await readFile(join(root, `manifests/overlays/${env}/kustomization.yaml`), "utf8");
  if (!text.includes("../../base")) {
    throw new Error(`${env} overlay must include ../../base`);
  }
  if (!text.includes("images:")) {
    throw new Error(`${env} overlay must pin deploy images`);
  }
  if (!text.includes("ghcr.io/happyvertical/smrt-saas-starter-web")) {
    throw new Error(`${env} overlay must include the web image`);
  }
  if (!text.includes("ghcr.io/happyvertical/smrt-saas-starter-worker")) {
    throw new Error(`${env} overlay must include the worker image`);
  }
  const digestPins = [...text.matchAll(digestPattern)];
  if (digestPins.length < 2) {
    throw new Error(`${env} overlay must pin both deploy images by digest`);
  }
}

console.log("Kubernetes manifests include base overlays with digest-pinned images.");
