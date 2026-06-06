<svelte:head>
  <title>Settings | SMRT SaaS Starter</title>
</svelte:head>

<section class="page">
  <header>
    <p>Settings</p>
    <h1>Tenant configuration</h1>
  </header>

  <div class="grid">
    <article>
      <h2>Prompts</h2>
      <p>Tenant prompt overrides are resolved through `smrt-prompts`.</p>
    </article>
    <article>
      <h2>Languages</h2>
      <p>Language strings and AI translations are resolved through `smrt-languages` and SDK translator adapters.</p>
    </article>
    <article>
      <h2>Secrets</h2>
      <p>Tenant runtime secrets are envelope-encrypted through SMRT and SDK secret stores.</p>
    </article>
  </div>
</section>

<style>
  .page {
    display: grid;
    gap: 1.5rem;
    padding: clamp(1rem, 3vw, 2rem);
    max-width: 960px;
  }

  header p,
  h1,
  h2,
  article p {
    margin: 0;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1rem;
  }

  article {
    border: 1px solid var(--smrt-color-outline, #d7dce2);
    border-radius: 8px;
    padding: 1rem;
    background: var(--smrt-color-surface, #fff);
    display: grid;
    gap: 0.6rem;
  }

  article p {
    color: var(--smrt-color-on-surface-variant, #5e6470);
    line-height: 1.45;
  }
</style>
