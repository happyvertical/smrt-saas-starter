import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  verifyWorkerAssetFilesystemReadiness,
  verifyWorkerAssetStorageReadiness,
  verifyWorkerEnvironmentSecretsReadiness,
  verifyWorkerOidcReadiness,
} from "./deployed-runtime.js";

const originalEnvironment = {
  HAPPYVERTICAL_IDP_ISSUER: process.env.HAPPYVERTICAL_IDP_ISSUER,
  OIDC_CLIENT_ID: process.env.OIDC_CLIENT_ID,
  OIDC_CLIENT_SECRET: process.env.OIDC_CLIENT_SECRET,
  PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL,
  SESSION_SECRET: process.env.SESSION_SECRET,
  SMRT_STARTER_ASSET_STORAGE_PATH: process.env.SMRT_STARTER_ASSET_STORAGE_PATH,
};

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("deployed worker readiness", () => {
  it("uses the public OIDC metadata probe and rejects unavailable or mismatched metadata", async () => {
    configureOidc();
    const fetch = vi.fn(async () => new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetch);

    await expect(verifyWorkerOidcReadiness()).rejects.toThrow();
    expect(fetch).toHaveBeenCalledWith(
      "https://issuer.example.test/.well-known/openid-configuration",
      expect.objectContaining({ headers: { accept: "application/json" } }),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          issuer: "https://other.example.test",
          authorization_endpoint: "https://issuer.example.test/authorize",
          token_endpoint: "https://issuer.example.test/token",
          jwks_uri: "https://issuer.example.test/jwks",
        }),
      ),
    );

    await expect(verifyWorkerOidcReadiness()).rejects.toThrow(/issuer/i);
  });

  it("fails before probing OIDC when the deployed callback configuration is incomplete", async () => {
    configureOidc();
    delete process.env.PUBLIC_SITE_URL;
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(verifyWorkerOidcReadiness()).rejects.toThrow("PUBLIC_SITE_URL is required");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("verifies local asset storage through the published filesystem implementation", async () => {
    const path = await mkdtemp(join(tmpdir(), "issue93-assets-"));
    process.env.SMRT_STARTER_ASSET_STORAGE_PATH = path;

    try {
      await expect(verifyWorkerAssetStorageReadiness()).resolves.toBeUndefined();
    } finally {
      await rm(path, { force: true, recursive: true });
    }
  });

  it("removes a partial asset probe after write or read failures", async () => {
    const path = await mkdtemp(join(tmpdir(), "issue93-assets-partial-"));
    const partialPath = join(path, "partial");
    const deleteProbe = vi.fn(async () => await rm(partialPath, { force: true }));
    const partialWrite = {
      async write() {
        await writeFile(partialPath, "partial");
        throw new Error("write failed after a partial write");
      },
      async read() {
        return await readFile(partialPath);
      },
      delete: deleteProbe,
    };

    try {
      await expect(verifyWorkerAssetFilesystemReadiness(partialWrite)).rejects.toThrow(
        "write failed after a partial write",
      );
      expect(deleteProbe).toHaveBeenCalledOnce();
      await expect(readFile(partialPath)).rejects.toThrow();

      const readFailure = {
        write: vi.fn(async () => undefined),
        read: vi.fn(async () => {
          throw new Error("read failed");
        }),
        delete: vi.fn(async () => undefined),
      };
      await expect(verifyWorkerAssetFilesystemReadiness(readFailure)).rejects.toThrow(
        "read failed",
      );
      expect(readFailure.delete).toHaveBeenCalledOnce();

      const deleteFailure = {
        write: vi.fn(async () => undefined),
        read: vi.fn(async () => "smrt-worker-readiness"),
        delete: vi.fn(async () => {
          throw new Error("delete failed");
        }),
      };
      await expect(verifyWorkerAssetFilesystemReadiness(deleteFailure)).rejects.toThrow(
        "delete failed",
      );
    } finally {
      await rm(path, { force: true, recursive: true });
    }
  });

  it("fails closed for missing environment secrets", async () => {
    configureOidc();
    delete process.env.SESSION_SECRET;

    await expect(verifyWorkerEnvironmentSecretsReadiness()).rejects.toThrow(
      "SESSION_SECRET is required",
    );
  });
});

function configureOidc(): void {
  process.env.HAPPYVERTICAL_IDP_ISSUER = "https://issuer.example.test";
  process.env.OIDC_CLIENT_ID = "starter";
  process.env.OIDC_CLIENT_SECRET = "private-value";
  process.env.PUBLIC_SITE_URL = "https://starter.example.test";
  process.env.SESSION_SECRET = "session-value";
}
