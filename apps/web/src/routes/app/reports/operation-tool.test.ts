import { describe, expect, it, vi } from "vitest";
import { executeOperationTool } from "./operation-tool";

const operation = {
  id: "operation-1",
  kind: "prepare",
  status: "queued",
  payloadFingerprint: "fingerprint",
  createdAt: "2026-01-01T00:00:00.000Z",
  query: { page: 1, pageSize: 25, sort: "window_start", direction: "desc", metricKey: "" },
} as const;
const options = (fetch: typeof globalThis.fetch, signal?: AbortSignal) => ({
  tenantId: "tenant-a",
  currentTenantId: () => "tenant-a",
  currentQuery: {
    page: 2,
    pageSize: 1,
    sort: "quantity" as const,
    direction: "asc" as const,
    metricKey: "mcp.calls",
  },
  fetch,
  acknowledge: vi.fn(),
  signal,
});

describe("report operation WebMCP execution", () => {
  it("submits the currently displayed report query without actor or tenant input", async () => {
    const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(_url).toBe("/api/reports/operations");
      expect(JSON.parse(String(init?.body))).toEqual({
        kind: "prepare",
        requestId: "stable-key",
        query: {
          page: 2,
          pageSize: 1,
          sort: "quantity",
          direction: "asc",
          metricKey: "mcp.calls",
        },
      });
      return new Response(JSON.stringify({ operation }), { status: 200 });
    });
    const tool = options(fetch);
    const raw = await executeOperationTool(
      {
        action: "submit",
        kind: "prepare",
        requestId: "stable-key",
        tenantId: "forged",
      },
      tool,
    );
    expect(JSON.parse(raw)).toMatchObject({ ok: true, operation });
    expect(tool.acknowledge).toHaveBeenCalledWith("Operation operation-1 is queued.");
  });

  it("rejects malformed explicit queries before making a request", async () => {
    const fetch = vi.fn();
    const raw = await executeOperationTool(
      {
        action: "submit",
        kind: "prepare",
        requestId: "stable-key",
        query: { ownerId: "forged" },
      },
      options(fetch),
    );
    expect(raw).toBe(JSON.stringify({ ok: false, reason: "invalid_request" }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the same status and cancel commands and acknowledges only after a response", async () => {
    const fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(url).toBe("/api/reports/operations/operation-1/cancel");
      expect(init?.method).toBe("POST");
      return new Response(JSON.stringify({ operation: { ...operation, status: "cancelled" } }), {
        status: 200,
      });
    });
    const tool = options(fetch);
    const raw = await executeOperationTool({ action: "cancel", id: "operation-1" }, tool);
    expect(JSON.parse(raw)).toMatchObject({ ok: true, operation: { status: "cancelled" } });
    expect(tool.acknowledge).toHaveBeenCalledWith("Operation operation-1 is cancelled.");
  });

  it("updates the visible operation before acknowledging the command", async () => {
    const order: string[] = [];
    const fetch = vi.fn(async () => new Response(JSON.stringify({ operation }), { status: 200 }));
    await executeOperationTool(
      { action: "status", id: "operation-1" },
      {
        ...options(fetch),
        showOperation: async () => {
          order.push("visible");
        },
        acknowledge: () => {
          order.push("acknowledged");
        },
      },
    );
    expect(order).toEqual(["visible", "acknowledged"]);
  });

  it("does not acknowledge a response after the mounted request is cancelled", async () => {
    const controller = new AbortController();
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetch = vi.fn(async () => {
      await wait;
      return new Response(JSON.stringify({ operation }), { status: 200 });
    });
    const tool = options(fetch, controller.signal);
    const pending = executeOperationTool({ action: "status", id: "operation-1" }, tool);
    controller.abort();
    release();
    await expect(pending).resolves.toBe(JSON.stringify({ ok: false, reason: "cancelled" }));
    expect(tool.acknowledge).not.toHaveBeenCalled();
  });
});
