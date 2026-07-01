<script lang="ts">
  let { data, form } = $props();

  const invitationEmail = $derived(data.invitationEmail || "");
  const emailValue = $derived(form?.email ?? invitationEmail);
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

    {#if !data.canSignup}
      <p class="notice">
        {#if data.signupMode === "request-access"}
          Open signup is closed. Request access and a starter super user will follow up.
        {:else}
          Signup is invite-only. Use an invitation link from a starter super user to create a
          workspace.
        {/if}
      </p>
      <a class="cta" href="/request-access">Request access →</a>
    {/if}

    {#if data.invitationError}
      <p class="notice">{data.invitationError}</p>
    {:else if data.invitationValid}
      <p class="success">Invitation ready for {data.invitationEmail || "this workspace"}.</p>
    {/if}

    {#if form?.message}
      <p class="notice">{form.message}</p>
    {/if}

    {#if data.canSignup}
    <form method="POST">
      {#if data.invitationToken}
        <input type="hidden" name="invitationToken" value={data.invitationToken} />
      {/if}
      <label>
        <span>Work email</span>
        <input
          name="email"
          type="email"
          autocomplete="email"
          value={emailValue}
          readonly={Boolean(invitationEmail)}
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
    {/if}

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

  .success {
    margin: 0;
    border: 1px solid #12b76a;
    border-radius: 6px;
    background: #ecfdf3;
    color: #067647;
    padding: 0.75rem;
  }

  .cta {
    justify-self: start;
    color: #155eef;
    font-weight: 700;
    text-decoration: none;
  }
</style>
