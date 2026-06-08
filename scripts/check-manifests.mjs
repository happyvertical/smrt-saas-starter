import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
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
}

console.log("Kubernetes manifests include base and environment overlays.");
