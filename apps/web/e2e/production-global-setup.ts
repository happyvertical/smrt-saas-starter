import type { FullConfig } from "@playwright/test";

export default async function productionGlobalSetup(config: FullConfig): Promise<void> {
  const baseUrl = String(config.projects[0]?.use.baseURL ?? "");
  const runId = process.env.E2E_PRODUCTION_RUN_ID;
  if (!baseUrl || !runId) throw new Error("Production E2E binding configuration is missing.");
  const origin = new URL(baseUrl);
  const response = await fetch(`${origin.origin}/api/health`, {
    headers: {
      "x-forwarded-host": origin.host,
      "x-forwarded-proto": origin.protocol.replace(":", ""),
    },
    signal: AbortSignal.timeout(10_000),
  });
  const payload = (await response.json()) as { e2eRunId?: string };
  if (!response.ok || payload.e2eRunId !== runId) {
    throw new Error("Production E2E target is not bound to this ephemeral run.");
  }
}
