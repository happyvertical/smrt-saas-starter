import {
  getTenantActivityReport,
  type TenantActivityReportQuery,
} from "$lib/server/activity-report";
import { resolveStarterPromptPreview } from "$lib/server/experience";
import { getBillingOverview } from "$lib/server/subscriptions";
import {
  assertMetricAllowed,
  getContainedThresholdUsageWindow,
  TenantQuotaError,
} from "$lib/server/thresholds";
import { getUsageSummaries, recordTenantUsageSignal } from "$lib/server/usage";

export interface RuntimeTool {
  name: string;
  description: string;
  readOnly: boolean;
  requiredFeature: string;
}

export const runtimeTools: RuntimeTool[] = [
  {
    name: "tenant.usage.summary",
    description: "Summarize tenant usage meters and thresholds.",
    readOnly: true,
    requiredFeature: "mcp.read_tools",
  },
  {
    name: "tenant.subscription.summary",
    description: "Summarize the tenant subscription, feature grants, and billing period.",
    readOnly: true,
    requiredFeature: "mcp.read_tools",
  },
  {
    name: "tenant.activity-report.query",
    description:
      "Read the visible tenant activity report table with server paging, sorting, and an optional activity filter.",
    readOnly: true,
    requiredFeature: "mcp.read_tools",
  },
  {
    name: "tenant.prompt.preview",
    description: "Preview the effective prompt after tenant overrides.",
    readOnly: true,
    requiredFeature: "prompts.tenant_overrides",
  },
  {
    name: "tenant.subscription.update",
    description: "Prepare a subscription change after user confirmation.",
    readOnly: false,
    requiredFeature: "mcp.write_tools",
  },
];

export function listRuntimeTools(enabledFeatureKeys: Iterable<string>) {
  const enabledFeatures = new Set(enabledFeatureKeys);
  return runtimeTools.filter((tool) => enabledFeatures.has(tool.requiredFeature));
}

export interface RuntimeToolContext {
  tenantId: string;
}

export interface RuntimeToolExecution {
  tool: RuntimeTool;
  response: Awaited<ReturnType<typeof callRuntimeTool>>;
}

export class RuntimeToolExecutionError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "RuntimeToolExecutionError";
    this.status = status;
  }
}

export async function executeRuntimeToolForTenant(
  name: string,
  input: unknown,
  tenantId: string,
): Promise<RuntimeToolExecution> {
  const overview = await getBillingOverview(tenantId);
  const allowed = listRuntimeTools(overview.snapshot.featureKeys);
  const tool = allowed.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new RuntimeToolExecutionError(403, "Tool is not available for the current tenant");
  }

  let mcpThresholds: ReturnType<typeof assertMetricAllowed> = [];
  try {
    mcpThresholds = assertMetricAllowed(overview.snapshot.thresholdEvaluations, "mcp.calls");
  } catch (error) {
    if (!(error instanceof TenantQuotaError)) {
      throw error;
    }
    throw new RuntimeToolExecutionError(429, "Tenant exceeded the MCP calls threshold");
  }
  const mcpUsageWindow = getContainedThresholdUsageWindow(mcpThresholds);

  const response = await callRuntimeTool(name, input, { tenantId });
  await recordTenantUsageSignal({
    tenantId,
    metricKey: "mcp.calls",
    quantity: 1,
    source: "smrt-app-mcp",
    sourceId: name,
    ...(mcpUsageWindow
      ? {
          usageWindow: mcpUsageWindow,
        }
      : {}),
    dimensions: {
      toolName: tool.name,
      readOnly: tool.readOnly,
    },
  });

  return { tool, response };
}

export async function callRuntimeTool(name: string, input: unknown, context: RuntimeToolContext) {
  if (name === "tenant.usage.summary") {
    const summaries = (await getUsageSummaries(context.tenantId)).map((summary) => ({
      ...summary,
      windowStart: summary.windowStart.toISOString(),
      windowEnd: summary.windowEnd.toISOString(),
    }));

    return {
      content: [{ type: "text", text: "Tenant usage summary loaded." }],
      structuredContent: { tenantId: context.tenantId, summaries, input },
    };
  }

  if (name === "tenant.subscription.summary") {
    const overview = await getBillingOverview(context.tenantId);

    return {
      content: [{ type: "text", text: "Tenant subscription summary loaded." }],
      structuredContent: {
        tenantId: context.tenantId,
        subscription: {
          planName: overview.currentPlan.name,
          planKey: overview.currentPlan.planKey,
          status: overview.snapshot.status,
          periodEnd: overview.periodEnd,
          billingPortalAvailable: overview.billingPortalAvailable,
          featureKeys: overview.snapshot.featureKeys,
          thresholds: overview.snapshot.thresholdEvaluations.map((evaluation) => ({
            metricKey: evaluation.threshold.metricKey,
            label: evaluation.threshold.label ?? evaluation.threshold.metricKey,
            enforcement: evaluation.threshold.enforcement,
            limit: evaluation.threshold.limit,
            used: evaluation.usage.quantity,
            remaining: evaluation.remaining,
            state: evaluation.state,
            allowed: evaluation.allowed,
          })),
        },
        input,
      },
    };
  }

  if (name === "tenant.activity-report.query") {
    const query = readActivityReportQuery(input);
    const report = await getTenantActivityReport(context.tenantId, query);
    return {
      content: [
        {
          type: "text",
          text: `Tenant activity report page ${report.page} of ${Math.max(1, Math.ceil(report.total / report.pageSize))} loaded (${report.total} rows total).`,
        },
      ],
      structuredContent: {
        tenantId: context.tenantId,
        report: {
          descriptor: report.descriptor,
          rows: report.rows,
          total: report.total,
          page: report.page,
          pageSize: report.pageSize,
          queryFingerprint: report.queryFingerprint,
        },
      },
    };
  }

  if (name === "tenant.prompt.preview") {
    const prompt = await resolveStarterPromptPreview(context.tenantId, readPromptKey(input));

    return {
      content: [{ type: "text", text: "Tenant prompt preview loaded." }],
      structuredContent: {
        tenantId: context.tenantId,
        prompt: {
          key: prompt.key,
          template: prompt.template,
          text: prompt.text,
          ai: prompt.ai,
        },
      },
    };
  }

  if (name === "tenant.subscription.update") {
    const overview = await getBillingOverview(context.tenantId);

    return {
      content: [{ type: "text", text: "Subscription change requires checkout confirmation." }],
      structuredContent: {
        tenantId: context.tenantId,
        action: "requires_confirmation",
        subscription: {
          planName: overview.currentPlan.name,
          planKey: overview.currentPlan.planKey,
          status: overview.snapshot.status,
          periodEnd: overview.periodEnd,
          billingPortalAvailable: overview.billingPortalAvailable,
        },
        input,
      },
    };
  }

  return {
    content: [
      { type: "text", text: `Tool ${name} is registered but requires its upstream handler.` },
    ],
    structuredContent: { input },
  };
}

function readPromptKey(input: unknown): string | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const key = (input as { key?: unknown }).key;
  return typeof key === "string" && key.trim().length > 0 ? key : undefined;
}

function readActivityReportQuery(input: unknown): TenantActivityReportQuery {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const candidate = input as Record<string, unknown>;
  const page = positiveInteger(candidate.page);
  const pageSize = positiveInteger(candidate.pageSize);
  const sort = readActivityReportSort(candidate.sort);
  const direction =
    candidate.direction === "asc" || candidate.direction === "desc"
      ? candidate.direction
      : undefined;
  const metricKey =
    typeof candidate.metricKey === "string" && candidate.metricKey.trim().length <= 120
      ? candidate.metricKey.trim() || undefined
      : undefined;
  return {
    ...(page ? { page } : {}),
    ...(pageSize ? { pageSize } : {}),
    ...(sort ? { sort } : {}),
    ...(direction ? { direction } : {}),
    ...(metricKey ? { metricKey } : {}),
  };
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function readActivityReportSort(value: unknown): TenantActivityReportQuery["sort"] | undefined {
  return value === "id" ||
    value === "metric_key" ||
    value === "window_start" ||
    value === "quantity"
    ? value
    : undefined;
}
