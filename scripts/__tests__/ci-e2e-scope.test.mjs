import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { matchesGlob } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const workflowPath = fileURLToPath(
  new URL("../../.github/workflows/on-pull-request.yml", import.meta.url),
);

function extractPathFilter(source, name) {
  const lines = source.split("\n");
  const start = lines.indexOf(`            ${name}:`);
  assert.notEqual(start, -1, `${name} path filter is missing`);

  const patterns = [];
  for (const line of lines.slice(start + 1)) {
    if (/^ {12}[a-z][a-z-]*:$/u.test(line)) break;
    const match = line.match(/^ {14}- '([^']+)'$/u);
    if (match) patterns.push(match[1]);
  }
  assert.notEqual(patterns.length, 0, `${name} path filter has no patterns`);
  return patterns;
}

function requiresE2e({ eventName, mergeQueueEnabled, paths }, patterns) {
  return (
    eventName === "merge_group" ||
    !mergeQueueEnabled ||
    paths.some((path) => patterns.some((pattern) => matchesGlob(path, pattern)))
  );
}

describe("production E2E CI scope", () => {
  it("keeps rollout and merge-queue validation exhaustive", async () => {
    const patterns = extractPathFilter(await readFile(workflowPath, "utf8"), "e2e");

    assert.equal(
      requiresE2e(
        { eventName: "pull_request", mergeQueueEnabled: false, paths: ["docs/testing.md"] },
        patterns,
      ),
      true,
    );
    assert.equal(
      requiresE2e(
        { eventName: "merge_group", mergeQueueEnabled: true, paths: ["docs/testing.md"] },
        patterns,
      ),
      true,
    );
  });

  it("covers every production E2E command, configuration, and runner input after cutover", async () => {
    const patterns = extractPathFilter(await readFile(workflowPath, "utf8"), "e2e");
    const affectedPaths = [
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "turbo.json",
      "scripts/run-production-e2e.mjs",
      "scripts/production-e2e-contract.mjs",
      "scripts/prepare-runtime.mjs",
      "apps/web/playwright.config.ts",
      "apps/web/Dockerfile",
      "packages/app-objects/src/index.ts",
      "packages/app-ui/src/index.ts",
      ".github/actions/setup-environment/action.yml",
      ".github/workflows/on-pull-request.yml",
    ];

    for (const path of affectedPaths) {
      assert.equal(
        requiresE2e(
          { eventName: "pull_request", mergeQueueEnabled: true, paths: [path] },
          patterns,
        ),
        true,
        `${path} must require production E2E`,
      );
    }
  });

  it("allows unrelated changes to skip only after cutover", async () => {
    const patterns = extractPathFilter(await readFile(workflowPath, "utf8"), "e2e");

    for (const path of ["docs/testing.md", "apps/mobile/README.md"]) {
      assert.equal(
        requiresE2e(
          { eventName: "pull_request", mergeQueueEnabled: true, paths: [path] },
          patterns,
        ),
        false,
        `${path} should not require production E2E after cutover`,
      );
    }
  });
});
