import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

const requiredFiles = [
  "README.md",
  "AGENTS.md",
  "CLAUDE.md",
  ".mcp.json",
  ".sops.yaml",
  "apps/web/package.json",
  "apps/web/src/routes/+page.svelte",
  "apps/web/src/routes/app/+layout.svelte",
  "apps/worker/package.json",
  "apps/mobile/package.json",
  "packages/app-objects/package.json",
  "packages/app-ui/package.json",
  "packages/mobile-contract/package.json",
  "docs/architecture.md",
  "docs/upstream-work.md",
  "docs/agentic-development.md",
];

for (const file of requiredFiles) {
  await access(join(root, file));
}

const agents = await readFile(join(root, "AGENTS.md"), "utf8");
for (const phrase of ["SOPS", "isolated SMRT or SDK worktree", "UUID columns stay UUID"]) {
  if (!agents.includes(phrase)) {
    throw new Error(`AGENTS.md must mention: ${phrase}`);
  }
}

const readme = await readFile(join(root, "README.md"), "utf8");
for (const phrase of ["SMRT", "Stripe", "Kotlin Multiplatform", "right-dock chat"]) {
  if (!readme.includes(phrase)) {
    throw new Error(`README.md must mention: ${phrase}`);
  }
}

console.log("Scaffold validation passed.");
