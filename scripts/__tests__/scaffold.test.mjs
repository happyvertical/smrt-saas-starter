import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { smrtRuntimePackages } from "../../apps/web/smrt-packages.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));

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

  it("ships the required-check, database-isolation, and artifact-promotion contract", async () => {
    const pullRequest = await readFile(join(root, ".github/workflows/on-pull-request.yml"), "utf8");
    const postgres = await readFile(join(root, ".github/workflows/postgres-tests.yml"), "utf8");
    const deploy = await readFile(join(root, ".github/workflows/deploy-dev.yml"), "utf8");
    const promotion = await readFile(
      join(root, ".github/actions/promote-candidate/action.yml"),
      "utf8",
    );
    const ciDocs = await readFile(join(root, ".github/CI.md"), "utf8");
    const isolation = await readFile(join(root, "scripts/run-with-ci-postgres.mjs"), "utf8");
    const context = await readFile(join(root, "scripts/verify-ci-context.mjs"), "utf8");

    assert.match(pullRequest, /merge_group:/);
    assert.match(pullRequest, /name: Required CI/);
    assert.match(
      pullRequest,
      /CI_NODE_RUNNER_ENABLED == 'true' && 'arc-happyvertical-node' \|\| 'ubuntu-latest'/,
    );
    assert.match(
      pullRequest,
      /CI_DOCKER_RUNNER_ENABLED == 'true' && 'arc-happyvertical' \|\| 'ubuntu-latest'/,
    );
    assert.match(pullRequest, /runtime-candidate\.json/);
    assert.match(
      pullRequest,
      /needs\.scope\.outputs\.context == 'true' \|\| needs\.scope\.outputs\.runtime == 'true'/,
    );
    assert.ok(
      pullRequest.indexOf("Upload generated context") <
        pullRequest.indexOf("      - name: Typecheck"),
    );
    assert.match(postgres, /cleanup-ci-postgres\.mjs/);
    assert.match(deploy, /promote-candidate/);
    assert.match(deploy, /ref: \$\{\{ inputs\.source_sha \|\| github\.sha \}\}/);
    assert.doesNotMatch(deploy, /docker\/build-push-action/);
    assert.match(promotion, /commits\/\$SOURCE_SHA\/pulls/);
    assert.match(promotion, /pull_requests\[\]\?; \.number == \$pr_number/);
    assert.match(promotion, /recovery-build\.yml/);
    assert.match(promotion, /HEAD\^\{tree\}/);
    assert.match(promotion, /Expected exactly one verified candidate for tree/);
    assert.match(isolation, /GITHUB_RUN_ATTEMPT/);
    assert.match(isolation, /dropdb/);
    assert.match(isolation, /--force/);
    assert.match(context, /input hash does not match/);
    assert.match(context, /output hash does not match/);
    assert.match(ciDocs, /ten successful representative/);
    assert.match(ciDocs, /Rollback/);
  });

  it("requires subscription and usage packages in the web app", async () => {
    const pkg = JSON.parse(await readFile(join(root, "apps/web/package.json"), "utf8"));
    assert.equal(pkg.dependencies["@happyvertical/smrt-saas-objects"], "workspace:*");
    assert.equal(pkg.dependencies["@happyvertical/smrt-saas-ui"], "workspace:*");
    assert.ok(pkg.dependencies["@happyvertical/accounting"]);
    assert.ok(pkg.dependencies["@happyvertical/smrt-chat"]);
  });

  it("seeds prompt and language management defaults", async () => {
    const seed = JSON.parse(
      await readFile(join(root, "apps/web/src/lib/server/starter-data.json"), "utf8"),
    );

    assert.ok(seed.prompts.some((prompt) => prompt.key === "starter.assistant.system"));
    assert.ok(seed.promptOverrides.some((override) => override.key === "starter.assistant.system"));
    assert.ok(seed.languageStrings.some((string) => string.key === "starter.assistant.greeting"));
    assert.ok(
      seed.languageOverrides.some(
        (override) => override.key === "starter.assistant.greeting" && override.locale === "fr-CA",
      ),
    );
  });

  it("seeds starter app settings", async () => {
    const seed = JSON.parse(
      await readFile(join(root, "apps/web/src/lib/server/starter-data.json"), "utf8"),
    );

    assert.ok(
      seed.appSettings.some(
        (setting) => setting.key === "signup.access_mode" && setting.value === "public",
      ),
    );
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
