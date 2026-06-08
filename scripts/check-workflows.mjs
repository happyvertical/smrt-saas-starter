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
  "mobile-android:",
  "uses: gradle/actions/wrapper-validation@v6",
  "uses: actions/setup-java@v5",
  'java-version: "21"',
  "uses: android-actions/setup-android@v4",
  'sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"',
  "pnpm mobile:validate:android",
  "mobile-ios:",
  "runs-on: macos-latest",
  "brew install xcodegen",
  "pnpm mobile:validate:ios",
]) {
  if (!pullRequestWorkflow.includes(phrase)) {
    throw new Error(`on-pull-request.yml must include native mobile validation: ${phrase}`);
  }
}

console.log(`Validated ${workflowFiles.length} GitHub workflow files.`);
