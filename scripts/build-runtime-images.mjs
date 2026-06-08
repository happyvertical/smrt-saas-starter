import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

const targets = [
  {
    name: "web",
    dockerfile: "apps/web/Dockerfile",
    runtimePackage: ".runtime/web/package.json",
    tag: process.env.WEB_IMAGE_TAG ?? "smrt-saas-starter-web:local",
  },
  {
    name: "worker",
    dockerfile: "apps/worker/Dockerfile",
    runtimePackage: ".runtime/worker/package.json",
    tag: process.env.WORKER_IMAGE_TAG ?? "smrt-saas-starter-worker:local",
  },
];

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

for (const target of targets) {
  await access(join(root, target.runtimePackage));
  run("docker", ["build", "-f", target.dockerfile, "-t", target.tag, "."]);
  console.log(`Built ${target.name} image: ${target.tag}`);
}
