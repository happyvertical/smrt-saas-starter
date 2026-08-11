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
  "manifests/overlays/demo/kustomization.yaml",
  "manifests/overlays/demo/ingress.yaml",
  "manifests/overlays/demo/network-policy.yaml",
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

const demo = await readFile(join(root, "manifests/overlays/demo/kustomization.yaml"), "utf8");
const demoIngress = await readFile(join(root, "manifests/overlays/demo/ingress.yaml"), "utf8");
const demoNetworkPolicy = await readFile(
  join(root, "manifests/overlays/demo/network-policy.yaml"),
  "utf8",
);
if (!demo.includes("../dev")) {
  throw new Error("demo overlay must derive from the digest-pinned dev overlay");
}
for (const phrase of [
  "SMRT_STARTER_DEMO_AUTH",
  "SMRT_STARTER_MIGRATE_ON_START",
  "smrt-saas-postgres-app",
]) {
  if (!demo.includes(phrase)) {
    throw new Error(`demo overlay must include: ${phrase}`);
  }
}
if (!demoIngress.includes("demo.s-m-r-t.dev") || !demoIngress.includes("letsencrypt-prod")) {
  throw new Error("demo ingress must serve demo.s-m-r-t.dev with production TLS");
}
if (
  !demoNetworkPolicy.includes("kubernetes.io/metadata.name: postgresql-operator") ||
  !demoNetworkPolicy.includes("port: 8000")
) {
  throw new Error("demo PostgreSQL ingress must admit CloudNativePG operator management");
}

console.log("Kubernetes manifests include base, digest-pinned, and public demo overlays.");
