import { spawnSync } from "node:child_process";
import { access, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const runtimeDir = join(root, ".runtime");

const targets = [
  {
    filter: "@happyvertical/smrt-saas-web",
    output: join(runtimeDir, "web"),
    requiredFiles: [
      "package.json",
      "scripts/smrt-start.mjs",
      "scripts/smrt-db-seed.mjs",
      "src/lib/server/starter-data.json",
    ],
  },
  {
    filter: "@happyvertical/smrt-saas-worker",
    output: join(runtimeDir, "worker"),
    requiredFiles: ["package.json", "dist/index.js"],
  },
];

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

await rm(runtimeDir, { recursive: true, force: true });
await mkdir(runtimeDir, { recursive: true });

for (const target of targets) {
  run("pnpm", ["--filter", target.filter, "deploy", "--prod", "--legacy", target.output]);
  for (const file of target.requiredFiles) {
    await access(join(target.output, file));
  }
}

console.log("Prepared production runtime trees in .runtime/.");
