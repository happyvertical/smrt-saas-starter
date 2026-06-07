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
  ];

  return {
    RuntimeToolExecutionError,
    messages,
    runtimeTools,
    createChatService: vi.fn(),
    createAgentSession: vi.fn(),
    sendAgentMessage: vi.fn(),
    getByAgentSession: vi.fn(),
    getBillingOverview: vi.fn(),
    resolveStarterPromptPreview: vi.fn(),
    executeRuntimeToolForTenant: vi.fn(),
    listRuntimeTools: vi.fn(),
  };
});

vi.mock("@happyvertical/smrt-chat", () => ({
  ChatService: {
    create: chatMocks.createChatService,
  },
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

vi.mock("$lib/server/tenant-context", () => ({
  withActiveTenant: async (
    tenantId: string | null | undefined,
    callback: (activeTenantId: string) => Promise<unknown>,
  ) => callback(tenantId ?? "11111111-1111-4111-8111-111111111111"),
}));

import { getTenantChatState, sendTenantChatMessage, TenantChatError } from "$lib/server/agent-chat";

const tenantId = "11111111-1111-4111-8111-111111111111";

describe("tenant agent chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatMocks.messages.splice(0, chatMocks.messages.length);
    chatMocks.getBillingOverview.mockResolvedValue({
      snapshot: {
        featureKeys: ["chat.agent", "mcp.read_tools"],
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
    chatMocks.getByAgentSession.mockImplementation(async () => chatMocks.messages);
    chatMocks.sendAgentMessage.mockImplementation(async (message) => {
      chatMocks.messages.push({
        id: `msg-${chatMocks.messages.length + 1}`,
        slug: null,
        role: message.role ?? "assistant",
        messageType: message.messageType ?? "text",
        content: message.content,
        created_at: new Date(`2026-06-07T00:00:0${chatMocks.messages.length}.000Z`),
        getToolCallData: () => message.toolCallData ?? null,
      });
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
      messages: {
        getByAgentSession: chatMocks.getByAgentSession,
      },
      sendAgentMessage: chatMocks.sendAgentMessage,
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
      agentId: `smrt-saas-starter-agent:${tenantId}`,
      participantProfileId: "00000000-0000-4000-8000-000000000011",
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

  it("blocks tenants without the chat agent feature", async () => {
    chatMocks.getBillingOverview.mockResolvedValueOnce({
      snapshot: {
        featureKeys: ["mcp.read_tools"],
      },
    });

    await expect(getTenantChatState(tenantId)).rejects.toBeInstanceOf(TenantChatError);
  });
});
