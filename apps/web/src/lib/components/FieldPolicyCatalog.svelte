<script lang="ts">
  import type {
    FieldPolicyDetailItem,
    FieldPolicySettingsCatalogPage,
  } from "@happyvertical/smrt-fields";
  import type { Snippet } from "svelte";

  export let page: FieldPolicySettingsCatalogPage;
  export let baseUrl: string;
  export let detail: Snippet<[{ item: FieldPolicyDetailItem }]>;
  export let preservedParams: Record<string, string> = {};
  export let searchPlaceholder = "Search fields";

  function hrefFor(selected: string): string {
    const query = new URLSearchParams({ ...preservedParams, selected });
    return `${baseUrl}?${query}`;
  }
</script>

<div class="field-policy-catalog">
  <form method="GET" action={baseUrl} class="search">
    {#each Object.entries(preservedParams) as [name, value]}
      <input type="hidden" {name} {value} />
    {/each}
    <label>
      <span>{searchPlaceholder}</span>
      <input name="q" value={page.query} />
    </label>
    <button type="submit">Search</button>
  </form>

  <div class="catalog-grid">
    <nav aria-label="Policy fields">
      {#each page.items as item (item.id)}
        <a href={hrefFor(item.id)} aria-current={page.selected?.id === item.id ? "page" : undefined}>
          <strong>{item.label}</strong>
          <span>{item.eyebrow}</span>
          {#if item.status}<small>{item.status}</small>{/if}
        </a>
      {:else}
        <p>No policy fields match this filter.</p>
      {/each}
    </nav>

    {#if page.selected}
      {@render detail({ item: page.selected })}
    {/if}
  </div>
</div>

<style>
  .field-policy-catalog,
  .search,
  .catalog-grid,
  nav {
    display: grid;
    gap: var(--smrt-spacing-3, 0.75rem);
  }

  .search {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
  }

  .search label {
    display: grid;
    gap: var(--smrt-spacing-1, 0.25rem);
  }

  .catalog-grid {
    grid-template-columns: minmax(14rem, 0.7fr) minmax(0, 1.3fr);
  }

  nav a {
    display: grid;
    gap: var(--smrt-spacing-1, 0.25rem);
    padding: var(--smrt-spacing-3, 0.75rem);
    border: 1px solid var(--smrt-color-outline, #d7dce2);
    border-radius: 0.5rem;
    color: inherit;
    text-decoration: none;
  }

  nav a[aria-current="page"] {
    border-color: var(--smrt-color-primary, #155eef);
  }

  nav span,
  nav small {
    color: var(--smrt-color-on-surface-variant, #5e6470);
  }

  @media (max-width: 720px) {
    .catalog-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
