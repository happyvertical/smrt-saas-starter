import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./+server";

type HealthHandlerEvent = Parameters<typeof GET>[0];

describe("GET /api/health", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports ok with the baked-in app version", async () => {
    vi.stubEnv("APP_VERSION", "abc123");
    const response = await GET({} as HealthHandlerEvent);
    await expect(response.json()).resolves.toEqual({ status: "ok", version: "abc123" });
  });

  it("reports a null version when APP_VERSION is unset", async () => {
    vi.stubEnv("APP_VERSION", "");
    const response = await GET({} as HealthHandlerEvent);
    await expect(response.json()).resolves.toEqual({ status: "ok", version: null });
  });

  it("reports the ephemeral run binding only when explicitly configured", async () => {
    vi.stubEnv("APP_VERSION", "abc123");
    vi.stubEnv("SMRT_PRODUCTION_E2E_RUN_ID", "run-123");
    const response = await GET({} as HealthHandlerEvent);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      version: "abc123",
      e2eRunId: "run-123",
    });
  });

  it("is non-cacheable so deploy pipelines never see a stale version", async () => {
    const response = await GET({} as HealthHandlerEvent);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
