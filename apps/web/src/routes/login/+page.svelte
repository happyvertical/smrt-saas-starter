<script lang="ts">
  let { data, form } = $props();
</script>

<svelte:head>
  <title>Sign in | SMRT SaaS Starter</title>
</svelte:head>

<main class="auth-page">
  <section class="panel" aria-labelledby="sign-in-heading">
    <a class="brand" href="/">SMRT <span>SaaS Starter</span></a>
    <header>
      <p class="eyebrow">Sign in</p>
      <h1 id="sign-in-heading">Continue to the starter.</h1>
      <p class="lede">
        Use email for a secure sign-in link, or continue with your configured identity provider.
      </p>
    </header>

    {#if form?.message}
      <p class="notice">{form.message}</p>
    {:else if data.errorMessage}
      <p class="notice">{data.errorMessage}</p>
    {/if}

    <form method="POST">
      <input type="hidden" name="returnTo" value={form?.returnTo ?? data.returnTo} />
      <label>
        <span>Email</span>
        <input
          name="email"
          type="email"
          autocomplete="email"
          value={form?.email ?? ""}
          placeholder="you@example.com"
          required
        />
      </label>
      <button type="submit" class="primary">Email me a sign-in link</button>
    </form>

    {#if form?.verificationUrl}
      <a class="dev-link" href={form.verificationUrl}>Continue with local sign-in link</a>
    {/if}

    {#if data.idpEnabled}
      <a class="secondary" href="/auth/happyvertical/login">Continue with HappyVertical IDP</a>
    {/if}

    <p class="alternate">New to the starter? <a href="/signup">Create an account</a></p>
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    color: var(--smrt-color-on-background);
  }

  .auth-page {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: clamp(1rem, 4vw, 2rem);
    background:
      radial-gradient(circle at 82% 10%, var(--smrt-color-primary-container), transparent 31%),
      var(--smrt-color-background);
  }

  .panel {
    width: min(100%, 29rem);
    display: grid;
    gap: 1.15rem;
    padding: clamp(1.35rem, 4vw, 2rem);
    border: 1px solid var(--smrt-color-outline-variant);
    border-radius: var(--smrt-radius-md);
    background: var(--smrt-color-surface);
    box-shadow: var(--smrt-elevation-2);
  }

  .brand {
    color: var(--smrt-color-on-surface);
    font: var(--smrt-typography-title-large-font);
    letter-spacing: var(--smrt-typography-title-large-tracking);
    text-decoration: none;
  }

  .brand span {
    color: var(--smrt-color-on-surface-variant);
  }

  header,
  form,
  label {
    display: grid;
    gap: 0.7rem;
  }

  .eyebrow,
  h1,
  .lede,
  .alternate {
    margin: 0;
  }

  .eyebrow,
  label span,
  .alternate {
    color: var(--smrt-color-on-surface-variant);
    font: var(--smrt-typography-label-large-font);
  }

  .eyebrow {
    color: var(--smrt-color-primary);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h1 {
    color: var(--smrt-color-on-surface);
    font-family: var(--smrt-typography-headline-large-font-family);
    font-size: clamp(2rem, 6vw, 2.8rem);
    font-weight: var(--smrt-typography-headline-large-weight);
    letter-spacing: var(--smrt-typography-headline-large-tracking);
    line-height: 1.02;
    text-wrap: balance;
  }

  .lede {
    color: var(--smrt-color-on-surface-variant);
    font: var(--smrt-typography-body-medium-font);
  }

  input {
    min-height: 2.8rem;
    border: 1px solid var(--smrt-color-outline);
    border-radius: var(--smrt-radius-sm);
    background: var(--smrt-color-surface);
    color: var(--smrt-color-on-surface);
    padding: 0 0.8rem;
    font: var(--smrt-typography-body-large-font);
  }

  input:focus-visible {
    outline: 2px solid var(--smrt-color-primary);
    outline-offset: 2px;
  }

  .primary,
  .dev-link,
  .secondary {
    min-height: 2.8rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--smrt-color-primary);
    border-radius: var(--smrt-radius-sm);
    padding: 0 0.85rem;
    font: var(--smrt-typography-label-large-font);
    text-align: center;
    text-decoration: none;
  }

  .primary {
    background: var(--smrt-color-primary);
    color: var(--smrt-color-on-primary);
    cursor: pointer;
  }

  .primary:hover {
    background: var(--smrt-color-primary-container);
    color: var(--smrt-color-on-primary-container);
  }

  .secondary {
    border-color: var(--smrt-color-outline-variant);
    color: var(--smrt-color-on-surface);
  }

  .secondary:hover {
    border-color: var(--smrt-color-primary);
    color: var(--smrt-color-primary);
  }

  .dev-link {
    background: var(--smrt-color-primary-container);
    color: var(--smrt-color-on-primary-container);
  }

  .notice {
    margin: 0;
    border: 1px solid var(--smrt-color-outline);
    border-radius: var(--smrt-radius-sm);
    background: var(--smrt-color-surface-variant);
    color: var(--smrt-color-on-surface-variant);
    padding: 0.8rem;
    font: var(--smrt-typography-body-medium-font);
  }

  .alternate a {
    color: var(--smrt-color-primary);
    text-underline-offset: 0.18em;
  }

  a:focus-visible,
  button:focus-visible {
    outline: 2px solid var(--smrt-color-primary);
    outline-offset: 3px;
  }
</style>
