import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

const requiredFiles = [
  "README.md",
  "AGENTS.md",
  "CLAUDE.md",
  ".mcp.json",
  ".sops.yaml",
  ".env.example",
  "docker-compose.yml",
  ".dockerignore",
  "apps/web/package.json",
  "apps/web/AGENTS.md",
  "apps/web/CLAUDE.md",
  "apps/web/Dockerfile",
  "apps/web/Dockerfile.dockerignore",
  "apps/web/smrt.config.mjs",
  "apps/web/src/routes/+page.svelte",
  "apps/web/src/routes/app/+layout.svelte",
  "apps/worker/package.json",
  "apps/worker/Dockerfile",
  "apps/worker/Dockerfile.dockerignore",
  "apps/mobile/package.json",
  "apps/mobile/AGENTS.md",
  "apps/mobile/CLAUDE.md",
  "apps/mobile/gradlew",
  "apps/mobile/gradle/wrapper/gradle-wrapper.properties",
  "apps/mobile/scripts/validate-android.mjs",
  "apps/mobile/scripts/validate-ios.mjs",
  "packages/app-objects/package.json",
  "packages/app-ui/package.json",
  "packages/mobile-contract/package.json",
  "docs/architecture.md",
  "docs/upstream-work.md",
  "docs/agentic-development.md",
  "docs/testing.md",
  "scripts/prepare-runtime.mjs",
  "scripts/build-runtime-images.mjs",
  "scripts/smoke-runtime-images.mjs",
  "scripts/render-manifests.mjs",
  "scripts/update-manifest-digests.mjs",
];

for (const file of requiredFiles) {
  await access(join(root, file));
}

const agents = await readFile(join(root, "AGENTS.md"), "utf8");
for (const phrase of [
  "SOPS",
  "isolated SMRT or SDK worktree",
  "UUID columns stay UUID",
  "file an upstream issue",
  "Wait for the blocker",
  "docs/testing.md",
]) {
  if (!agents.includes(phrase)) {
    throw new Error(`AGENTS.md must mention: ${phrase}`);
  }
}

const readme = await readFile(join(root, "README.md"), "utf8");
for (const phrase of [
  "SMRT",
  "Stripe",
  "Kotlin Multiplatform",
  "right-dock chat",
  "Docker Compose Postgres",
]) {
  if (!readme.includes(phrase)) {
    throw new Error(`README.md must mention: ${phrase}`);
  }
}

const compose = await readFile(join(root, "docker-compose.yml"), "utf8");
for (const phrase of [
  "postgres:",
  "POSTGRES_DB",
  "pg_isready",
  "postgres-data:/var/lib/postgresql",
]) {
  if (!compose.includes(phrase)) {
    throw new Error(`docker-compose.yml must include: ${phrase}`);
  }
}

const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
for (const scriptName of [
  "services:up",
  "services:down",
  "services:logs",
  "db:up",
  "db:smoke",
  "runtime:prepare",
  "images:build",
  "images:smoke",
  "runtime:check",
  "manifests:render",
]) {
  if (!packageJson.scripts?.[scriptName]) {
    throw new Error(`package.json must include script: ${scriptName}`);
  }
}

const webPackageJson = JSON.parse(await readFile(join(root, "apps/web/package.json"), "utf8"));
if (!webPackageJson.scripts?.["db:smoke"]) {
  throw new Error("apps/web/package.json must include script: db:smoke");
}
if (!webPackageJson.files?.includes("build/")) {
  throw new Error("apps/web/package.json must include production files for build/");
}

const workerPackageJson = JSON.parse(
  await readFile(join(root, "apps/worker/package.json"), "utf8"),
);
if (!workerPackageJson.files?.includes("dist/")) {
  throw new Error("apps/worker/package.json must include production files for dist/");
}

const mobilePackageJson = JSON.parse(
  await readFile(join(root, "apps/mobile/package.json"), "utf8"),
);
for (const scriptName of ["validate:shell", "validate:android", "validate:ios"]) {
  if (!mobilePackageJson.scripts?.[scriptName]) {
    throw new Error(`apps/mobile/package.json must include script: ${scriptName}`);
  }
}

const androidValidator = await readFile(
  join(root, "apps/mobile/scripts/validate-android.mjs"),
  "utf8",
);
for (const phrase of ["Java 21", "JAVA_HOME", ":androidApp:assembleDebug"]) {
  if (!androidValidator.includes(phrase)) {
    throw new Error(`Android validation must include: ${phrase}`);
  }
}

console.log("Scaffold validation passed.");
