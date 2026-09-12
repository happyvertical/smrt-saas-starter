<script lang="ts">
  import { AssistantDock } from "@happyvertical/smrt-saas-ui";
  import {
    AdminShell,
    AppScopePanel,
    type ShellNavItem,
    TenantNav,
  } from "@happyvertical/smrt-svelte/workspace";
  import { APP_NAVIGATION } from "$lib/app-navigation";
  import FieldPolicyFocusTool from "$lib/components/FieldPolicyFocusTool.svelte";
  import NavIcon from "$lib/components/NavIcon.svelte";
  import WebMcpShellBridge from "$lib/components/WebMcpShellBridge.svelte";

  let { data, children } = $props();

  type StarterNavItem = ShellNavItem & { permission?: string };

  const navItems = $derived.by((): ShellNavItem[] => {
    const candidates: StarterNavItem[] = APP_NAVIGATION.map((item) => ({
      href: item.href,
      label: item.label,
      icon: item.icon,
      permission: item.permission,
    }));
    return candidates.filter((item): item is StarterNavItem => {
      if (!item) return false;
      const permission = item.permission;
      return permission === "super-user"
        ? data.isSuperUser
        : !permission || data.permissions.includes(permission);
    });
  });
</script>

<div class="workspace">
  <AdminShell
    title="SMRT Starter"
    subtitle={data.tenantLabel}
    config={{
      top: { initial: "collapsed", label: "Workspace" },
      left: { initial: "expanded", label: "Navigation" },
      right: { initial: "collapsed", label: "Tools" },
      bottom: false,
    }}
  >
    {#snippet appBar()}
      <div class="app-bar">
        <strong>SMRT Starter</strong>
        <span>{data.tenantLabel}</span>
      </div>
    {/snippet}

    {#snippet appPanel()}
      <AppScopePanel appName="SMRT Starter" tenantName={data.tenantLabel} />
    {/snippet}

    {#snippet tenantPanel()}
      <TenantNav items={navItems} currentHref={data.activePath} iconComponent={NavIcon} />
    {/snippet}

    {#snippet tenantRail()}
      <TenantNav
        items={navItems}
        currentHref={data.activePath}
        iconComponent={NavIcon}
        collapsed
      />
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

    <FieldPolicyFocusTool />
    <WebMcpShellBridge activePath={data.activePath} destinations={navItems} tenants={data.tenants} />
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

  .app-bar {
    display: grid;
    gap: 0.1rem;
  }

  .app-bar span,
  .tenant-switch span,
  .tenant-switch label > span {
    color: var(--smrt-color-on-surface-variant, #5e6470);
    font-size: 0.75rem;
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

  .tenant-switch button,
  .logout button {
    min-height: 2.2rem;
    border: 1px solid var(--smrt-color-outline, #d7dce2);
    border-radius: 6px;
    background: var(--smrt-color-surface, #fff);
    color: inherit;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  .tenant-switch button {
    border-color: var(--smrt-color-primary, #155eef);
    background: var(--smrt-color-primary, #155eef);
    color: var(--smrt-color-on-primary, #fff);
  }
</style>
