import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractCatalogVersions, findMcpPinIssues } from "./lib/mcp-pins.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

const requiredSmrt = [
  "@happyvertical/smrt-core",
  "@happyvertical/smrt-config",
  "@happyvertical/smrt-cli",
  "@happyvertical/smrt-vitest",
  "@happyvertical/smrt-scanner",
  "@happyvertical/smrt-tenancy",
  "@happyvertical/smrt-users",
  "@happyvertical/smrt-profiles",
  "@happyvertical/smrt-features",
  "@happyvertical/smrt-prompts",
  "@happyvertical/smrt-languages",
  "@happyvertical/smrt-secrets",
  "@happyvertical/smrt-jobs",
  "@happyvertical/smrt-chat",
  "@happyvertical/smrt-app-mcp",
  "@happyvertical/smrt-dev-mcp",
  "@happyvertical/smrt-commerce",
  "@happyvertical/smrt-ledgers",
  "@happyvertical/smrt-analytics",
  "@happyvertical/smrt-assets",
  "@happyvertical/smrt-content",
  "@happyvertical/smrt-messages",
  "@happyvertical/smrt-projects",
  "@happyvertical/smrt-sites",
  "@happyvertical/smrt-subscriptions",
  "@happyvertical/smrt-tags",
  "@happyvertical/smrt-svelte",
];

const requiredSdk = [
  "@happyvertical/logger",
  "@happyvertical/accounting",
  "@happyvertical/secrets",
  "@happyvertical/jobs",
  "@happyvertical/cache",
  "@happyvertical/files",
  "@happyvertical/ai",
  "@happyvertical/analytics",
  "@happyvertical/auth",
  "@happyvertical/messages",
  "@happyvertical/projects",
  "@happyvertical/repos",
  "@happyvertical/github-actions",
  "@happyvertical/translator",
];

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function keys(object) {
  return new Set([
    ...Object.keys(object.dependencies ?? {}),
    ...Object.keys(object.devDependencies ?? {}),
    ...Object.keys(object.peerDependencies ?? {}),
    ...Object.keys(object.optionalDependencies ?? {}),
  ]);
}

const workspace = await readFile(join(root, "pnpm-workspace.yaml"), "utf8");
const webPackage = await readJson(join(root, "apps/web/package.json"));
const workerPackage = await readJson(join(root, "apps/worker/package.json"));
const objectPackage = await readJson(join(root, "packages/app-objects/package.json"));
const allDeclared = new Set([
  ...keys(webPackage),
  ...keys(workerPackage),
  ...keys(objectPackage),
  ...Array.from(workspace.matchAll(/'(@happyvertical\/[^']+)'/g)).map((match) => match[1]),
]);

const missing = [...requiredSmrt, ...requiredSdk].filter((name) => !allDeclared.has(name));

if (missing.length > 0) {
  console.error("Missing required HappyVertical dependencies:");
  for (const name of missing) {
    console.error(`- ${name}`);
  }
  process.exit(1);
}

// .mcp.json launches HappyVertical MCP servers via `npx <pkg>@<version>`, so
// pnpm never resolves those pins and they can drift from the catalog silently.
// Require the agent-facing MCP servers to be registered and every pinned
// @happyvertical package in .mcp.json to match its catalog version (scoped to
// the catalog block — see scripts/lib/mcp-pins.mjs).
const requiredMcpServers = ["smrt-dev-mcp", "happyvertical-sdk-mcp"];
const mcpText = await readFile(join(root, ".mcp.json"), "utf8");
const mcpConfig = JSON.parse(mcpText);

for (const server of requiredMcpServers) {
  if (!mcpConfig.mcpServers?.[server]) {
    console.error(`.mcp.json must register MCP server: ${server}`);
    process.exit(1);
  }
}

const mcpIssues = findMcpPinIssues(mcpText, extractCatalogVersions(workspace));
if (mcpIssues.length > 0) {
  for (const issue of mcpIssues) {
    console.error(issue);
  }
  process.exit(1);
}

console.log("Dependency surface includes required SMRT and SDK packages.");
console.log("MCP server pins in .mcp.json match the pnpm catalog.");
