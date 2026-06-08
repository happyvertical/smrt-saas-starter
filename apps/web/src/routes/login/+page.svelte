<script lang="ts">
  let { data, form } = $props();
</script>

<svelte:head>
  <title>Sign in | SMRT SaaS Starter</title>
</svelte:head>

<main class="auth-page">
  <section class="panel">
    <a class="brand" href="/">SMRT SaaS Starter</a>
    <header>
      <p>Sign in</p>
      <h1>Open your workspace</h1>
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
      <button type="submit">Sign in</button>
    </form>

    {#if form?.verificationUrl}
      <a class="dev-link" href={form.verificationUrl}>Continue with local sign-in link</a>
    {/if}

    <a class="idp-link" href="/auth/happyvertical/login">Continue with HappyVertical IDP</a>

    <p class="alternate">No workspace yet? <a href="/signup">Create one</a></p>
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .auth-page {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 1rem;
    background: #f7f8fa;
  }

  .panel {
    width: min(100%, 420px);
    display: grid;
    gap: 1.1rem;
    border: 1px solid #d7dce2;
    border-radius: 8px;
    background: #fff;
    padding: clamp(1rem, 4vw, 1.5rem);
  }

  .brand {
    color: #155eef;
    font-weight: 800;
    text-decoration: none;
  }

  header,
  form,
  label {
    display: grid;
    gap: 0.65rem;
  }

  header p,
  h1,
  .alternate {
    margin: 0;
  }

  header p,
  label span,
  .alternate {
    color: #5e6470;
  }

  h1 {
    font-size: 2rem;
    line-height: 1.1;
    letter-spacing: 0;
  }

  input {
    min-height: 2.6rem;
    border: 1px solid #cbd3dc;
    border-radius: 6px;
    padding: 0 0.75rem;
    font: inherit;
  }

  button {
    min-height: 2.6rem;
    border: 1px solid #155eef;
    border-radius: 6px;
    background: #155eef;
    color: #fff;
    font: inherit;
    font-weight: 800;
    cursor: pointer;
  }

  .dev-link,
  .idp-link {
    display: grid;
    min-height: 2.6rem;
    align-items: center;
    justify-content: center;
    border: 1px solid #cbd3dc;
    border-radius: 6px;
    color: #155eef;
    font-weight: 800;
    overflow-wrap: anywhere;
    padding: 0 0.75rem;
    text-align: center;
    text-decoration: none;
  }

  .dev-link {
    border-color: #155eef;
    background: #eef4ff;
  }

  .notice {
    margin: 0;
    border: 1px solid #98a2b3;
    border-radius: 6px;
    background: #f8fafc;
    color: #344054;
    padding: 0.75rem;
  }
</style>
