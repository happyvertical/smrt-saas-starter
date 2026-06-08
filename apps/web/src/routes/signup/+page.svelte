<script lang="ts">
  let { form } = $props();
</script>

<svelte:head>
  <title>Create workspace | SMRT SaaS Starter</title>
</svelte:head>

<main class="auth-page">
  <section class="panel">
    <a class="brand" href="/">SMRT SaaS Starter</a>
    <header>
      <p>Start</p>
      <h1>Create a tenant workspace</h1>
    </header>

    {#if form?.message}
      <p class="notice">{form.message}</p>
    {/if}

    <form method="POST">
      <label>
        <span>Work email</span>
        <input
          name="email"
          type="email"
          autocomplete="email"
          value={form?.email ?? ""}
          placeholder="you@example.com"
          required
        />
      </label>
      <label>
        <span>Workspace name</span>
        <input
          name="tenantName"
          autocomplete="organization"
          value={form?.tenantName ?? ""}
          placeholder="Acme Labs"
          required
        />
      </label>
      <button type="submit">Create workspace</button>
    </form>

    <p class="alternate">Already have a workspace? <a href="/login">Sign in</a></p>
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
    width: min(100%, 440px);
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

  .notice {
    margin: 0;
    border: 1px solid #b42318;
    border-radius: 6px;
    background: #fff4f2;
    color: #7a271a;
    padding: 0.75rem;
  }
</style>
