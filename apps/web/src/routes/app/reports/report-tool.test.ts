import { describe, expect, it, vi } from "vitest";
import { executeReportTool } from "./report-tool";

const reportResponse = () =>
  new Response(
    JSON.stringify({
      structuredContent: {
        report: {
          page: 1,
          pageSize: 25,
          total: 2,
          query: { page: 1, pageSize: 25, sort: "window_start", direction: "desc" },
        },
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

describe("report WebMCP execution", () => {
  it("forwards the caller signal to fetch", async () => {
    vi.stubGlobal("window", { location: { origin: "https://starter.test" } });
    const controller = new AbortController();
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBe(controller.signal);
      return reportResponse();
    });
    const goto = vi.fn(async () => {});
    const acknowledge = vi.fn();
    const raw = await executeReportTool(
      {},
      {
        tenantId: "tenant-1",
        currentTenantId: () => "tenant-1",
        fetch,
        goto,
        acknowledge,
        signal: controller.signal,
      },
    );
    expect(JSON.parse(raw)).toMatchObject({ ok: true });
    expect(goto).toHaveBeenCalledOnce();
    expect(acknowledge).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("suppresses navigation and acknowledgement when cancelled after the response", async () => {
    const controller = new AbortController();
    let releaseJson!: () => void;
    const jsonReady = new Promise<void>((resolve) => {
      releaseJson = resolve;
    });
    const fetch = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => {
            await jsonReady;
            return (await reportResponse()).json();
          },
        }) as Response,
    );
    const goto = vi.fn(async () => {});
    const acknowledge = vi.fn();
    const execution = executeReportTool(
      {},
      {
        tenantId: "tenant-1",
        currentTenantId: () => "tenant-1",
        fetch,
        goto,
        acknowledge,
        signal: controller.signal,
      },
    );
    controller.abort();
    releaseJson();
    await expect(execution).resolves.toBe(JSON.stringify({ ok: false, reason: "cancelled" }));
    expect(goto).not.toHaveBeenCalled();
    expect(acknowledge).not.toHaveBeenCalled();
  });
});
