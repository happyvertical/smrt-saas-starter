import { createHash } from "node:crypto";
import { type ChatMessage, ChatService } from "@happyvertical/smrt-chat";
import { sendAgentReply } from "@happyvertical/smrt-chat/internal/agent-runtime";
import {
  createTenantActivityReportQueryInput,
  executeTenantActivityReportAgentTool,
  getTenantActivityReportAgentTools,
} from "$lib/server/agent-report-read";
import {
  hasStarterPermission,
  type StarterMembershipContext,
  starterPermissions,
} from "$lib/server/authz";
import { resolveStarterPromptPreview } from "$lib/server/experience";
import {
  executeRuntimeToolForTenant,
  executeRuntimeToolWithTenantPolicy,
  listRuntimeTools,
  RuntimeToolExecutionError,
  runtimeTools,
  type RuntimeTool as StarterRuntimeTool,
} from "$lib/server/mcp";
import {
  executeReportOperationAgentTool,
  reportOperationAgentTools,
} from "$lib/server/report-operation-agent";
import { getSmrtConfig } from "$lib/server/smrt";
import { type BillingOverview, getBillingOverview } from "$lib/server/subscriptions";
import { withActiveTenant } from "$lib/server/tenant-context";
import {
  assertMetricAllowed,
  getContainedThresholdUsageWindow,
  TenantQuotaError,
} from "$lib/server/thresholds";
import { recordTenantUsageSignal } from "$lib/server/usage";

const starterAgentIdPrefix = "smrt-saas-starter-agent";

export interface TenantChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  messageType: "text" | "system" | "action" | "file" | "tool_call" | "tool_result";
  content: string;
  createdAt: string;
  toolCallData: Record<string, unknown> | null;
}

export interface TenantChatState {
  tenantId: string;
  sessionId: string;
  roomId: string;
  tools: StarterRuntimeTool[];
  messages: TenantChatMessage[];
}

export interface TenantChatSendResult extends TenantChatState {
  selectedTool: string | null;
}

export class TenantChatError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "TenantChatError";
    this.status = status;
  }
}

export async function getTenantChatState(
  membership: StarterMembershipContext,
): Promise<TenantChatState> {
  return await withActiveTenant(membership.tenantId, async (activeTenantId) => {
    const session = await ensureTenantAgentSession(activeTenantId, membership);
    return await readTenantChatState(activeTenantId, membership.profileId, session);
  });
}

export async function sendTenantChatMessage(
  membership: StarterMembershipContext,
  content: string,
): Promise<TenantChatSendResult> {
  const message = normalizeUserMessage(content);
  return await withActiveTenant(membership.tenantId, async (activeTenantId) => {
    const billing = await getBillingOverview(activeTenantId);
    assertAgentChatAvailable(billing);
    let chatThresholds: ReturnType<typeof assertMetricAllowed> = [];
    try {
      chatThresholds = assertMetricAllowed(billing.snapshot.thresholdEvaluations, "chat.messages");
    } catch (error) {
      if (!(error instanceof TenantQuotaError)) {
        throw error;
      }
      throw new TenantChatError(429, "Tenant exceeded the chat messages threshold");
    }
    const chatUsageWindow = getContainedThresholdUsageWindow(chatThresholds);

    const session = await ensureTenantAgentSession(activeTenantId, membership, billing);
    const service = session.service;
    const userMessage = await service.sendAgentUserMessage({
      tenantId: activeTenantId,
      agentSessionId: session.sessionId,
      actorProfileId: membership.profileId,
      content: message,
    });
    await recordTenantUsageSignal({
      tenantId: activeTenantId,
      metricKey: "chat.messages",
      source: "smrt-chat",
      sourceId: "tenant.chat.message",
      ...(chatUsageWindow
        ? {
            usageWindow: chatUsageWindow,
          }
        : {}),
      dimensions: {
        messageLength: message.length,
      },
    });

    const selectedTool = selectToolForMessage(message);
    if (selectedTool) {
      await callToolForChat({
        tenantId: activeTenantId,
        membership,
        service,
        sessionId: session.sessionId,
        toolName: selectedTool,
        message,
        availableTools: session.tools,
        requestId: requireStringId(userMessage?.id, "Persisted user chat message id"),
      });
    }

    return {
      ...(await readTenantChatState(activeTenantId, membership.profileId, session)),
      selectedTool,
    };
  });
}

async function ensureTenantAgentSession(
  tenantId: string,
  membership: StarterMembershipContext,
  billing?: BillingOverview,
) {
  const tenantBilling = billing ?? (await getBillingOverview(tenantId));
  assertAgentChatAvailable(tenantBilling);
  const service = await ChatService.create(getSmrtConfig("ChatRoom"));
  const tools = listRuntimeTools(tenantBilling.snapshot.featureKeys, membership).filter(
    (tool) => tool.name !== "tenant.activity-report.query",
  );
  tools.push(
    ...reportOperationAgentTools.filter(
      (tool) =>
        tenantBilling.snapshot.featureKeys.includes(tool.requiredFeature) &&
        hasStarterPermission(
          membership,
          tool.readOnly ? starterPermissions.usageRead : starterPermissions.reportRefresh,
        ),
    ),
  );
  if (
    tenantBilling.snapshot.featureKeys.includes("mcp.read_tools") &&
    hasStarterPermission(membership, starterPermissions.usageRead)
  ) {
    tools.push(
      ...getTenantActivityReportAgentTools().map((tool) => ({
        name: tool.slug,
        description: tool.aiTool.function.description ?? tool.slug,
        readOnly: true,
        requiredFeature: "mcp.read_tools",
      })),
    );
  }
  const prompt = await resolveStarterPromptPreview(tenantId);
  const { session, room } = await service.createAgentSession({
    tenantId,
    agentId: getStarterAgentId(tenantId),
    actorProfileId: membership.profileId,
    allowedTools: tools.map((tool) => tool.name),
    systemPrompt: prompt.text,
    maxMessages: 100,
  });

  let changed = false;
  const allowedTools = tools.map((tool) => tool.name);
  if (session.getAllowedTools().join("\n") !== allowedTools.join("\n")) {
    session.setAllowedTools(allowedTools);
    changed = true;
  }
  if (session.systemPrompt !== prompt.text) {
    session.systemPrompt = prompt.text;
    changed = true;
  }
  if (changed) {
    await session.save();
  }

  return {
    service,
    sessionId: requireStringId(session.id, "Agent session id"),
    roomId: requireStringId(room.id, "Agent chat room id"),
    tools,
    billing: tenantBilling,
  };
}

function assertAgentChatAvailable(billing: BillingOverview): void {
  if (!billing.snapshot.featureKeys.includes("chat.agent")) {
    throw new TenantChatError(403, "Agent chat is not available for the current tenant");
  }
}

async function readTenantChatState(
  tenantId: string,
  actorProfileId: string,
  session: Awaited<ReturnType<typeof ensureTenantAgentSession>>,
): Promise<TenantChatState> {
  const messages = (
    await session.service.getRoomMessages({
      roomId: session.roomId,
      actorProfileId,
      tenantId,
    })
  )
    .map(toTenantChatMessage)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return {
    tenantId,
    sessionId: session.sessionId,
    roomId: session.roomId,
    tools: session.tools,
    messages,
  };
}

async function callToolForChat(options: {
  tenantId: string;
  membership: StarterMembershipContext;
  service: ChatService;
  sessionId: string;
  toolName: string;
  message: string;
  availableTools: StarterRuntimeTool[];
  requestId: string;
}) {
  const tool = [...runtimeTools, ...options.availableTools].find(
    (candidate) => candidate.name === options.toolName,
  );

  // The agent-runtime bridge gates tool_call replies fail-closed against the
  // session allowlist (which mirrors the tenant's available tools), so a tool
  // the tenant lacks would throw on the send below — before the catch that
  // renders the friendly denial. Short-circuit to that denial here instead.
  if (!options.availableTools.some((candidate) => candidate.name === options.toolName)) {
    await sendAgentReply(options.service, {
      tenantId: options.tenantId,
      agentSessionId: options.sessionId,
      content: renderUnavailableTool(options.availableTools),
      kind: "assistant",
    });
    return;
  }

  const input = await buildToolInput(
    options.toolName,
    options.message,
    options.tenantId,
    options.requestId,
  );
  await sendAgentReply(options.service, {
    tenantId: options.tenantId,
    agentSessionId: options.sessionId,
    content: tool ? `Calling ${tool.name}` : `Calling ${options.toolName}`,
    kind: "assistant",
    messageType: "tool_call",
    toolCallData: {
      name: options.toolName,
      input,
    },
  });

  try {
    const execution = options.toolName.startsWith("reports.operations.")
      ? await executeRuntimeToolWithTenantPolicy(
          options.toolName,
          input,
          options.tenantId,
          async () => ({
            content: [{ type: "text", text: "Report operation handled." }],
            structuredContent: await executeReportOperationAgentTool(
              options.membership,
              options.toolName,
              input,
            ),
          }),
          reportOperationAgentTools,
        )
      : options.toolName === "reports.query"
        ? await executeRuntimeToolWithTenantPolicy(
            "tenant.activity-report.query",
            input,
            options.tenantId,
            async () => ({
              content: [{ type: "text", text: "Tenant activity report loaded." }],
              structuredContent: await executeTenantActivityReportAgentTool(
                options.membership,
                options.toolName,
                input,
              ),
            }),
          )
        : await executeRuntimeToolForTenant(options.toolName, input, options.tenantId);
    await sendAgentReply(options.service, {
      tenantId: options.tenantId,
      agentSessionId: options.sessionId,
      content: execution.response.content.map((item) => item.text).join("\n"),
      kind: "tool",
      messageType: "tool_result",
      toolCallData: {
        name: options.toolName,
        response: execution.response.structuredContent,
      },
    });
    await sendAgentReply(options.service, {
      tenantId: options.tenantId,
      agentSessionId: options.sessionId,
      content: renderAssistantResponse(execution.tool, execution.response.structuredContent),
      kind: "assistant",
    });
  } catch (error) {
    if (!(error instanceof RuntimeToolExecutionError)) {
      throw error;
    }

    await sendAgentReply(options.service, {
      tenantId: options.tenantId,
      agentSessionId: options.sessionId,
      content: renderToolError(error, options.availableTools),
      kind: "assistant",
    });
  }
}

function selectToolForMessage(message: string): string | null {
  const normalized = message.toLowerCase();
  const operationId = /\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/.test(normalized);
  if (/\bcancel report operation\b/.test(normalized) && operationId)
    return "reports.operations.cancel";
  if (/\breport operation status\b/.test(normalized)) return "reports.operations.status";
  if (/\b(prepare report|start approval demo)\b/.test(normalized))
    return "reports.operations.prepare";
  if (/\b(activity|report|usage history)\b/.test(normalized)) return "reports.query";
  if (/\b(usage|meter|threshold|quota|limit|tokens?|calls?)\b/.test(normalized)) {
    return "tenant.usage.summary";
  }
  if (/\b(prompt|language|assistant|system)\b/.test(normalized)) {
    return "tenant.prompt.preview";
  }
  if (/\b(upgrade|downgrade|change plan|switch plan|cancel)\b/.test(normalized)) {
    return "tenant.subscription.update";
  }
  if (/\b(subscription|plan|billing|invoice|payment|portal)\b/.test(normalized)) {
    return "tenant.subscription.summary";
  }
  return "tenant.subscription.summary";
}

async function buildToolInput(
  toolName: string,
  message: string,
  tenantId: string,
  sessionId: string,
): Promise<Record<string, unknown>> {
  if (toolName.startsWith("reports.operations.")) {
    const id = message.match(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/i)?.[0];
    return {
      ...(id ? { id } : {}),
      kind: /approval demo/i.test(message) ? "approval-demo" : "prepare",
      requestId: `chat-${sessionId}-${createHash("sha256").update(message).digest("hex").slice(0, 32)}`,
    };
  }
  if (toolName === "reports.query") return await createTenantActivityReportQueryInput(tenantId);
  if (toolName === "tenant.prompt.preview") {
    return { message, key: "starter.assistant.system" };
  }
  if (toolName === "tenant.subscription.update") {
    return { message, requestedChange: message };
  }
  return { message };
}

function renderAssistantResponse(tool: StarterRuntimeTool, content: unknown): string {
  const structured = isRecord(content) ? content : {};
  if (tool.name.startsWith("reports.operations.")) {
    const operation = isRecord(structured.operation) ? structured.operation : null;
    if (operation)
      return `Report operation ${String(operation.id ?? "")}: ${String(operation.status ?? "unknown")}.`;
    const operations = Array.isArray(structured.operations) ? structured.operations : [];
    return `Found ${operations.length} report operation${operations.length === 1 ? "" : "s"}.`;
  }
  if (tool.name === "tenant.usage.summary") {
    const summaries = Array.isArray(structured.summaries) ? structured.summaries : [];
    if (summaries.length === 0) {
      return "No tenant usage has been recorded in the current window.";
    }
    const lines = summaries.slice(0, 4).map((summary) => {
      const item = isRecord(summary) ? summary : {};
      return `${String(item.metricKey ?? "metric")}: ${String(item.quantity ?? 0)}`;
    });
    return `Current tenant usage:\n${lines.join("\n")}`;
  }

  if (tool.name === "tenant.subscription.summary") {
    const subscription = isRecord(structured.subscription) ? structured.subscription : {};
    const features = Array.isArray(subscription.featureKeys)
      ? subscription.featureKeys.join(", ")
      : "none";
    return `Current plan: ${String(subscription.planName ?? "Unknown")} (${String(
      subscription.status ?? "unknown",
    )}). Enabled features: ${features}.`;
  }

  if (tool.name === "tenant.activity-report.query") {
    const report = isRecord(structured.report) ? structured.report : structured;
    const rows = Array.isArray(report.rows) ? report.rows.length : 0;
    return `Tenant activity report loaded: ${rows} visible rows.`;
  }

  if (tool.name === "tenant.prompt.preview") {
    const prompt = isRecord(structured.prompt) ? structured.prompt : {};
    return `Effective prompt preview:\n${String(prompt.text ?? "")}`;
  }

  if (tool.name === "tenant.subscription.update") {
    const subscription = isRecord(structured.subscription) ? structured.subscription : {};
    return `Plan changes require billing confirmation. Current plan: ${String(
      subscription.planName ?? "Unknown",
    )}. Open Billing to choose a plan or continue in the customer portal.`;
  }

  return "The tool request is prepared and ready for upstream handling.";
}

function renderToolError(error: RuntimeToolExecutionError, availableTools: StarterRuntimeTool[]) {
  if (error.status === 429) {
    return "I cannot call that MCP tool because this tenant has reached the MCP call threshold.";
  }
  return renderUnavailableTool(availableTools);
}

function renderUnavailableTool(availableTools: StarterRuntimeTool[]): string {
  const names = availableTools.map((tool) => tool.name).join(", ");
  return `That MCP tool is not available on the current plan. Available tools: ${names || "none"}.`;
}

function toTenantChatMessage(message: ChatMessage): TenantChatMessage {
  return {
    id: message.id ?? message.slug ?? crypto.randomUUID(),
    role: message.role,
    messageType: message.messageType,
    content: message.content,
    createdAt: toIsoString(message.created_at),
    toolCallData: message.getToolCallData(),
  };
}

function normalizeUserMessage(content: string): string {
  const message = content.trim();
  if (!message) {
    throw new TenantChatError(400, "Message is required");
  }
  return message.slice(0, 4000);
}

function requireStringId(value: string | null | undefined, label: string): string {
  if (!value) {
    throw new TenantChatError(500, `${label} is missing`);
  }
  return value;
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string" && value.length > 0) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getStarterAgentId(tenantId: string): string {
  const bytes = createHash("sha256").update(`${starterAgentIdPrefix}:${tenantId}`).digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20, 32)}`;
}
