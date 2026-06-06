<script lang="ts">
  import type { ToolsDockApi, ToolsDockContext } from "@happyvertical/smrt-svelte/workspace";

  interface Props {
    context: ToolsDockContext | null;
    dock: ToolsDockApi;
  }

  const { context, dock }: Props = $props();
  const activeTool = $derived(dock.activeTool ?? "chat");
  const tenantId = $derived(String(context?.data?.tenantId ?? "current tenant"));
</script>

<section class="dock-panel">
  {#if activeTool === "chat"}
    <h2>Assistant</h2>
    <p>Tenant-scoped chat and MCP tools will run against {tenantId}.</p>
  {:else if activeTool === "usage"}
    <h2>Usage</h2>
    <p>Usage meters are fed by tenant-aware SMRT metrics and AI usage records.</p>
  {:else}
    <h2>Settings</h2>
    <p>Dock tools are gated by permissions, features, and subscription thresholds.</p>
  {/if}
</section>

<style>
  .dock-panel {
    display: grid;
    gap: 0.5rem;
    padding: 1rem;
  }

  h2,
  p {
    margin: 0;
  }

  h2 {
    font-size: 1rem;
  }

  p {
    color: var(--smrt-color-on-surface-variant, #5e6470);
    line-height: 1.45;
  }
</style>
