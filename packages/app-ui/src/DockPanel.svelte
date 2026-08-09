<script lang="ts">
  import type { ToolsDockApi, ToolsDockContext } from "@happyvertical/smrt-svelte/workspace/legacy";
  import { RefreshCw, SendHorizontal } from "lucide-svelte";

  interface Props {
    context: ToolsDockContext | null;
    dock: ToolsDockApi;
  }

  interface RuntimeTool {
    name: string;
    description: string;
    readOnly: boolean;
    requiredFeature: string;
  }

  interface TenantChatMessage {
    id: string;
    role: "user" | "assistant" | "system" | "tool";
    messageType: "text" | "system" | "action" | "file" | "tool_call" | "tool_result";
    content: string;
    createdAt: string;
  }

  interface TenantChatState {
    tenantId: string;
    sessionId: string;
    tools: RuntimeTool[];
    messages: TenantChatMessage[];
  }

  const { context, dock }: Props = $props();
  const activeTool = $derived(dock.activeTool ?? "chat");
  const tenantId = $derived(String(context?.data?.tenantId ?? "current tenant"));
  const chatEndpoint = $derived(String(context?.data?.chatEndpoint ?? "/api/chat"));

  let chat = $state<TenantChatState | null>(null);
  let draft = $state("");
  let loading = $state(false);
  let sending = $state(false);
  let errorMessage = $state("");
  let loadedContextKey = $state("");

  $effect(() => {
    const contextKey = `${chatEndpoint}::${tenantId}`;
    if (activeTool === "chat" && loadedContextKey !== contextKey) {
      loadedContextKey = contextKey;
      void loadChat();
    }
  });

  async function loadChat() {
    loading = true;
    errorMessage = "";
    try {
      const response = await fetch(chatEndpoint);
      if (!response.ok) {
        throw new Error(await readResponseMessage(response));
      }
      chat = (await response.json()) as TenantChatState;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Unable to load chat.";
    } finally {
      loading = false;
    }
  }

  async function sendMessage(event: SubmitEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sending) {
      return;
    }

    sending = true;
    errorMessage = "";
    draft = "";
    try {
      const response = await fetch(chatEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!response.ok) {
        throw new Error(await readResponseMessage(response));
      }
      chat = (await response.json()) as TenantChatState;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Unable to send message.";
      draft = message;
    } finally {
      sending = false;
    }
  }

  async function readResponseMessage(response: Response): Promise<string> {
    const text = await response.text();
    if (!text) {
      return response.statusText || "Request failed.";
    }
    try {
      const payload = JSON.parse(text) as { message?: unknown };
      return typeof payload.message === "string" ? payload.message : text;
    } catch {
      return text;
    }
  }

  function labelForMessage(message: TenantChatMessage): string {
    if (message.messageType === "tool_call") {
      return "Tool call";
    }
    if (message.messageType === "tool_result") {
      return "Tool result";
    }
    if (message.role === "user") {
      return "You";
    }
    if (message.role === "tool") {
      return "Tool";
    }
    return "Assistant";
  }
</script>

<section class="dock-panel">
  {#if activeTool === "chat"}
    <header class="panel-header">
      <div>
        <p>Assistant</p>
        <h2>Tenant MCP chat</h2>
      </div>
      <button type="button" class="icon-button" aria-label="Refresh chat" onclick={loadChat}>
        <RefreshCw size={16} />
      </button>
    </header>

    <div class="tenant-line">
      <span>Tenant</span>
      <strong>{tenantId}</strong>
    </div>

    {#if chat?.tools.length}
      <div class="tool-list" aria-label="Available MCP tools">
        {#each chat.tools as tool (tool.name)}
          <span title={tool.description}>{tool.name}</span>
        {/each}
      </div>
    {:else}
      <p class="muted">No MCP tools are available on the current plan.</p>
    {/if}

    {#if errorMessage}
      <p class="notice">{errorMessage}</p>
    {/if}

    <div class="messages" aria-live="polite">
      {#if loading && !chat}
        <p class="muted">Loading tenant chat.</p>
      {:else if chat?.messages.length}
        {#each chat.messages as message (message.id)}
          <article class:from-user={message.role === "user"} data-type={message.messageType}>
            <span>{labelForMessage(message)}</span>
            <p>{message.content}</p>
          </article>
        {/each}
      {:else}
        <article>
          <span>Assistant</span>
          <p>Ask about the current plan, usage thresholds, prompt setup, or MCP tools.</p>
        </article>
      {/if}
    </div>

    <form class="composer" onsubmit={sendMessage}>
      <label>
        <span>Message</span>
        <textarea
          bind:value={draft}
          rows="3"
          placeholder="Ask about usage, billing, or MCP tools"
          disabled={sending}
        ></textarea>
      </label>
      <button type="submit" disabled={sending || draft.trim().length === 0}>
        <SendHorizontal size={16} />
        <span>{sending ? "Sending" : "Send"}</span>
      </button>
    </form>
  {:else if activeTool === "usage"}
    <header class="panel-header">
      <div>
        <p>Usage</p>
        <h2>Meter context</h2>
      </div>
    </header>
    <p class="muted">Usage meters are fed by tenant-aware SMRT metrics and AI usage records.</p>
  {:else}
    <header class="panel-header">
      <div>
        <p>Settings</p>
        <h2>Access context</h2>
      </div>
    </header>
    <p class="muted">Dock tools follow tenant permissions, subscription features, and thresholds.</p>
  {/if}
</section>

<style>
  .dock-panel {
    display: grid;
    grid-template-rows: auto auto auto auto minmax(0, 1fr) auto;
    gap: 0.9rem;
    height: 100%;
    min-height: 0;
    padding: 1rem;
    color: var(--smrt-color-on-surface, #1d2430);
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .panel-header p,
  .panel-header h2,
  .tenant-line span,
  .tenant-line strong,
  .messages p,
  .muted,
  .notice {
    margin: 0;
  }

  .panel-header p,
  .tenant-line span,
  .messages article > span,
  .muted {
    color: var(--smrt-color-on-surface-variant, #5e6470);
  }

  .panel-header h2 {
    font-size: 1rem;
    letter-spacing: 0;
  }

  .icon-button {
    display: inline-grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border: 1px solid var(--smrt-color-outline, #d7dce2);
    border-radius: 6px;
    background: var(--smrt-color-surface, #fff);
    color: inherit;
    cursor: pointer;
  }

  .tenant-line {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
  }

  .tenant-line span,
  .messages article > span,
  label span {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
  }

  .tenant-line strong {
    overflow-wrap: anywhere;
    font-size: 0.86rem;
  }

  .tool-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .tool-list span {
    border: 1px solid var(--smrt-color-outline, #d7dce2);
    border-radius: 999px;
    padding: 0.25rem 0.45rem;
    font-size: 0.72rem;
    line-height: 1.2;
    background: var(--smrt-color-surface, #fff);
  }

  .notice {
    border: 1px solid #b42318;
    border-radius: 6px;
    padding: 0.65rem;
    color: #7a271a;
    background: #fff4ed;
    font-size: 0.84rem;
  }

  .messages {
    display: grid;
    align-content: start;
    gap: 0.65rem;
    min-height: 12rem;
    overflow: auto;
    padding-right: 0.15rem;
  }

  .messages article {
    display: grid;
    gap: 0.25rem;
    border-left: 2px solid var(--smrt-color-outline, #d7dce2);
    padding: 0.2rem 0 0.2rem 0.65rem;
  }

  .messages article.from-user {
    border-left-color: var(--smrt-color-primary, #155eef);
  }

  .messages article[data-type="tool_call"],
  .messages article[data-type="tool_result"] {
    opacity: 0.78;
  }

  .messages p,
  .muted {
    line-height: 1.45;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .composer,
  label {
    display: grid;
    gap: 0.55rem;
  }

  .composer {
    align-content: start;
  }

  textarea {
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    border: 1px solid var(--smrt-color-outline, #d7dce2);
    border-radius: 6px;
    padding: 0.65rem;
    font: inherit;
    line-height: 1.45;
    background: var(--smrt-color-surface, #fff);
  }

  .composer button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: 2.35rem;
    border: 1px solid var(--smrt-color-primary, #155eef);
    border-radius: 6px;
    background: var(--smrt-color-primary, #155eef);
    color: var(--smrt-color-on-primary, #fff);
    font-weight: 700;
    cursor: pointer;
  }

  button:disabled,
  textarea:disabled {
    cursor: default;
    opacity: 0.65;
  }
</style>
