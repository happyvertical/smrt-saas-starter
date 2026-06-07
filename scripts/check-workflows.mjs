import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
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
  if (!text.includes("uses: actions/checkout@v4")) {
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

console.log(`Validated ${workflowFiles.length} GitHub workflow files.`);
