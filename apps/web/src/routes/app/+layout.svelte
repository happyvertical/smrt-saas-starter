<script lang="ts">
  import { AssistantDock } from "@happyvertical/smrt-saas-ui";
  import { RoleShell } from "@happyvertical/smrt-svelte/workspace";
  import NavIcon from "$lib/components/NavIcon.svelte";

  let { data, children } = $props();

  const roles = [
    {
      id: "owner",
      label: "Owner",
      description: "Tenant administration",
      sections: [
        { href: "/app", label: "Overview", icon: "bar-chart", exact: true },
        { href: "/app/billing", label: "Billing", icon: "credit-card" },
        { href: "/app/usage", label: "Usage", icon: "gauge" },
        { href: "/app/settings", label: "Settings", icon: "settings" },
      ],
    },
  ];

</script>

<div class="workspace">
  <RoleShell
    {roles}
    currentRole="owner"
    currentPath={data.activePath}
    title="SMRT Starter"
    navIconComponent={NavIcon}
  >
    {#snippet sidebarFooter()}
      <div class="tenant-pill">
        <span>Tenant</span>
        <strong>{data.tenantLabel}</strong>
      </div>
    {/snippet}

    {@render children()}
  </RoleShell>

  <AssistantDock tenantId={data.tenantId} activePath={data.activePath} chatEndpoint="/api/chat" />
</div>

<style>
  .workspace {
    width: 100vw;
    max-width: 100%;
    min-height: 100vh;
    display: flex;
    align-items: stretch;
    background: var(--smrt-color-background, #f7f8fa);
  }

  .workspace :global(.smrt-workspace-shell) {
    flex: 1 1 auto;
    min-width: 0;
  }

  .tenant-pill {
    display: grid;
    gap: 0.2rem;
    padding: 0.75rem;
    border: 1px solid var(--smrt-color-outline, #d7dce2);
    border-radius: 8px;
  }

  .tenant-pill span {
    color: var(--smrt-color-on-surface-variant, #5e6470);
    font-size: 0.75rem;
  }
</style>
