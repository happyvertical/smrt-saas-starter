// Deploys are GitOps-style: the workflow pushes images and commits manifest
// digests, then the cluster reconciles asynchronously. Post-deploy smoke tests
// must not race that rollout, so this polls /api/health until the deployment
// reports the expected version (the commit SHA baked into the image as
// APP_VERSION) before any tests run.
const [baseUrl, expectedVersion] = process.argv.slice(2);

if (!baseUrl || !expectedVersion) {
  throw new Error("Usage: node scripts/wait-for-deploy.mjs <baseUrl> <expectedVersion>");
}

const timeoutMs =
  Number.parseInt(process.env.DEPLOY_WAIT_TIMEOUT_MS ?? "", 10) > 0
    ? Number.parseInt(process.env.DEPLOY_WAIT_TIMEOUT_MS ?? "", 10)
    : 15 * 60 * 1000;
const intervalMs = 15_000;
const healthUrl = new URL("/api/health", baseUrl);
const startedAt = Date.now();
let lastSeen = "unreachable";

console.log(`Waiting for ${healthUrl} to serve version ${expectedVersion}...`);

while (Date.now() - startedAt < timeoutMs) {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(10_000) });
    if (response.ok) {
      const body = await response.json();
      lastSeen = typeof body.version === "string" ? body.version : "no version reported";
      if (body.version === expectedVersion) {
        console.log(`Deployment is serving ${expectedVersion}.`);
        process.exit(0);
      }
    } else {
      lastSeen = `HTTP ${response.status}`;
    }
  } catch (error) {
    lastSeen = error instanceof Error ? error.message : String(error);
  }

  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}

throw new Error(
  `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${healthUrl} to serve ` +
    `version ${expectedVersion} (last saw: ${lastSeen}).`,
);
