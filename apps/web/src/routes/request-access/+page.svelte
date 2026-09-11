<script lang="ts">
  import { Input, Textarea } from "@happyvertical/smrt-ui/forms";

  let { form } = $props();
</script>

<svelte:head>
  <title>Request access | SMRT SaaS Starter</title>
</svelte:head>

<main class="auth-page">
  <section class="panel">
    <a class="brand" href="/">SMRT SaaS Starter</a>
    <header>
      <p>Waitlist</p>
      <h1>Request access</h1>
    </header>

    {#if form?.submitted}
      <p class="success" data-testid="request-access-success">
        Thanks — your request for {form.email} is in. A starter super user will review it and follow
        up by email.
      </p>
      <p class="alternate">Already have a workspace? <a href="/login">Sign in</a></p>
    {:else}
      <p class="lede">
        Tell us who you are and we'll be in touch when your workspace is ready.
      </p>

      {#if form?.error}
        <p class="notice">{form.error}</p>
      {/if}

      <form method="POST">
        <label>
          <span>Work email</span>
          <Input
            name="email"
            type="email"
            autocomplete="email"
            value={form?.email ?? ""}
            placeholder="you@example.com"
            required
          />
        </label>
        <label>
          <span>Your name</span>
          <Input
            name="name"
            autocomplete="name"
            value={form?.name ?? ""}
            placeholder="Jane Doe"
          />
        </label>
        <label>
          <span>Company</span>
          <Input
            name="company"
            autocomplete="organization"
            value={form?.company ?? ""}
            placeholder="Acme Labs"
          />
        </label>
        <label>
          <span>What do you want to use it for?</span>
          <Textarea
            name="message"
            rows={3}
            placeholder="A sentence or two…"
            value={form?.message ?? ""}
          />
        </label>
        <button type="submit">Request access</button>
      </form>

      <p class="alternate">Already have a workspace? <a href="/login">Sign in</a></p>
    {/if}
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
  .alternate,
  .lede {
    margin: 0;
  }

  header p,
  label span,
  .alternate,
  .lede {
    color: #5e6470;
  }

  h1 {
    font-size: 2rem;
    line-height: 1.1;
    letter-spacing: 0;
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
</style>
