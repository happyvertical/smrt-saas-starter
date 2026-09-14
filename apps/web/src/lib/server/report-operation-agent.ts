import type { StarterMembershipContext } from "$lib/server/authz";
import {
  cancelReportOperation,
  createReportOperation,
  getReportOperation,
  listReportOperations,
} from "$lib/server/report-operations";

export const reportOperationAgentTools = [
  {
    name: "reports.operations.prepare",
    description: "Prepare and store an immutable tenant activity report snapshot.",
    readOnly: false,
    requiredFeature: "mcp.write_tools",
  },
  {
    name: "reports.operations.status",
    description: "Read your report operation status.",
    readOnly: true,
    requiredFeature: "mcp.read_tools",
  },
  {
    name: "reports.operations.cancel",
    description: "Cancel your queued report operation.",
    readOnly: false,
    requiredFeature: "mcp.write_tools",
  },
] as const;

export async function executeReportOperationAgentTool(
  membership: StarterMembershipContext,
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const locals = { tenantId: membership.tenantId, user: { id: membership.userId } } as App.Locals;
  if (name === "reports.operations.prepare")
    return {
      operation: await createReportOperation(locals, {
        kind: input.kind === "approval-demo" ? "approval-demo" : "prepare",
        requestId: String(input.requestId),
        query: input.query as never,
      }),
    };
  if (name === "reports.operations.status") {
    const id = typeof input.id === "string" ? input.id : "";
    return id
      ? { operation: await getReportOperation(locals, id) }
      : { operations: await listReportOperations(locals) };
  }
  if (name === "reports.operations.cancel")
    return { operation: await cancelReportOperation(locals, String(input.id ?? "")) };
  throw new Error("Report operation tool is unavailable");
}
