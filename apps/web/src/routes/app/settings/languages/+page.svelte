<script lang="ts">
  let { data, form } = $props();
</script>

<svelte:head>
  <title>Languages | SMRT SaaS Starter</title>
</svelte:head>

<section class="settings-page">
  <header>
    <p>Settings</p>
    <h1>Languages</h1>
    <p class="description">Customize strings displayed in your tenant.</p>
  </header>

  {#if form?.message}
    <p class="notice" data-kind={form.kind}>{form.message}</p>
  {/if}

  <div class="items">
    {#each data.languages as language (`${language.key}:${language.locale}`)}
      <article>
        <div class="item-heading">
          <div>
            <h2>{language.label}</h2>
            <p>{language.description}</p>
          </div>
          <span>{language.locale}</span>
        </div>

        <dl>
          <div>
            <dt>Source</dt>
            <dd>{language.source}</dd>
          </div>
          <div>
            <dt>Resolved locale</dt>
            <dd>{language.resolvedFromLocale}</dd>
          </div>
        </dl>

        <div class="preview">
          <span>Preview</span>
          <p>{language.previewText}</p>
        </div>

        <form method="POST" action="?/language" data-webmcp-action="settings.save-language">
          <input type="hidden" name="key" value={language.key} />
          <input type="hidden" name="locale" value={language.locale} />
          <label>
            <span>Tenant template</span>
            <textarea
              name="template"
              rows="4"
              disabled={!data.canManageLanguages}
              placeholder={language.defaultTemplate}>{language.tenantOverrideTemplate}</textarea>
          </label>
          <button type="submit" disabled={!data.canManageLanguages}>Save string</button>
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
