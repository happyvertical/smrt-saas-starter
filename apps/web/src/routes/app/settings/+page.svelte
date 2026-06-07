<script lang="ts">
  let { data, form } = $props();
</script>

<svelte:head>
  <title>Settings | SMRT SaaS Starter</title>
</svelte:head>

<section class="page">
  <header class="page-header">
    <p>Settings</p>
    <h1>{data.languages[0]?.previewText ?? "Tenant configuration"}</h1>
    <div class="plan-state">
      <span>{data.planName}</span>
      <span class:enabled={data.canManagePrompts}>Prompts</span>
      <span class:enabled={data.canManageLanguages}>Languages</span>
    </div>
  </header>

  {#if form?.message}
    <p class="notice" data-kind={form.kind}>{form.message}</p>
  {/if}

  <section class="section">
    <header>
      <p>Prompt Management</p>
      <h2>Effective tenant prompts</h2>
    </header>

    <div class="items">
      {#each data.prompts as prompt (prompt.key)}
        <article>
          <div class="item-heading">
            <div>
              <h3>{prompt.label}</h3>
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

  <section class="section">
    <header>
      <p>Language Management</p>
      <h2>Effective tenant strings</h2>
    </header>

    <div class="items">
      {#each data.languages as language (`${language.key}:${language.locale}`)}
        <article>
          <div class="item-heading">
            <div>
              <h3>{language.label}</h3>
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

          <form method="POST" action="?/language">
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
</section>

<style>
  .page {
    display: grid;
    gap: 1.5rem;
    padding: clamp(1rem, 3vw, 2rem);
    max-width: 1120px;
  }

  .page-header,
  .section,
  article,
  form,
  label,
  .preview {
    display: grid;
    gap: 0.85rem;
  }

  .page-header p,
  h1,
  h2,
  h3,
  .item-heading p,
  .preview p,
  dl,
  dd {
    margin: 0;
  }

  .page-header p,
  .section > header p,
  .item-heading p,
  dt,
  .preview span {
    color: var(--smrt-color-on-surface-variant, #5e6470);
  }

  h1 {
    font-size: 2rem;
    letter-spacing: 0;
    line-height: 1.15;
  }

  h2 {
    font-size: 1.25rem;
    letter-spacing: 0;
  }

  h3 {
    font-size: 1rem;
    letter-spacing: 0;
  }

  .plan-state {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .plan-state span,
  .item-heading > span,
  .notice {
    border: 1px solid var(--smrt-color-outline, #d7dce2);
    border-radius: 999px;
    background: var(--smrt-color-surface, #fff);
    padding: 0.35rem 0.65rem;
    font-size: 0.82rem;
  }

  .plan-state .enabled {
    border-color: #2e7d32;
    color: #1b5e20;
    background: #edf7ed;
  }

  .notice {
    justify-self: start;
    border-radius: 6px;
  }

  .items {
    display: grid;
    gap: 1rem;
  }

  article {
    border: 1px solid var(--smrt-color-outline, #d7dce2);
    border-radius: 8px;
    background: var(--smrt-color-surface, #fff);
    padding: 1rem;
  }

  .item-heading {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }

  dl {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 0.75rem;
  }

  dt {
    font-size: 0.75rem;
  }

  dd {
    font-weight: 700;
    overflow-wrap: anywhere;
  }

  .preview {
    border: 1px solid var(--smrt-color-outline-variant, #edf0f3);
    border-radius: 6px;
    background: var(--smrt-color-surface-container, #f3f5f7);
    padding: 0.85rem;
  }

  .preview span,
  label span {
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: uppercase;
  }

  textarea {
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    border: 1px solid var(--smrt-color-outline, #d7dce2);
    border-radius: 6px;
    padding: 0.75rem;
    font: inherit;
    line-height: 1.45;
  }

  textarea:disabled {
    color: var(--smrt-color-on-surface-variant, #5e6470);
    background: var(--smrt-color-surface-container, #f3f5f7);
  }

  button {
    justify-self: start;
    border: 1px solid var(--smrt-color-primary, #155eef);
    border-radius: 6px;
    background: var(--smrt-color-primary, #155eef);
    color: var(--smrt-color-on-primary, #fff);
    min-height: 2.4rem;
    padding: 0 0.85rem;
    font-weight: 700;
    cursor: pointer;
  }

  button:disabled {
    border-color: var(--smrt-color-outline, #d7dce2);
    background: var(--smrt-color-surface-container-highest, #e8ebef);
    color: var(--smrt-color-on-surface-variant, #5e6470);
    cursor: default;
  }

  @media (max-width: 720px) {
    .item-heading {
      display: grid;
    }
  }
</style>
