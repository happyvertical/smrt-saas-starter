import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const environments = ["dev", "demo", "staging", "production"];
const digestPattern =
  /image: ghcr\.io\/happyvertical\/smrt-saas-starter-(web|worker):[^@\s]+@sha256:[a-f0-9]{64}/g;

function render(env) {
  const overlay = join(root, "manifests", "overlays", env);
  const result = spawnSync("kubectl", ["kustomize", overlay], {
    cwd: root,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`Failed to render ${env} manifests with kubectl kustomize:\n${output}`);
  }

  return result.stdout;
}

for (const env of environments) {
  const output = render(env);
  const matches = [...output.matchAll(digestPattern)];

  if (!output.includes("kind: Deployment") || !output.includes("name: smrt-saas-web")) {
    throw new Error(`${env} manifests must render the web Deployment`);
  }

  if (!output.includes("name: smrt-saas-worker")) {
    throw new Error(`${env} manifests must render the worker Deployment`);
  }

  if (matches.length < 2) {
    throw new Error(`${env} manifests must render digest-pinned web and worker images`);
  }

  console.log(`Rendered ${env} manifests (${output.split("\n").length} lines).`);
}
