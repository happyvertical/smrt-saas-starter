<script lang="ts">
  import { AssistantDock } from "@happyvertical/smrt-saas-ui";
  import { AdminShell, TenantNav } from "@happyvertical/smrt-svelte/workspace";
  import NavIcon from "$lib/components/NavIcon.svelte";

  let { data, children } = $props();

  const navItems = $derived(
    [
      { href: "/app", label: "Overview", icon: "bar-chart", permission: "tenant.read" },
      { href: "/app/billing", label: "Billing", icon: "credit-card", permission: "tenant.billing.read" },
      { href: "/app/usage", label: "Usage", icon: "gauge", permission: "tenant.usage.read" },
      { href: "/app/settings", label: "Settings", icon: "settings", permission: "tenant.settings.read" },
      { href: "/app/admin", label: "Admin", icon: "settings", permission: "super-user" },
    ]
      .filter((item) =>
        item.permission === "super-user" ? data.isSuperUser : data.permissions.includes(item.permission),
      )
      .map(({ permission: _permission, ...item }) => item),
  );
</script>

<div class="workspace">
  <AdminShell title="SMRT Starter" subtitle={data.roleLabel}>
    {#snippet tenantPanel()}
      <TenantNav items={navItems} currentHref={data.activePath} iconComponent={NavIcon} />
    {/snippet}

    {#snippet tenantFooter()}
      <form class="tenant-switch" method="POST" action="/api/tenant/switch">
        <input type="hidden" name="returnTo" value={data.activePath} />
        <label>
          <span>Tenant</span>
          <select
            name="tenantId"
            aria-label="Tenant"
            onchange={(event) => event.currentTarget.form?.requestSubmit()}
          >
            {#each data.tenants as tenant (tenant.tenantId)}
              <option value={tenant.tenantId} selected={tenant.tenantId === data.tenantId}>
                {tenant.tenantLabel}
              </option>
            {/each}
          </select>
        </label>
        <div class="identity">
          <strong>{data.userLabel}</strong>
          <span>{data.roleLabel}</span>
        </div>
        <button type="submit">Switch</button>
      </form>
      <form class="logout" method="POST" action="/logout">
        <button type="submit">Sign out</button>
      </form>
    {/snippet}

    {@render children()}
  </AdminShell>

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

  .workspace :global(.smrt-admin-shell) {
    flex: 1 1 auto;
    min-width: 0;
  }

  .tenant-switch {
    display: grid;
    gap: 0.55rem;
    padding: 0.75rem;
    border: 1px solid var(--smrt-color-outline, #d7dce2);
    border-radius: 8px;
  }

  .tenant-switch label,
  .identity {
    display: grid;
    gap: 0.2rem;
  }

  .tenant-switch span,
  .tenant-switch label > span {
    color: var(--smrt-color-on-surface-variant, #5e6470);
    font-size: 0.75rem;
  }

  .tenant-switch select {
    width: 100%;
    min-height: 2.25rem;
    border: 1px solid var(--smrt-color-outline, #d7dce2);
    border-radius: 6px;
    background: var(--smrt-color-surface, #fff);
    color: inherit;
    font: inherit;
  }

  .tenant-switch strong {
    overflow-wrap: anywhere;
    font-size: 0.86rem;
  }

  .tenant-switch button {
    min-height: 2.2rem;
    border: 1px solid var(--smrt-color-primary, #155eef);
    border-radius: 6px;
    background: var(--smrt-color-primary, #155eef);
    color: var(--smrt-color-on-primary, #fff);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  .logout button {
    width: 100%;
    min-height: 2.2rem;
    border: 1px solid var(--smrt-color-outline, #d7dce2);
    border-radius: 6px;
    background: var(--smrt-color-surface, #fff);
    color: inherit;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
</style>
