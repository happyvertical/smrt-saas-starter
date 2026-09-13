import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("$lib/server/report-actions", () => ({
  executeActivityReportRefresh: mocks.execute,
  ReportActionInputError: class ReportActionInputError extends Error {},
}));

import { POST } from "./+server";

describe("POST /api/reports/activity/refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue({ phase: "apply", job: { jobId: "job-1", status: "pending" } });
  });

  it("rejects malformed and unsupported phases before authorization", async () => {
    await expect(POST(event("{"))).resolves.toMatchObject({ status: 400 });
    await expect(POST(event(JSON.stringify({ phase: "cancel" })))).resolves.toMatchObject({
      status: 400,
    });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("delegates preview and apply with request locals", async () => {
    const locals = { tenantId: "11111111-1111-4111-8111-111111111111" };
    const response = await POST(event(JSON.stringify({ phase: "apply" }), locals));
    await expect(response.json()).resolves.toEqual({
      phase: "apply",
      job: { jobId: "job-1", status: "pending" },
    });
    expect(mocks.execute).toHaveBeenCalledWith(locals, "apply");
  });
});

function event(body: string, locals: Record<string, unknown> = {}) {
  return {
    locals,
    request: new Request("http://localhost/api/reports/activity/refresh", {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
    }),
  } as unknown as Parameters<typeof POST>[0];
}
