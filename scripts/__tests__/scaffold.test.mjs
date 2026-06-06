import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";

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
});
