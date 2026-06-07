import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { smrtRuntimePackages } from "../../apps/web/smrt-packages.mjs";

const root = new URL("../..", import.meta.url).pathname;

describe("starter scaffold", () => {
  it("uses dev, staging, and main pipeline workflows", async () => {
    const promote = await readFile(join(root, ".github/workflows/promote-dev.yml"), "utf8");
    const deployStaging = await readFile(
      join(root, ".github/workflows/deploy-staging.yml"),
      "utf8",
    );
    const mergeMain = await readFile(join(root, ".github/workflows/on-merge-main.yml"), "utf8");

    assert.match(promote, /dev/);
    assert.match(promote, /staging/);
    assert.match(deployStaging, /staging/);
    assert.match(mergeMain, /main/);
  });

  it("requires subscription and usage packages in the web app", async () => {
    const pkg = JSON.parse(await readFile(join(root, "apps/web/package.json"), "utf8"));
    assert.equal(pkg.dependencies["@happyvertical/smrt-saas-objects"], "workspace:*");
    assert.equal(pkg.dependencies["@happyvertical/smrt-saas-ui"], "workspace:*");
    assert.ok(pkg.dependencies["@happyvertical/accounting"]);
    assert.ok(pkg.dependencies["@happyvertical/smrt-chat"]);
  });

  it("keeps the SMRT runtime package surface shared across config and migrations", async () => {
    const expected = [
      "@happyvertical/smrt-agents",
      "@happyvertical/smrt-assets",
      "@happyvertical/smrt-content",
      "@happyvertical/smrt-jobs",
      "@happyvertical/smrt-messages",
      "@happyvertical/smrt-projects",
      "@happyvertical/smrt-secrets",
      "@happyvertical/smrt-sites",
      "@happyvertical/smrt-tags",
    ];
    for (const packageName of expected) {
      assert.ok(smrtRuntimePackages.includes(packageName), `${packageName} is missing`);
    }

    const viteConfig = await readFile(join(root, "apps/web/vite.config.ts"), "utf8");
    const migrateScript = await readFile(
      join(root, "apps/web/scripts/smrt-db-migrate.mjs"),
      "utf8",
    );

    assert.match(viteConfig, /smrtRuntimePackages/);
    assert.match(migrateScript, /registerSmrtRuntimePackages/);
  });
});
