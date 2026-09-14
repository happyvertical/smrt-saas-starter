import { createReportDataSurfaceTools, executeAsPrincipal, type PrincipalTool } from "@happyvertical/smrt-agents";
import { TenantActivityReport } from "@happyvertical/smrt-saas-objects";
import { registerPermissionDefinitions } from "@happyvertical/smrt-users";
import {
  activityReportAdapterOptions,
  createTenantActivityReportRequest,
  getTenantActivityReportDescriptor,
} from "$lib/server/activity-report";
import type { StarterMembershipContext } from "$lib/server/authz";
import { getAppDatabase } from "$lib/server/db";

const reportReadCollection = "tenant.usage";
const reportToolSlugs = new Set(["data.discover", "data.inspect", "data.query", "reports.query"]);

export class TenantActivityReportAgentReadError extends Error {
  readonly status = 403;
}

// The starter already resolves this permission for every report request. Register
// the same existing slug with the SMRT operation catalog; this creates no role
// grant and keeps the PrincipalRun catalog gate equal to the browser gate.
registerPermissionDefinitions([
  {
    slug: "tenant.usage.read",
    collection: reportReadCollection,
    description: "Read tenant usage reports.",
  },
]);

export const tenantActivityReportAgentTools = createReportDataSurfaceTools({
  reports: [
    {
      report: TenantActivityReport,
      collection: reportReadCollection,
      adapter: activityReportAdapterOptions,
      label: "Tenant activity",
      description: "Neutral tenant activity aggregates.",
    },
  ],
}).filter((tool) => reportToolSlugs.has(tool.slug));

export function getTenantActivityReportAgentTools(): PrincipalTool[] {
  return tenantActivityReportAgentTools;
}

export async function createTenantActivityReportQueryInput(tenantId: string) {
  const descriptor = await getTenantActivityReportDescriptor();
  return {
    reportId: descriptor.resourceId,
    request: createTenantActivityReportRequest(tenantId),
    execution: "silent" as const,
  };
}

export async function executeTenantActivityReportAgentTool(
  membership: Pick<StarterMembershipContext, "tenantId" | "userId" | "permissions">,
  slug: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (!membership.permissions.includes("tenant.usage.read")) {
    throw new TenantActivityReportAgentReadError("Missing permission: tenant.usage.read");
  }
  const tool = tenantActivityReportAgentTools.find((candidate) => candidate.slug === slug);
  if (!tool) throw new Error("Tenant activity report tool is not available");
  const db = await getAppDatabase();
  return await executeAsPrincipal(
    {
      db,
      principal: {
        runAsUserId: membership.userId,
        tenantId: membership.tenantId,
        allowedTools: [...reportToolSlugs],
      },
      onBehalfOfUserId: membership.userId,
      // `requirePermission` re-resolves this membership on this request. Pass
      // that exact set so the operation gate and application authorization use
      // one live authority snapshot on every chat turn.
      permissions: membership.permissions,
    },
    async (run) => await tool.execute({ run, args, db }),
  );
}
