import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const workflowsDir = join(root, ".github/workflows");
const actionsDir = join(root, ".github/actions");
const required = [
  "on-pull-request.yml",
  "postgres-tests.yml",
  "recovery-build.yml",
  "deploy-dev.yml",
  "promote-dev.yml",
  "deploy-staging.yml",
  "on-merge-main.yml",
];

for (const file of required) await access(join(workflowsDir, file));

const workflowFiles = (await readdir(workflowsDir)).filter((file) => file.endsWith(".yml"));
function validatePinnedUses(file, source) {
  for (const match of source.matchAll(/uses:\s+([^\s]+)@([^\s#]+)/g)) {
    const [, action, reference] = match;
    if (!/^[a-f0-9]{40}$/.test(reference)) {
      throw new Error(`${file} must pin ${action} to a full commit SHA`);
    }
  }
}

for (const file of workflowFiles) {
  const source = await readFile(join(workflowsDir, file), "utf8");
  if (!source.includes("permissions:")) throw new Error(`${file} must declare least permissions`);
  validatePinnedUses(file, source);
}

for (const entry of await readdir(actionsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const file = `${entry.name}/action.yml`;
  validatePinnedUses(file, await readFile(join(actionsDir, file), "utf8"));
}

const setup = await readFile(join(root, ".github/actions/setup-environment/action.yml"), "utf8");
for (const phrase of [
  "package.json').packageManager",
  "pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1",
  "actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e",
  'node-version: "24.18.0"',
  "pnpm install --frozen-lockfile",
]) {
  if (!setup.includes(phrase)) throw new Error(`setup-environment must include: ${phrase}`);
}

const pullRequest = await readFile(join(workflowsDir, "on-pull-request.yml"), "utf8");
for (const phrase of [
  "merge_group:",
  // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression
  "cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
  "runs-on: ubuntu-latest",
  "Build and generate reusable context",
  "vars.CI_NODE_RUNNER_ENABLED == 'true' && 'arc-happyvertical-node' || 'ubuntu-latest'",
  "pnpm ci:context:verify",
  "pnpm test:sqlite",
  "pnpm test:postgres",
  "Production Image E2E",
  "pnpm test:e2e:production",
  "artifacts/production-e2e/",
  "Smoke exact candidate digests",
  "runtime-candidate.json",
  "tested_tree=$(git rev-parse 'HEAD^{tree}')",
  "- 'scripts/prepare-runtime.mjs'",
  "name: Required CI",
  "if: always()",
]) {
  if (!pullRequest.includes(phrase)) throw new Error(`on-pull-request.yml must include: ${phrase}`);
}

const staticJob = pullRequest.slice(
  pullRequest.indexOf("  static:"),
  pullRequest.indexOf("  generated:"),
);
if (staticJob.includes("setup-environment") || staticJob.includes("pnpm install")) {
  throw new Error("Static checks must not install workspace dependencies");
}

for (const file of ["deploy-dev.yml", "deploy-staging.yml", "on-merge-main.yml"]) {
  const source = await readFile(join(workflowsDir, file), "utf8");
  for (const forbidden of ["pnpm check", "docker/build-push-action"]) {
    if (source.includes(forbidden)) throw new Error(`${file} must promote without ${forbidden}`);
  }
  for (const phrase of [
    "actions: read",
    "pull-requests:",
    "./.github/actions/promote-candidate",
    "candidate_run_id",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression
    "ref: ${{ inputs.source_sha || github.sha }}",
    '- "scripts/prepare-runtime.mjs"',
  ]) {
    if (!source.includes(phrase)) throw new Error(`${file} must include: ${phrase}`);
  }
}

const recovery = await readFile(join(workflowsDir, "recovery-build.yml"), "utf8");
for (const phrase of ["EMERGENCY_BUILD", "docker/build-push-action@", "runtime-candidate.json"]) {
  if (!recovery.includes(phrase)) throw new Error(`recovery-build.yml must include: ${phrase}`);
}

const postgres = await readFile(join(workflowsDir, "postgres-tests.yml"), "utf8");
for (const phrase of [
  "schedule:",
  "pnpm test:postgres",
  "cleanup-ci-postgres.mjs",
  "TURBO_FORCE",
]) {
  if (!postgres.includes(phrase)) throw new Error(`postgres-tests.yml must include: ${phrase}`);
}

console.log(`Validated ${workflowFiles.length} GitHub workflow files.`);
