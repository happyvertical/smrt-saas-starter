import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  executeActivityReportExport: vi.fn(),
}));

vi.mock("$lib/server/report-actions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("$lib/server/report-actions")>()),
  executeActivityReportExport: routeMocks.executeActivityReportExport,
}));

import { POST } from "./+server";

describe("POST /api/reports/activity/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.executeActivityReportExport.mockResolvedValue({
      phase: "apply",
      format: "csv",
      downloadUrl: "/api/reports/activity/exports/report-1",
    });
  });

  it("rejects malformed JSON before executing the export", async () => {
    const response = await POST(event("{"));

    expect(response.status).toBe(400);
    expect(routeMocks.executeActivityReportExport).not.toHaveBeenCalled();
  });

  it.each([
    ["projection", { phase: "apply", format: "csv", query: { projection: ["id"] } }],
    ["fields", { phase: "apply", format: "csv", query: { fields: ["id"] } }],
    ["tenant selector", { phase: "apply", format: "csv", query: { tenantId: "other-tenant" } }],
  ])("rejects a forbidden %s before executing the export", async (_label, body) => {
    const response = await POST(event(JSON.stringify(body)));

    expect(response.status).toBe(400);
    expect(routeMocks.executeActivityReportExport).not.toHaveBeenCalled();
  });

  it("delegates valid export input with the current locals", async () => {
    const locals = { tenantId: "11111111-1111-4111-8111-111111111111", requestId: "request-2" };
    const response = await POST(event(JSON.stringify({ phase: "apply", format: "csv" }), locals));

    await expect(response.json()).resolves.toEqual({
      phase: "apply",
      format: "csv",
      downloadUrl: "/api/reports/activity/exports/report-1",
    });
    expect(routeMocks.executeActivityReportExport).toHaveBeenCalledWith(locals, {
      phase: "apply",
      format: "csv",
    });
  });
});

function event(body: string, locals: Record<string, unknown> = {}) {
  return {
    locals,
    request: new Request("http://localhost/api/reports/activity/export", {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
    }),
  } as unknown as Parameters<typeof POST>[0];
}
