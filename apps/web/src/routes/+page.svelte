<script lang="ts">
  const heroImage =
    "https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=1800&q=80";
</script>

<svelte:head>
  <title>SMRT SaaS Starter</title>
  <meta
    name="description"
    content="A canonical multi-tenant SaaS starter and reference app for the SMRT ecosystem."
  />
</svelte:head>

<main>
  <section class="hero" style={`background-image: linear-gradient(rgba(11, 20, 33, 0.7), rgba(11, 20, 33, 0.35)), url(${heroImage})`}>
    <nav aria-label="Main">
      <a class="brand" href="/">SMRT SaaS Starter</a>
      <div>
        <a href="/app">Demo app</a>
        <a href="/app/billing">Billing</a>
      </div>
    </nav>

    <div class="hero-content">
      <h1>SMRT SaaS Starter</h1>
      <p>
        A production-shaped reference app for tenant-aware agents, subscriptions,
        usage thresholds, prompt management, localization, mobile clients, and runtime MCP.
      </p>
      <div class="actions">
        <a class="primary" href="/app">Open demo workspace</a>
        <a class="secondary" href="/app/billing">View plans</a>
      </div>
    </div>
  </section>

  <section class="signals" aria-label="Ecosystem coverage">
    <article>
      <span>Tenancy</span>
      <strong>SMRT users, roles, sessions, tenant context</strong>
    </article>
    <article>
      <span>Subscriptions</span>
      <strong>Stripe checkout, features, thresholds, usage meters</strong>
    </article>
    <article>
      <span>Agents</span>
      <strong>Right-dock chat, app MCP, dev MCP, prompt overrides</strong>
    </article>
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #111827;
    background: #f7f8fa;
  }

  .hero {
    min-height: 86vh;
    background-size: cover;
    background-position: center;
    color: white;
    display: grid;
    grid-template-rows: auto 1fr;
  }

  nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem clamp(1rem, 4vw, 4rem);
  }

  nav a {
    color: white;
    text-decoration: none;
    font-weight: 600;
  }

  nav div {
    display: flex;
    gap: 1rem;
  }

  .brand {
    font-size: 1.05rem;
  }

  .hero-content {
    align-self: end;
    max-width: 880px;
    padding: 0 clamp(1rem, 4vw, 4rem) 9vh;
  }

  h1 {
    font-size: clamp(3rem, 8vw, 6.8rem);
    line-height: 0.95;
    margin: 0 0 1rem;
    letter-spacing: 0;
  }

  p {
    max-width: 740px;
    font-size: clamp(1.05rem, 2vw, 1.35rem);
    line-height: 1.55;
    margin: 0;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
    margin-top: 2rem;
  }

  .actions a {
    border-radius: 6px;
    min-height: 2.8rem;
    display: inline-flex;
    align-items: center;
    padding: 0 1rem;
    text-decoration: none;
    font-weight: 700;
  }

  .primary {
    color: #102033;
    background: white;
  }

  .secondary {
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.65);
  }

  .signals {
    max-width: 1120px;
    margin: -2.5rem auto 0;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    padding: 0 1rem 4rem;
    position: relative;
  }

  article {
    background: white;
    border: 1px solid #dfe3e8;
    border-radius: 8px;
    padding: 1rem;
    display: grid;
    gap: 0.5rem;
  }

  article span {
    color: #5e6470;
    font-size: 0.82rem;
  }

  @media (max-width: 760px) {
    nav {
      align-items: flex-start;
      flex-direction: column;
    }

    .signals {
      grid-template-columns: 1fr;
      margin-top: 0;
      padding-top: 1rem;
    }
  }
</style>
