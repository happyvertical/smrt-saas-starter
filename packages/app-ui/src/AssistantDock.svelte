<script lang="ts">
  import { defineToolsDock, ToolsDock } from "@happyvertical/smrt-svelte/workspace/legacy";
  import DockPanel from "./DockPanel.svelte";
  import ChatIcon from "./icons/ChatIcon.svelte";
  import SettingsIcon from "./icons/SettingsIcon.svelte";
  import UsageIcon from "./icons/UsageIcon.svelte";

  interface Props {
    tenantId: string;
    activePath: string;
    chatEndpoint?: string;
  }

  const { tenantId, activePath, chatEndpoint = "/api/chat" }: Props = $props();

  const dock = defineToolsDock({
    tools: [
      {
        id: "chat",
        label: "Chat",
        iconComponent: ChatIcon,
        component: DockPanel,
      },
      {
        id: "usage",
        label: "Usage",
        iconComponent: UsageIcon,
        component: DockPanel,
      },
      {
        id: "settings",
        label: "Settings",
        iconComponent: SettingsIcon,
        component: DockPanel,
      },
    ],
  });

  $effect(() => {
    dock.setContext({
      type: "tenant-workspace",
      title: "Tenant workspace",
      data: { tenantId, activePath, chatEndpoint },
      actions: {},
    });
  });
</script>

<div class="assistant-dock-frame" data-open={dock.isOpen}>
  <ToolsDock {dock} />
</div>

<style>
  .assistant-dock-frame {
    --tools-dock-rail-width: 3.25rem;
    --tools-dock-panel-width: min(420px, calc(100vw - var(--tools-dock-rail-width)));
    position: sticky;
    top: 0;
    align-self: start;
    flex: 0 0 auto;
    display: flex;
    justify-content: flex-end;
    width: var(--tools-dock-rail-width);
    max-width: 100vw;
    height: 100vh;
    height: 100dvh;
    transition: width 180ms cubic-bezier(0.2, 0, 0, 1);
  }

  .assistant-dock-frame[data-open="true"] {
    width: 472px;
  }

  .assistant-dock-frame :global(.tools-dock__panel),
  .assistant-dock-frame :global(.tools-dock__rail) {
    box-sizing: border-box;
  }

  @media (max-width: 960px) {
    .assistant-dock-frame {
      width: var(--tools-dock-rail-width);
      height: 0;
    }
  }
</style>
