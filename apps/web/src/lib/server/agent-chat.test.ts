import { beforeEach, describe, expect, it, vi } from "vitest";

const chatMocks = vi.hoisted(() => {
  class RuntimeToolExecutionError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
      super(message);
      this.name = "RuntimeToolExecutionError";
      this.status = status;
    }
  }

  const messages: Array<{
    id: string;
    slug: string | null;
    role: "user" | "assistant" | "system" | "tool";
    messageType: "text" | "system" | "action" | "file" | "tool_call" | "tool_result";
    content: string;
    created_at: Date;
    getToolCallData: () => Record<string, unknown> | null;
  }> = [];

  const runtimeTools = [
    {
      name: "tenant.usage.summary",
      description: "Usage",
      readOnly: true,
      requiredFeature: "mcp.read_tools",
    },
    {
      name: "tenant.subscription.summary",
      description: "Subscription",
      readOnly: true,
      requiredFeature: "mcp.read_tools",
    },
    {
      name: "tenant.prompt.preview",
      description: "Prompt",
      readOnly: true,
      requiredFeature: "prompts.tenant_overrides",
    },
    {
      name: "tenant.subscription.update",
      description: "Subscription update",
      readOnly: false,
      requiredFeature: "mcp.write_tools",
    },
  ];

  return {
    RuntimeToolExecutionError,
    messages,
    runtimeTools,
    createChatService: vi.fn(),
    createAgentSession: vi.fn(),
    sendAgentUserMessage: vi.fn(),
    sendAgentReply: vi.fn(),
    getRoomMessages: vi.fn(),
    getBillingOverview: vi.fn(),
    resolveStarterPromptPreview: vi.fn(),
    executeRuntimeToolForTenant: vi.fn(),
    listRuntimeTools: vi.fn(),
    recordTenantUsageSignal: vi.fn(),
  };
});

vi.mock("@happyvertical/smrt-chat", () => ({
  ChatService: {
    create: chatMocks.createChatService,
  },
}));

vi.mock("@happyvertical/smrt-chat/internal/agent-runtime", () => ({
  sendAgentReply: chatMocks.sendAgentReply,
}));

vi.mock("$lib/server/subscriptions", () => ({
  getBillingOverview: chatMocks.getBillingOverview,
}));

vi.mock("$lib/server/experience", () => ({
  resolveStarterPromptPreview: chatMocks.resolveStarterPromptPreview,
}));

vi.mock("$lib/server/mcp", () => ({
  RuntimeToolExecutionError: chatMocks.RuntimeToolExecutionError,
  runtimeTools: chatMocks.runtimeTools,
  listRuntimeTools: chatMocks.listRuntimeTools,
  executeRuntimeToolForTenant: chatMocks.executeRuntimeToolForTenant,
}));

vi.mock("$lib/server/smrt", () => ({
  getSmrtConfig: () => ({}),
}));

vi.mock("$lib/server/usage", () => ({
  recordTenantUsageSignal: chatMocks.recordTenantUsageSignal,
}));

vi.mock("$lib/server/tenant-context", () => ({
  withActiveTenant: async (
    tenantId: string | null | undefined,
    callback: (activeTenantId: string) => Promise<unknown>,
  ) => callback(tenantId ?? "11111111-1111-4111-8111-111111111111"),
}));

import { getTenantChatState, sendTenantChatMessage, TenantChatError } from "$lib/server/agent-chat";

const tenantId = "11111111-1111-4111-8111-111111111111";
const windowStart = new Date("2026-06-01T00:00:00.000Z");
const windowEnd = new Date("2026-07-01T00:00:00.000Z");
const dailyWindowStart = new Date("2026-06-08T00:00:00.000Z");
const dailyWindowEnd = new Date("2026-06-09T00:00:00.000Z");

describe("tenant agent chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatMocks.messages.splice(0, chatMocks.messages.length);
    chatMocks.getBillingOverview.mockResolvedValue({
      snapshot: {
        featureKeys: ["chat.agent", "mcp.read_tools"],
        thresholdEvaluations: [chatMessagesThreshold({ allowed: true })],
      },
    });
    chatMocks.listRuntimeTools.mockReturnValue(chatMocks.runtimeTools.slice(0, 2));
    chatMocks.resolveStarterPromptPreview.mockResolvedValue({ text: "Tenant assistant prompt" });
    chatMocks.executeRuntimeToolForTenant.mockResolvedValue({
      tool: chatMocks.runtimeTools[0],
      response: {
        content: [{ type: "text", text: "Usage summary loaded." }],
        structuredContent: {
          summaries: [{ metricKey: "mcp.calls", quantity: 2 }],
        },
      },
    });
    const pushMessage = (
      role: "user" | "assistant" | "system" | "tool",
      messageType: "text" | "system" | "action" | "file" | "tool_call" | "tool_result",
      content: string,
      toolCallData: Record<string, unknown> | null,
    ) => {
      chatMocks.messages.push({
        id: `msg-${chatMocks.messages.length + 1}`,
        slug: null,
        role,
        messageType,
        content,
        created_at: new Date(`2026-06-07T00:00:0${chatMocks.messages.length}.000Z`),
        getToolCallData: () => toolCallData,
      });
    };
    chatMocks.getRoomMessages.mockImplementation(async () => chatMocks.messages);
    chatMocks.sendAgentUserMessage.mockImplementation(async (message) => {
      pushMessage("user", message.messageType ?? "text", message.content, null);
    });
    // Module-level agent-runtime bridge: author assistant/tool messages as the
    // session agent (kind 'tool' -> role 'tool', otherwise 'assistant').
    chatMocks.sendAgentReply.mockImplementation(async (_service, reply) => {
      pushMessage(
        reply.kind === "tool" ? "tool" : "assistant",
        reply.messageType ?? "text",
        reply.content,
        reply.toolCallData ?? null,
      );
    });
    chatMocks.createAgentSession.mockResolvedValue({
      session: {
        id: "33333333-3333-4333-8333-333333333333",
        systemPrompt: "Tenant assistant prompt",
        getAllowedTools: () => chatMocks.runtimeTools.slice(0, 2).map((tool) => tool.name),
        setAllowedTools: vi.fn(),
        save: vi.fn(),
      },
      room: {
        id: "44444444-4444-4444-8444-444444444444",
      },
    });
    chatMocks.createChatService.mockResolvedValue({
      createAgentSession: chatMocks.createAgentSession,
      sendAgentUserMessage: chatMocks.sendAgentUserMessage,
      getRoomMessages: chatMocks.getRoomMessages,
    });
  });

  it("creates a tenant-scoped chat session with the available MCP tool allowlist", async () => {
    await expect(getTenantChatState(tenantId)).resolves.toMatchObject({
      tenantId,
      sessionId: "33333333-3333-4333-8333-333333333333",
      roomId: "44444444-4444-4444-8444-444444444444",
      tools: chatMocks.runtimeTools.slice(0, 2),
      messages: [],
    });

    expect(chatMocks.listRuntimeTools).toHaveBeenCalledWith(["chat.agent", "mcp.read_tools"]);
    expect(chatMocks.createAgentSession).toHaveBeenCalledWith({
      tenantId,
      agentId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
      actorProfileId: "00000000-0000-4000-8000-000000000011",
      allowedTools: ["tenant.usage.summary", "tenant.subscription.summary"],
      systemPrompt: "Tenant assistant prompt",
      maxMessages: 100,
    });
  });

  it("routes usage questions through the usage MCP tool and records the tool exchange", async () => {
    await expect(sendTenantChatMessage(tenantId, "show usage this month")).resolves.toMatchObject({
      selectedTool: "tenant.usage.summary",
      messages: [
        { role: "user", messageType: "text", content: "show usage this month" },
        { role: "assistant", messageType: "tool_call", content: "Calling tenant.usage.summary" },
        { role: "tool", messageType: "tool_result", content: "Usage summary loaded." },
        { role: "assistant", messageType: "text", content: "Current tenant usage:\nmcp.calls: 2" },
      ],
    });

    expect(chatMocks.executeRuntimeToolForTenant).toHaveBeenCalledWith(
      "tenant.usage.summary",
      { message: "show usage this month" },
      tenantId,
    );
    expect(chatMocks.recordTenantUsageSignal).toHaveBeenCalledWith({
      tenantId,
      metricKey: "chat.messages",
      source: "smrt-chat",
      sourceId: "tenant.chat.message",
      usageWindow: { start: windowStart, end: windowEnd },
      dimensions: {
        messageLength: "show usage this month".length,
      },
    });
  });

  it("records chat usage against the contained matching threshold window", async () => {
    chatMocks.getBillingOverview.mockResolvedValue({
      snapshot: {
        featureKeys: ["chat.agent", "mcp.read_tools"],
        thresholdEvaluations: [
          chatMessagesThreshold({ allowed: true }),
          chatMessagesThreshold({
            allowed: true,
            windowStart: dailyWindowStart,
            windowEnd: dailyWindowEnd,
          }),
        ],
      },
    });

    await sendTenantChatMessage(tenantId, "hello");

    expect(chatMocks.recordTenantUsageSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        metricKey: "chat.messages",
        usageWindow: { start: dailyWindowStart, end: dailyWindowEnd },
      }),
    );
  });

  it("returns an assistant message when the selected MCP tool is denied", async () => {
    chatMocks.executeRuntimeToolForTenant.mockRejectedValueOnce(
      new chatMocks.RuntimeToolExecutionError(403, "denied"),
    );

    const result = await sendTenantChatMessage(tenantId, "preview the prompt");

    expect(result.selectedTool).toBe("tenant.prompt.preview");
    expect(result.messages.at(-1)).toMatchObject({
      role: "assistant",
      content:
        "That MCP tool is not available on the current plan. Available tools: tenant.usage.summary, tenant.subscription.summary.",
    });
  });

  it("routes plan change requests through a confirmation-only subscription tool", async () => {
    chatMocks.listRuntimeTools.mockReturnValue([
      chatMocks.runtimeTools[0],
      chatMocks.runtimeTools[1],
      chatMocks.runtimeTools[3],
    ]);
    chatMocks.executeRuntimeToolForTenant.mockResolvedValueOnce({
      tool: chatMocks.runtimeTools[3],
      response: {
        content: [{ type: "text", text: "Subscription change requires checkout confirmation." }],
        structuredContent: {
          action: "requires_confirmation",
          subscription: {
            planName: "Growth",
          },
        },
      },
    });

    const result = await sendTenantChatMessage(tenantId, "upgrade my plan");

    expect(result.selectedTool).toBe("tenant.subscription.update");
    expect(result.messages.at(-1)).toMatchObject({
      role: "assistant",
      content:
        "Plan changes require billing confirmation. Current plan: Growth. Open Billing to choose a plan or continue in the customer portal.",
    });
    expect(chatMocks.executeRuntimeToolForTenant).toHaveBeenCalledWith(
      "tenant.subscription.update",
      {
        message: "upgrade my plan",
        requestedChange: "upgrade my plan",
      },
      tenantId,
    );
  });

  it("blocks tenants without the chat agent feature", async () => {
    chatMocks.getBillingOverview.mockResolvedValueOnce({
      snapshot: {
        featureKeys: ["mcp.read_tools"],
        thresholdEvaluations: [],
      },
    });

    await expect(getTenantChatState(tenantId)).rejects.toBeInstanceOf(TenantChatError);
    expect(chatMocks.createChatService).not.toHaveBeenCalled();
  });

  it("blocks chat sends when the tenant chat threshold denies the request", async () => {
    chatMocks.getBillingOverview.mockResolvedValueOnce({
      snapshot: {
        featureKeys: ["chat.agent", "mcp.read_tools"],
        thresholdEvaluations: [chatMessagesThreshold({ allowed: false })],
      },
    });

    await expect(sendTenantChatMessage(tenantId, "hello")).rejects.toMatchObject({
      status: 429,
      message: "Tenant exceeded the chat messages threshold",
    });
    expect(chatMocks.sendAgentUserMessage).not.toHaveBeenCalled();
    expect(chatMocks.sendAgentReply).not.toHaveBeenCalled();
    expect(chatMocks.createChatService).not.toHaveBeenCalled();
    expect(chatMocks.createAgentSession).not.toHaveBeenCalled();
    expect(chatMocks.recordTenantUsageSignal).not.toHaveBeenCalled();
  });
});

function chatMessagesThreshold({
  allowed,
  windowStart: start = windowStart,
  windowEnd: end = windowEnd,
}: {
  allowed: boolean;
  windowStart?: Date;
  windowEnd?: Date;
}) {
  return {
    threshold: {
      metricKey: "chat.messages",
      limit: 1000,
      window: "month",
      enforcement: "block",
      label: "Chat messages",
    },
    usage: {
      tenantId,
      metricKey: "chat.messages",
      quantity: allowed ? 999 : 1000,
      windowStart: start,
      windowEnd: end,
    },
    ratio: allowed ? 0.999 : 1,
    remaining: allowed ? 1 : 0,
    state: allowed ? "ok" : "blocked",
    allowed,
  };
}
