import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), get: vi.fn(), list: vi.fn(), cancel: vi.fn() }));
vi.mock("$lib/server/report-operations", () => ({
  createReportOperation: mocks.create,
  getReportOperation: mocks.get,
  listReportOperations: mocks.list,
  cancelReportOperation: mocks.cancel,
}));

import {
  executeReportOperationAgentTool,
  reportOperationAgentTools,
} from "./report-operation-agent";

const membership = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
} as any;

describe("report operation agent catalog", () => {
  it("exposes prepare/status/cancel only", () => {
    expect(reportOperationAgentTools.map((tool) => tool.name)).toEqual([
      "reports.operations.prepare",
      "reports.operations.status",
      "reports.operations.cancel",
    ]);
  });

  it("forwards only server-derived principal context to prepare", async () => {
    mocks.create.mockResolvedValue({ id: "operation-1" });
    await expect(
      executeReportOperationAgentTool(membership, "reports.operations.prepare", {
        requestId: "chat-id",
        kind: "approval-demo",
      }),
    ).resolves.toEqual({ operation: { id: "operation-1" } });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: membership.tenantId, user: { id: membership.userId } }),
      expect.objectContaining({ kind: "approval-demo", requestId: "chat-id" }),
    );
  });
});
