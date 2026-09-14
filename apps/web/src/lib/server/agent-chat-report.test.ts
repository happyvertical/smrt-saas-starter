import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const messages: Array<{
    id: string;
    slug: string | null;
    role: "user" | "assistant" | "system" | "tool";
    messageType: "text" | "system" | "action" | "file" | "tool_call" | "tool_result";
    content: string;
    created_at: Date;
    getToolCallData: () => Record<string, unknown> | null;
  }> = [];
  const allowlist = { tools: [] as string[] };

  return {
    messages,
    allowlist,
    createChatService: vi.fn(),
    createAgentSession: vi.fn(),
    sendAgentUserMessage: vi.fn(),
    sendAgentReply: vi.fn(),
    getRoomMessages: vi.fn(),
    getBillingOverview: vi.fn(),
    resolveStarterPromptPreview: vi.fn(),
    recordTenantUsageSignal: vi.fn(),
    createTenantActivityReportQueryInput: vi.fn(),
    executeTenantActivityReportAgentTool: vi.fn(),
    getTenantActivityReportAgentTools: vi.fn(),
  };
});

vi.mock("@happyvertical/smrt-chat", () => ({
  ChatService: { create: mocks.createChatService },
}));
vi.mock("@happyvertical/smrt-chat/internal/agent-runtime", () => ({
  sendAgentReply: mocks.sendAgentReply,
}));
vi.mock("$lib/server/subscriptions", () => ({
  getBillingOverview: mocks.getBillingOverview,
}));
vi.mock("$lib/server/experience", () => ({
  resolveStarterPromptPreview: mocks.resolveStarterPromptPreview,
}));
vi.mock("$lib/server/usage", () => ({
  recordTenantUsageSignal: mocks.recordTenantUsageSignal,
}));
vi.mock("$lib/server/agent-report-read", () => ({
  createTenantActivityReportQueryInput: mocks.createTenantActivityReportQueryInput,
  executeTenantActivityReportAgentTool: mocks.executeTenantActivityReportAgentTool,
  getTenantActivityReportAgentTools: mocks.getTenantActivityReportAgentTools,
}));
vi.mock("$lib/server/authz", () => ({
  hasStarterPermission: (membership: { permissions: string[] }, permission: string) =>
    membership.permissions.includes(permission),
  starterPermissions: { usageRead: "tenant.usage.read" },
  requiredRuntimeToolPermission: () => "tenant.mcp.call",
}));
vi.mock("$lib/server/smrt", () => ({ getSmrtConfig: () => ({}) }));
vi.mock("$lib/server/tenant-context", () => ({
  withActiveTenant: async (
    activeTenantId: string | null | undefined,
    callback: (activeTenantId: string) => Promise<unknown>,
  ) => callback(activeTenantId ?? tenantId),
}));

import { sendTenantChatMessage } from "$lib/server/agent-chat";
import * as mcp from "$lib/server/mcp";

const tenantId = "11111111-1111-4111-8111-111111111111";
const membership = {
  tenantId,
  profileId: "22222222-2222-4222-8222-222222222222",
  userId: "33333333-3333-4333-8333-333333333333",
  permissions: ["tenant.usage.read", "tenant.mcp.call", "tenant.chat.use"],
} as never;
const windowStart = new Date("2026-06-01T00:00:00.000Z");
const windowEnd = new Date("2026-07-01T00:00:00.000Z");

describe("tenant agent chat report queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.messages.splice(0, mocks.messages.length);
    mocks.getBillingOverview.mockResolvedValue(overview(["chat.agent", "mcp.read_tools"]));
    mocks.resolveStarterPromptPreview.mockResolvedValue({ text: "Tenant assistant prompt" });
    mocks.createTenantActivityReportQueryInput.mockResolvedValue({
      reportId: "tenant-activity",
      request: { version: 1, requestId: "server-owned" },
      execution: "silent",
    });
    mocks.getTenantActivityReportAgentTools.mockReturnValue([
      { slug: "reports.query", aiTool: { function: { description: "Query tenant activity" } } },
    ]);
    mocks.executeTenantActivityReportAgentTool.mockResolvedValue({
      report: { rows: [{ id: "row-1" }, { id: "row-2" }] },
    });

    const pushMessage = (
      role: "user" | "assistant" | "system" | "tool",
      messageType: "text" | "system" | "action" | "file" | "tool_call" | "tool_result",
      content: string,
      toolCallData: Record<string, unknown> | null,
    ) => {
      mocks.messages.push({
        id: `msg-${mocks.messages.length + 1}`,
        slug: null,
        role,
        messageType,
        content,
        created_at: new Date(`2026-06-07T00:00:0${mocks.messages.length}.000Z`),
        getToolCallData: () => toolCallData,
      });
    };
    mocks.getRoomMessages.mockImplementation(async () => mocks.messages);
    mocks.sendAgentUserMessage.mockImplementation(async (message) => {
      pushMessage("user", message.messageType ?? "text", message.content, null);
    });
    mocks.sendAgentReply.mockImplementation(async (_service, reply) => {
      const toolName = (reply.toolCallData as { name?: string } | undefined)?.name;
      if (
        (reply.messageType === "tool_call" || reply.kind === "tool") &&
        !mocks.allowlist.tools.includes(toolName ?? "")
      ) {
        throw new Error(`Tool '${toolName}' is not allowed for this agent session`);
      }
      pushMessage(
        reply.kind === "tool" ? "tool" : "assistant",
        reply.messageType ?? "text",
        reply.content,
        reply.toolCallData ?? null,
      );
    });
    mocks.createAgentSession.mockImplementation(async (params) => {
      mocks.allowlist.tools = params.allowedTools ?? [];
      return {
        session: {
          id: "44444444-4444-4444-8444-444444444444",
          systemPrompt: "Tenant assistant prompt",
          getAllowedTools: () => mocks.allowlist.tools,
          setAllowedTools: vi.fn(),
          save: vi.fn(),
        },
        room: { id: "55555555-5555-4555-8555-555555555555" },
      };
    });
    mocks.createChatService.mockResolvedValue({
      createAgentSession: mocks.createAgentSession,
      sendAgentUserMessage: mocks.sendAgentUserMessage,
      getRoomMessages: mocks.getRoomMessages,
    });
  });

  it("runs the principal-bound report query through the live tenant policy and summarizes exact visible rows", async () => {
    const tenantOnlyExecutor = vi.spyOn(mcp, "executeRuntimeToolForTenant");

    await expect(
      sendTenantChatMessage(membership, "show my activity report"),
    ).resolves.toMatchObject({
      selectedTool: "reports.query",
      messages: [
        { role: "user", content: "show my activity report" },
        { role: "assistant", messageType: "tool_call", content: "Calling reports.query" },
        { role: "tool", messageType: "tool_result", content: "Tenant activity report loaded." },
        { role: "assistant", content: "Tenant activity report loaded: 2 visible rows." },
      ],
    });
    expect(mocks.createAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedTools: expect.arrayContaining(["reports.query"]),
      }),
    );

    expect(mocks.createTenantActivityReportQueryInput).toHaveBeenCalledWith(tenantId);
    expect(mocks.executeTenantActivityReportAgentTool).toHaveBeenCalledWith(
      membership,
      "reports.query",
      {
        reportId: "tenant-activity",
        request: { version: 1, requestId: "server-owned" },
        execution: "silent",
      },
    );
    expect(tenantOnlyExecutor).not.toHaveBeenCalled();
    expect(mocks.recordTenantUsageSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        metricKey: "mcp.calls",
        sourceId: "tenant.activity-report.query",
        dimensions: { toolName: "tenant.activity-report.query", readOnly: true },
      }),
    );
  });

  it("rechecks the report feature at execution and does not invoke the principal query or record MCP usage after feature loss", async () => {
    mocks.getBillingOverview
      .mockResolvedValueOnce(overview(["chat.agent", "mcp.read_tools"]))
      .mockResolvedValueOnce(overview(["chat.agent"]));

    const result = await sendTenantChatMessage(membership, "show my activity report");

    expect(result.messages.at(-1)).toMatchObject({
      role: "assistant",
      content:
        "That MCP tool is not available on the current plan. Available tools: tenant.usage.summary, tenant.subscription.summary, reports.query.",
    });
    expect(mocks.executeTenantActivityReportAgentTool).not.toHaveBeenCalled();
    expect(mocks.recordTenantUsageSignal).not.toHaveBeenCalledWith(
      expect.objectContaining({ metricKey: "mcp.calls" }),
    );
  });

  it("denies the MCP quota before the principal report query and does not record MCP usage", async () => {
    mocks.getBillingOverview
      .mockResolvedValueOnce(overview(["chat.agent", "mcp.read_tools"]))
      .mockResolvedValueOnce(overview(["chat.agent", "mcp.read_tools"], false));

    const result = await sendTenantChatMessage(membership, "show my activity report");

    expect(result.messages.at(-1)).toMatchObject({
      role: "assistant",
      content:
        "I cannot call that MCP tool because this tenant has reached the MCP call threshold.",
    });
    expect(mocks.executeTenantActivityReportAgentTool).not.toHaveBeenCalled();
    expect(mocks.recordTenantUsageSignal).not.toHaveBeenCalledWith(
      expect.objectContaining({ metricKey: "mcp.calls" }),
    );
  });
});

function overview(featureKeys: string[], mcpAllowed = true) {
  return {
    tenantId,
    currentPlan: { id: "plan-id", planKey: "growth", name: "Growth" },
    periodEnd: "2026-07-01T00:00:00.000Z",
    billingPortalAvailable: true,
    snapshot: {
      status: "active",
      featureKeys,
      thresholdEvaluations: [
        {
          threshold: {
            metricKey: "chat.messages",
            label: "Chat messages",
            enforcement: "block",
            limit: 1000,
            window: "month",
          },
          usage: { tenantId, metricKey: "chat.messages", quantity: 1, windowStart, windowEnd },
          remaining: 999,
          ratio: 0.001,
          state: "ok",
          allowed: true,
        },
        {
          threshold: {
            metricKey: "mcp.calls",
            label: "MCP calls",
            enforcement: "block",
            limit: 10,
            window: "month",
          },
          usage: {
            tenantId,
            metricKey: "mcp.calls",
            quantity: mcpAllowed ? 9 : 10,
            windowStart,
            windowEnd,
          },
          remaining: mcpAllowed ? 1 : 0,
          ratio: mcpAllowed ? 0.9 : 1,
          state: mcpAllowed ? "ok" : "blocked",
          allowed: mcpAllowed,
        },
      ],
    },
  };
}
