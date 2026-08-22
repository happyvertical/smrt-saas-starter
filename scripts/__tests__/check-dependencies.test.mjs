import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  extractCatalogVersions,
  extractSectionVersions,
  findMcpPinIssues,
  findSmrtCatalogIssues,
  findSmrtOverrideIssues,
} from "../lib/mcp-pins.mjs";

const scriptPath = fileURLToPath(new URL("../check-dependencies.mjs", import.meta.url));

const sampleWorkspace = [
  "catalog:",
  "  '@happyvertical/smrt-dev-mcp': 0.27.12",
  "  '@happyvertical/sdk-mcp': 0.74.4",
  "  lucide-svelte: ^0.561.0",
  "",
  "overrides:",
  "  '@happyvertical/smrt-dev-mcp': 9.9.9",
  "  '@happyvertical/sdk-mcp': 9.9.9",
].join("\n");

test("extractCatalogVersions reads the catalog and ignores overrides", () => {
  const versions = extractCatalogVersions(sampleWorkspace);
  // The override value (9.9.9) must NOT shadow the catalog value.
  assert.equal(versions.get("@happyvertical/smrt-dev-mcp"), "0.27.12");
  assert.equal(versions.get("@happyvertical/sdk-mcp"), "0.74.4");
});

test("extractSectionVersions reads overrides independently", () => {
  const versions = extractSectionVersions(sampleWorkspace, "overrides");
  assert.equal(versions.get("@happyvertical/smrt-dev-mcp"), "9.9.9");
  assert.equal(versions.get("@happyvertical/sdk-mcp"), "9.9.9");
});

test("findMcpPinIssues passes when pins match the catalog", () => {
  const versions = extractCatalogVersions(sampleWorkspace);
  const mcp = JSON.stringify({
    mcpServers: {
      "smrt-dev-mcp": { args: ["-lc", "npx -y @happyvertical/smrt-dev-mcp@0.27.12"] },
      "happyvertical-sdk-mcp": { args: ["-lc", "npx -y @happyvertical/sdk-mcp@0.74.4"] },
    },
  });
  assert.deepEqual(findMcpPinIssues(mcp, versions), []);
});

test("findMcpPinIssues flags a pin that drifts from the catalog", () => {
  const versions = extractCatalogVersions(sampleWorkspace);
  const issues = findMcpPinIssues("npx -y @happyvertical/smrt-dev-mcp@0.27.11", versions);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /0\.27\.11.*0\.27\.12/u);
});

test("findMcpPinIssues flags a pin missing from the catalog", () => {
  const issues = findMcpPinIssues("npx -y @happyvertical/ghost-mcp@1.0.0", new Map());
  assert.equal(issues.length, 1);
  assert.match(issues[0], /no entry/u);
});

test("findMcpPinIssues requires at least one pin", () => {
  const issues = findMcpPinIssues("{}", new Map());
  assert.equal(issues.length, 1);
  assert.match(issues[0], /must pin/u);
});

test("findSmrtCatalogIssues accepts one exact framework version", () => {
  assert.deepEqual(
    findSmrtCatalogIssues(
      new Map([
        ["@happyvertical/smrt-core", "0.42.4"],
        ["@happyvertical/smrt-svelte", "0.42.4"],
        ["@happyvertical/sdk-mcp", "0.88.0"],
      ]),
    ),
    [],
  );
});

test("findSmrtCatalogIssues rejects ranges and mixed versions", () => {
  const issues = findSmrtCatalogIssues(
    new Map([
      ["@happyvertical/smrt-core", "^0.42.4"],
      ["@happyvertical/smrt-svelte", "0.40.62"],
      ["@happyvertical/smrt-users", "0.42.4"],
    ]),
  );
  assert.equal(issues.length, 2);
  assert.match(issues[0], /must use an exact version/u);
  assert.match(issues[1], /must move in lockstep/u);
});

test("findSmrtOverrideIssues requires the catalog mirror", () => {
  const catalog = new Map([
    ["@happyvertical/smrt-core", "0.42.4"],
    ["@happyvertical/smrt-svelte", "0.42.4"],
  ]);
  const issues = findSmrtOverrideIssues(
    catalog,
    new Map([["@happyvertical/smrt-core", "0.40.62"]]),
  );
  assert.equal(issues.length, 2);
  assert.match(issues[0], /found 0\.40\.62/u);
  assert.match(issues[1], /found missing/u);
});

test("check-dependencies.mjs passes against the real repo", () => {
  const result = spawnSync("node", [scriptPath], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
