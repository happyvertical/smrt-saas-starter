import { randomUUID } from "node:crypto";
import {
  type DeployedApplicationRuntime,
  initializeDeployedApplicationRuntime,
} from "@happyvertical/smrt-app-runtime";
import { getFilesystemLazy } from "@happyvertical/smrt-assets";
import "@happyvertical/smrt-assets/filesystem";
import { OidcLoginService } from "@happyvertical/smrt-users";
import { ensureWorkerTenancy, getWorkerDatabase } from "./runtime.js";

const OIDC_READINESS_TIMEOUT_MS = 5_000;

/**
 * Starts the published deployed-runtime composition used by the packaged
 * worker. Schema migration remains an explicit release operation; workers do
 * not mutate application schema during process startup.
 */
export async function initializeWorkerDeployedRuntime(): Promise<DeployedApplicationRuntime> {
  ensureWorkerTenancy();

  return await initializeDeployedApplicationRuntime({
    profile: "self-hosted",
    providers: {
      tenancy: { mode: "multi-tenant", context: "required", isolation: "application" },
      assets: { provider: "local-files", ownership: "operator" },
    },
    database: {
      engine: "postgres",
      connect: async () => (await getWorkerDatabase()) as DeployedApplicationRuntime["db"],
      close: async (database) => {
        await database.close?.();
      },
    },
    authentication: {
      provider: "oidc",
      readiness: verifyWorkerOidcReadiness,
    },
    assets: {
      provider: "local-files",
      readiness: verifyWorkerAssetStorageReadiness,
    },
    secrets: {
      provider: "environment",
      readiness: verifyWorkerEnvironmentSecretsReadiness,
    },
  });
}

export async function verifyWorkerOidcReadiness(): Promise<void> {
  const issuer = requiredEnvironmentValue("HAPPYVERTICAL_IDP_ISSUER");
  const clientId = requiredEnvironmentValue("OIDC_CLIENT_ID");
  const clientSecret = requiredEnvironmentValue("OIDC_CLIENT_SECRET");
  const service = new OidcLoginService({
    providerName: "happyvertical",
    provider: {
      kind: "kanidm",
      issuer,
      clientId,
      clientSecret,
      redirectUri: oidcCallbackUrl(),
    },
    fetch: fetchWithOidcReadinessTimeout,
    metadataCacheTtlMs: OIDC_READINESS_TIMEOUT_MS,
  });
  const discovery = await service.getMetadata();

  if (
    !discovery ||
    !isAbsoluteUrl(discovery.authorization_endpoint) ||
    !isAbsoluteUrl(discovery.token_endpoint) ||
    !isAbsoluteUrl(discovery.jwks_uri)
  ) {
    throw new Error("OIDC discovery is incomplete");
  }
}

async function fetchWithOidcReadinessTimeout(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): Promise<Response> {
  return await fetch(input, {
    ...init,
    signal: AbortSignal.timeout(OIDC_READINESS_TIMEOUT_MS),
  });
}

export interface WorkerAssetFilesystem {
  write(path: string, content: string, options: { createParents: boolean }): Promise<void>;
  read(path: string): Promise<string | Buffer>;
  delete(path: string): Promise<void>;
}

export async function verifyWorkerAssetStorageReadiness(): Promise<void> {
  const filesystem = await getFilesystemLazy({ type: "local", basePath: assetStoragePath() });
  await verifyWorkerAssetFilesystemReadiness(filesystem);
}

export async function verifyWorkerAssetFilesystemReadiness(
  filesystem: WorkerAssetFilesystem,
): Promise<void> {
  const probeName = `.smrt-worker-readiness-${randomUUID()}`;
  const expected = "smrt-worker-readiness";

  try {
    await filesystem.write(probeName, expected, { createParents: true });
    const received = await filesystem.read(probeName);
    if (received.toString() !== expected) {
      throw new Error("Asset storage read/write verification failed");
    }
  } finally {
    await filesystem.delete(probeName);
  }
}

export async function verifyWorkerEnvironmentSecretsReadiness(): Promise<void> {
  requiredEnvironmentValue("SESSION_SECRET");
  requiredEnvironmentValue("OIDC_CLIENT_SECRET");
}

function assetStoragePath(): string {
  return requiredEnvironmentValue("SMRT_STARTER_ASSET_STORAGE_PATH");
}

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function oidcCallbackUrl(): string {
  const siteUrl = new URL(requiredEnvironmentValue("PUBLIC_SITE_URL"));
  siteUrl.pathname = "/auth/happyvertical/callback";
  siteUrl.search = "";
  siteUrl.hash = "";
  return siteUrl.toString();
}

function isAbsoluteUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
