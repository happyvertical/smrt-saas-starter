<script lang="ts">
  import { defineToolsDock, ToolsDock } from "@happyvertical/smrt-svelte/workspace";
  import DockPanel from "./DockPanel.svelte";
  import ChatIcon from "./icons/ChatIcon.svelte";
  import SettingsIcon from "./icons/SettingsIcon.svelte";
  import UsageIcon from "./icons/UsageIcon.svelte";

  interface Props {
    tenantId: string;
    activePath: string;
  }

  const { tenantId, activePath }: Props = $props();

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
      data: { tenantId, activePath },
      actions: {},
    });
  });
</script>

<ToolsDock {dock} />
