<script lang="ts">
  let { data, form } = $props();
</script>

<svelte:head>
  <title>Prompts | SMRT SaaS Starter</title>
</svelte:head>

<section class="settings-page">
  <header>
    <p>Settings</p>
    <h1>Prompts</h1>
    <p class="description">Set tenant-specific templates for the app's AI prompts.</p>
  </header>

  {#if form?.message}
    <p class="notice" data-kind={form.kind}>{form.message}</p>
  {/if}

  <div class="items">
    {#each data.prompts as prompt (prompt.key)}
      <article>
        <div class="item-heading">
          <div>
            <h2>{prompt.label}</h2>
            <p>{prompt.description}</p>
          </div>
          <span>{prompt.hasTenantOverride ? "Tenant override" : "Default"}</span>
        </div>

        <dl>
          <div>
            <dt>Profile</dt>
            <dd>{prompt.profile || "default"}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{prompt.model || "profile default"}</dd>
          </div>
        </dl>

        <div class="preview">
          <span>Preview</span>
          <p>{prompt.previewText}</p>
        </div>

        <form method="POST" action="?/prompt">
          <input type="hidden" name="key" value={prompt.key} />
          <label>
            <span>Tenant template</span>
            <textarea
              name="template"
              rows="5"
              disabled={!data.canManagePrompts}
              placeholder={prompt.defaultTemplate}>{prompt.tenantOverrideTemplate}</textarea>
          </label>
          <button type="submit" disabled={!data.canManagePrompts}>Save prompt</button>
        </form>
      </article>
    {/each}
  </div>
</section>

<style>
  .settings-page,
  .settings-page > header,
  .items,
  article,
  form,
  label,
  .preview {
    display: grid;
    gap: 0.85rem;
  }

  .settings-page p,
  h1,
  h2,
  .item-heading p,
  .preview p,
  dl,
  dd {
    margin: 0;
  }

  .settings-page > header > p:first-child,
  .description,
  .item-heading p,
  dt,
  .preview span {
    color: var(--smrt-color-on-surface-variant, #5e6470);
  }

  h1 { font-size: 2rem; letter-spacing: 0; line-height: 1.15; }
  h2 { font-size: 1.1rem; letter-spacing: 0; }

  article,
  .notice {
    border: 1px solid var(--smrt-color-outline, #d7dce2);
    border-radius: 0.75rem;
    padding: 1rem;
  }

  .item-heading {
    display: flex;
    align-items: start;
    gap: 1rem;
    justify-content: space-between;
  }

  .item-heading > span {
    border: 1px solid var(--smrt-color-outline, #d7dce2);
    border-radius: 999px;
    padding: 0.35rem 0.65rem;
    white-space: nowrap;
  }

  dl {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem 2rem;
  }

  dl div { display: grid; gap: 0.25rem; }
  dd { font-weight: 650; }

  .preview {
    border-left: 3px solid var(--smrt-color-primary, #155eef);
    padding-left: 0.75rem;
  }
</style>
