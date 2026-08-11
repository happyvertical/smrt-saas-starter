import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const workflowsDir = join(root, ".github/workflows");
const required = [
  "on-pull-request.yml",
  "deploy-dev.yml",
  "promote-dev.yml",
  "deploy-staging.yml",
  "on-merge-main.yml",
];

for (const file of required) {
  await access(join(workflowsDir, file));
}

const workflowFiles = (await readdir(workflowsDir)).filter((file) => file.endsWith(".yml"));
for (const file of workflowFiles) {
  const text = await readFile(join(workflowsDir, file), "utf8");
  if (!text.includes("uses: actions/checkout@v6")) {
    throw new Error(`${file} must checkout the repository`);
  }
  if (!text.includes("setup-environment")) {
    throw new Error(`${file} must use the shared setup-environment action`);
  }
  // This public repository keeps untrusted workflow code on GitHub-hosted runners.
  for (const runner of text.matchAll(/runs-on:\s*(\S+)/g)) {
    if (runner[1] !== "ubuntu-latest") {
      throw new Error(`${file} must run on ubuntu-latest (found runs-on: ${runner[1]})`);
    }
  }
  if (text.includes("pnpm check")) {
    for (const phrase of [
      "postgres:18-alpine",
      "POSTGRES_DB: smrt_saas",
      "DATABASE_URL: postgresql://smrt_saas:localdev@127.0.0.1:5432/smrt_saas",
    ]) {
      if (!text.includes(phrase)) {
        throw new Error(`${file} must configure CI Postgres for pnpm check: ${phrase}`);
      }
    }
  }
}

const setupEnvironmentAction = await readFile(
  join(root, ".github/actions/setup-environment/action.yml"),
  "utf8",
);
for (const phrase of ["uses: actions/setup-node@v6", 'node-version: "24"']) {
  if (!setupEnvironmentAction.includes(phrase)) {
    throw new Error(`setup-environment action must include: ${phrase}`);
  }
}

const pullRequestWorkflow = await readFile(join(workflowsDir, "on-pull-request.yml"), "utf8");
for (const phrase of [
  "runtime:",
  "uses: Azure/setup-kubectl@v5.1.0",
  "pnpm runtime:check",
  "e2e:",
  "pnpm --filter @happyvertical/smrt-saas-objects build",
  "pnpm db:seed",
  "playwright install --with-deps chromium",
  "test:e2e",
  "mobile-android:",
  "uses: gradle/actions/wrapper-validation@v6",
  "uses: actions/setup-java@v5",
  'java-version: "21"',
  "uses: android-actions/setup-android@v4",
  'sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"',
  "pnpm mobile:validate:android",
]) {
  if (!pullRequestWorkflow.includes(phrase)) {
    throw new Error(`on-pull-request.yml must include native mobile validation: ${phrase}`);
  }
}

for (const file of ["deploy-dev.yml", "deploy-staging.yml", "on-merge-main.yml"]) {
  const text = await readFile(join(workflowsDir, file), "utf8");
  for (const phrase of [
    "paths-ignore:",
    "pnpm runtime:prepare",
    "uses: docker/login-action@v4.2.0",
    "uses: docker/setup-buildx-action@v4.1.0",
    "uses: docker/build-push-action@v7.2.0",
    "node scripts/update-manifest-digests.mjs",
    "pnpm manifests:render",
    'git commit -m "chore(deploy): update',
  ]) {
    if (!text.includes(phrase)) {
      throw new Error(`${file} must include deploy runtime hardening: ${phrase}`);
    }
  }
}

// Web images must report the commit they were built from so post-deploy smoke
// tests can wait for the rollout instead of racing it.
for (const file of ["deploy-dev.yml", "deploy-staging.yml", "on-merge-main.yml"]) {
  const text = await readFile(join(workflowsDir, file), "utf8");
  // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression
  if (!text.includes("APP_VERSION=${{ github.sha }}")) {
    throw new Error(`${file} must bake APP_VERSION into the web image build`);
  }
}

const stagingWorkflow = await readFile(join(workflowsDir, "deploy-staging.yml"), "utf8");
for (const phrase of [
  "scripts/wait-for-deploy.mjs",
  "vars.STAGING_BASE_URL",
  "PLAYWRIGHT_BASE_URL",
  "test:e2e",
  "E2E_AUTH_SECRET",
]) {
  if (!stagingWorkflow.includes(phrase)) {
    throw new Error(`deploy-staging.yml must smoke the deployed environment: ${phrase}`);
  }
}
const smokeIndex = stagingWorkflow.indexOf("Smoke staging deployment");
const promotePrIndex = stagingWorkflow.indexOf("Open staging to main PR");
if (smokeIndex === -1 || promotePrIndex === -1 || smokeIndex > promotePrIndex) {
  throw new Error("deploy-staging.yml must smoke the deployment before opening the promotion PR");
}

const promoteWorkflow = await readFile(join(workflowsDir, "promote-dev.yml"), "utf8");
if (!promoteWorkflow.includes("pnpm manifests:render")) {
  throw new Error("promote-dev.yml must render deploy manifests before opening a promotion PR");
}

console.log(`Validated ${workflowFiles.length} GitHub workflow files.`);
