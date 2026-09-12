<script lang="ts">
  import { page } from "$app/state";

  let { data, children } = $props();

  const items = $derived([
    { href: "/app/settings", label: "Overview" },
    { href: "/app/settings/members", label: "Members" },
    { href: "/app/settings/prompts", label: "Prompts" },
    { href: "/app/settings/languages", label: "Languages" },
    ...(data.canConfigureSignupForm
      ? [{ href: "/app/settings/signup-form-fields", label: "Signup form" }]
      : []),
  ]);
</script>

<div class="settings-shell">
  <nav class="settings-nav" aria-label="Settings navigation">
    {#each items as item (item.href)}
      <a href={item.href} aria-current={page.url.pathname === item.href ? "page" : undefined}>
        {item.label}
      </a>
    {/each}
  </nav>

  {@render children()}
</div>

<style>
  .settings-shell {
    display: grid;
    gap: 1.5rem;
    max-width: 1120px;
    padding: clamp(1rem, 3vw, 2rem);
  }

  .settings-nav {
    display: flex;
    gap: 0.35rem;
    overflow-x: auto;
    border-bottom: 1px solid var(--smrt-color-outline, #d7dce2);
    padding-bottom: 0.5rem;
  }

  .settings-nav a {
    flex: 0 0 auto;
    border-radius: 0.5rem;
    color: var(--smrt-color-on-surface-variant, #5e6470);
    font-size: 0.9rem;
    font-weight: 650;
    padding: 0.5rem 0.7rem;
    text-decoration: none;
  }

  .settings-nav a:hover,
  .settings-nav a[aria-current="page"] {
    background: var(--smrt-color-primary-container, #e8f0ff);
    color: var(--smrt-color-on-primary-container, #12336e);
  }
</style>
