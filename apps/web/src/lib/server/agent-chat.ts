import { createHash } from "node:crypto";
import { type ChatMessage, ChatService } from "@happyvertical/smrt-chat";
import { resolveStarterPromptPreview } from "$lib/server/experience";
import {
  executeRuntimeToolForTenant,
  listRuntimeTools,
  RuntimeToolExecutionError,
  runtimeTools,
  type RuntimeTool as StarterRuntimeTool,
} from "$lib/server/mcp";
import { getSmrtConfig } from "$lib/server/smrt";
import { getActiveTenantId, starterData } from "$lib/server/starter-data";
import { getBillingOverview } from "$lib/server/subscriptions";
import { withActiveTenant } from "$lib/server/tenant-context";
import { assertMetricAllowed, TenantQuotaError } from "$lib/server/thresholds";
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
  tenantId: string | null | undefined,
): Promise<TenantChatState> {
  return await withActiveTenant(tenantId, async (activeTenantId) => {
    const session = await ensureTenantAgentSession(activeTenantId);
    return await readTenantChatState(activeTenantId, session);
  });
}

export async function sendTenantChatMessage(
  tenantId: string | null | undefined,
  content: string,
): Promise<TenantChatSendResult> {
  const message = normalizeUserMessage(content);
  return await withActiveTenant(tenantId, async (activeTenantId) => {
    const session = await ensureTenantAgentSession(activeTenantId);
    let chatThreshold: ReturnType<typeof assertMetricAllowed> = null;
    try {
      chatThreshold = assertMetricAllowed(
        session.billing.snapshot.thresholdEvaluations,
        "chat.messages",
      );
    } catch (error) {
      if (!(error instanceof TenantQuotaError)) {
        throw error;
      }
      throw new TenantChatError(429, "Tenant exceeded the chat messages threshold");
    }

    const service = session.service;
    await service.sendAgentMessage({
      tenantId: activeTenantId,
      agentSessionId: session.sessionId,
      senderProfileId: starterData.demoTenant.ownerUser.id,
      content: message,
      role: "user",
    });
    await recordTenantUsageSignal({
      tenantId: activeTenantId,
      metricKey: "chat.messages",
      source: "smrt-chat",
      sourceId: "tenant.chat.message",
      ...(chatThreshold ? { window: chatThreshold.threshold.window } : {}),
      dimensions: {
        messageLength: message.length,
      },
    });

    const selectedTool = selectToolForMessage(message);
    if (selectedTool) {
      await callToolForChat({
        tenantId: activeTenantId,
        service,
        sessionId: session.sessionId,
        toolName: selectedTool,
        message,
        availableTools: session.tools,
      });
    }

    return {
      ...(await readTenantChatState(activeTenantId, session)),
      selectedTool,
    };
  });
}

async function ensureTenantAgentSession(tenantId: string) {
  const billing = await getBillingOverview(tenantId);
  if (!billing.snapshot.featureKeys.includes("chat.agent")) {
    throw new TenantChatError(403, "Agent chat is not available for the current tenant");
  }

  const service = await ChatService.create(getSmrtConfig("ChatRoom"));
  const tools = listRuntimeTools(billing.snapshot.featureKeys);
  const prompt = await resolveStarterPromptPreview(tenantId);
  const { session, room } = await service.createAgentSession({
    tenantId,
    agentId: getStarterAgentId(tenantId),
    participantProfileId: starterData.demoTenant.ownerUser.id,
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
    billing,
  };
}

async function readTenantChatState(
  tenantId: string,
  session: Awaited<ReturnType<typeof ensureTenantAgentSession>>,
): Promise<TenantChatState> {
  const messages = (await session.service.messages.getByAgentSession(session.sessionId))
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
  service: ChatService;
  sessionId: string;
  toolName: string;
  message: string;
  availableTools: StarterRuntimeTool[];
}) {
  const tool = runtimeTools.find((candidate) => candidate.name === options.toolName);
  await options.service.sendAgentMessage({
    tenantId: options.tenantId,
    agentSessionId: options.sessionId,
    senderProfileId: getStarterAgentId(options.tenantId),
    content: tool ? `Calling ${tool.name}` : `Calling ${options.toolName}`,
    role: "assistant",
    messageType: "tool_call",
    toolCallData: {
      name: options.toolName,
      input: buildToolInput(options.toolName, options.message),
    },
  });

  try {
    const execution = await executeRuntimeToolForTenant(
      options.toolName,
      buildToolInput(options.toolName, options.message),
      options.tenantId,
    );
    await options.service.sendAgentMessage({
      tenantId: options.tenantId,
      agentSessionId: options.sessionId,
      senderProfileId: getStarterAgentId(options.tenantId),
      content: execution.response.content.map((item) => item.text).join("\n"),
      role: "tool",
      messageType: "tool_result",
      toolCallData: {
        name: options.toolName,
        response: execution.response.structuredContent,
      },
    });
    await options.service.sendAgentMessage({
      tenantId: options.tenantId,
      agentSessionId: options.sessionId,
      senderProfileId: getStarterAgentId(options.tenantId),
      content: renderAssistantResponse(execution.tool, execution.response.structuredContent),
      role: "assistant",
    });
  } catch (error) {
    if (!(error instanceof RuntimeToolExecutionError)) {
      throw error;
    }

    await options.service.sendAgentMessage({
      tenantId: options.tenantId,
      agentSessionId: options.sessionId,
      senderProfileId: getStarterAgentId(options.tenantId),
      content: renderToolError(error, options.availableTools),
      role: "assistant",
    });
  }
}

function selectToolForMessage(message: string): string | null {
  const normalized = message.toLowerCase();
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

function buildToolInput(toolName: string, message: string): Record<string, unknown> {
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

export function resolveChatTenantId(tenantId: string | null | undefined): string {
  return getActiveTenantId(tenantId);
}
