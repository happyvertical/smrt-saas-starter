import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  downloadActivityReportExport: vi.fn(),
}));

vi.mock("$lib/server/report-actions", () => ({
  downloadActivityReportExport: routeMocks.downloadActivityReportExport,
}));

import { GET } from "./+server";

describe("GET /api/reports/activity/exports/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.downloadActivityReportExport.mockResolvedValue(new Response("export"));
  });

  it("returns 404 for an invalid export id before loading an export", async () => {
    await expect(GET(event("not-a-uuid"))).rejects.toMatchObject({ status: 404 });
    expect(routeMocks.downloadActivityReportExport).not.toHaveBeenCalled();
  });

  it("delegates a valid export id with the current locals", async () => {
    const locals = { tenantId: "11111111-1111-4111-8111-111111111111", requestId: "request-3" };
    const id = "22222222-2222-4222-8222-222222222222";
    const response = await GET(event(id, locals));

    await expect(response.text()).resolves.toBe("export");
    expect(routeMocks.downloadActivityReportExport).toHaveBeenCalledWith(locals, id);
  });
});

function event(id: string, locals: Record<string, unknown> = {}) {
  return { locals, params: { id } } as unknown as Parameters<typeof GET>[0];
}
