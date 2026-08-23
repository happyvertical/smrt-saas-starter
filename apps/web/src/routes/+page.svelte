<script lang="ts">
  import { getThemeContext } from "@happyvertical/smrt-ui/themes";
  import { Moon, Sun } from "lucide-svelte";

  const theme = getThemeContext();

  function toggleColorScheme() {
    theme.toggleColorScheme();
  }
</script>

<svelte:head>
  <title>SMRT SaaS Starter — a production-shaped foundation</title>
  <meta
    name="description"
    content="A production-shaped, multi-tenant SaaS starter for the SMRT ecosystem."
  />
</svelte:head>

<main class="splash">
  <header class="site-header">
    <a class="wordmark" href="/" aria-label="SMRT SaaS Starter home">
      SMRT <span>SaaS Starter</span>
    </a>

    <nav class="header-actions" aria-label="Account and appearance">
      <a class="header-link" href="/login">Sign in</a>
      <button
        class="icon-link mode-toggle"
        type="button"
        aria-label="Toggle light and dark mode"
        title="Toggle light and dark mode"
        onclick={toggleColorScheme}
      >
        <span class="mode-icon mode-dark" aria-hidden="true"><Moon size={19} strokeWidth={1.7} /></span>
        <span class="mode-icon mode-light" aria-hidden="true"><Sun size={19} strokeWidth={1.7} /></span>
      </button>
    </nav>
  </header>

  <section class="hero" aria-labelledby="hero-heading">
    <div class="hero-copy">
      <p class="eyebrow">SMRT reference application</p>
      <h1 id="hero-heading">Build the SaaS beneath your next product.</h1>
      <p>
        A production-shaped foundation for tenant access, plans, live usage, and agents — built to
        be understood, extended, and replaced with your domain.
      </p>
    </div>

    <aside class="access-card" aria-label="Starter access">
      <p class="card-label">Explore the starter</p>
      <a class="primary-action" href="/app">Open the seeded demo</a>
      <a class="secondary-action" href="/signup">Create an account</a>
      <a class="brief-link" href="/login">Sign in with email <span aria-hidden="true">→</span></a>
    </aside>
  </section>

  <section class="capabilities" aria-label="Starter capabilities">
    <a class="capability" href="/app">
      <h2>identity</h2>
      <p>
        Tenant context, memberships, roles, sessions, and a clear place to add your product’s
        authorization rules.
      </p>
    </a>
    <a class="capability" href="/app/billing">
      <h2>plans</h2>
      <p>
        Subscription plans, entitlements, thresholds, and usage meters that make billing behavior
        visible from the start.
      </p>
    </a>
    <a class="capability" href="/app/usage">
      <h2>agents</h2>
      <p>
        AI and MCP surfaces, prompts, localization, and the operational seams an agent-enabled app
        needs in production.
      </p>
    </a>
  </section>
</main>

<style>
  :global(*) { box-sizing: border-box; }
  :global(body) { color: var(--smrt-color-on-background); }

  .splash { min-height: 100dvh; background: var(--smrt-color-background); color: var(--smrt-color-on-background); }

  .site-header, .hero, .capabilities { width: min(100% - 2rem, 86rem); margin-inline: auto; }

  .site-header {
    min-height: 5.25rem; display: flex; align-items: center; justify-content: space-between;
    gap: 1rem; border-bottom: 1px solid var(--smrt-color-outline-variant);
  }

  .wordmark {
    color: var(--smrt-color-on-background); font: var(--smrt-typography-title-large-font);
    letter-spacing: var(--smrt-typography-title-large-tracking); text-decoration: none;
  }
  .wordmark span { color: var(--smrt-color-on-surface-variant); }

  .header-actions { display: flex; align-items: center; gap: 0.45rem; }
  .header-link, .icon-link {
    min-height: 2.6rem; display: inline-flex; align-items: center; justify-content: center;
    border: 1px solid var(--smrt-color-outline-variant); border-radius: var(--smrt-radius-sm);
    background: var(--smrt-color-surface); color: var(--smrt-color-on-surface);
    font: var(--smrt-typography-label-large-font); text-decoration: none; cursor: pointer;
  }
  .header-link { padding-inline: 0.95rem; }
  .icon-link { width: 2.6rem; padding: 0; }
  .header-link:hover, .icon-link:hover { color: var(--smrt-color-primary); border-color: var(--smrt-color-primary); }
  a:focus-visible, button:focus-visible { outline: 2px solid var(--smrt-color-primary); outline-offset: 3px; }

  .mode-icon { display: none; line-height: 0; }
  :global(html[data-color-scheme="light"]) .mode-dark,
  :global(html:not([data-color-scheme])) .mode-dark,
  :global(html[data-color-scheme="dark"]) .mode-light { display: inline-flex; }

  .hero {
    display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(19rem, 0.7fr);
    gap: clamp(3rem, 8vw, 8rem); align-items: end;
    padding-block: clamp(5rem, 14vh, 10rem) clamp(4rem, 10vh, 7rem);
  }
  .hero-copy { max-width: 60rem; }
  .eyebrow, .card-label {
    margin: 0 0 0.8rem; color: var(--smrt-color-primary); font: var(--smrt-typography-label-large-font);
    letter-spacing: 0.08em; text-transform: uppercase;
  }
  h1 {
    max-width: 13ch; margin: 0; color: var(--smrt-color-on-background);
    font-family: var(--smrt-typography-display-large-font-family); font-size: clamp(3rem, 6.8vw, 6.5rem);
    font-weight: var(--smrt-typography-display-large-weight); letter-spacing: var(--smrt-typography-display-large-tracking);
    line-height: 0.98; text-wrap: balance;
  }
  .hero-copy > p:last-child {
    max-width: 54rem; margin: 2rem 0 0; color: var(--smrt-color-on-surface-variant);
    font: var(--smrt-typography-body-large-font); font-size: clamp(1rem, 1.4vw, 1.2rem);
  }

  .access-card {
    display: grid; gap: 0.75rem; padding: 1.15rem; border: 1px solid var(--smrt-color-outline-variant);
    border-radius: var(--smrt-radius-sm); background: var(--smrt-color-surface); box-shadow: var(--smrt-elevation-1);
  }
  .card-label { margin-bottom: 0.45rem; color: var(--smrt-color-on-surface-variant); }
  .primary-action, .secondary-action {
    min-height: 3rem; display: inline-flex; align-items: center; justify-content: center;
    padding: 0.65rem 0.8rem; border: 1px solid var(--smrt-color-primary); border-radius: var(--smrt-radius-sm);
    font: var(--smrt-typography-label-large-font); text-decoration: none;
  }
  .primary-action { background: var(--smrt-color-primary); color: var(--smrt-color-on-primary); }
  .primary-action:hover { background: var(--smrt-color-primary-container); color: var(--smrt-color-on-primary-container); }
  .secondary-action { border-color: var(--smrt-color-outline-variant); color: var(--smrt-color-on-surface); }
  .secondary-action:hover { border-color: var(--smrt-color-primary); color: var(--smrt-color-primary); }
  .brief-link {
    width: fit-content; margin-top: 0.35rem; color: var(--smrt-color-on-surface-variant);
    font: var(--smrt-typography-body-small-font); text-decoration-color: var(--smrt-color-outline-variant);
    text-decoration-thickness: 1px; text-underline-offset: 0.22em;
  }
  .brief-link:hover { color: var(--smrt-color-primary); text-decoration-color: var(--smrt-color-primary); }

  .capabilities {
    display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-top: 1px solid var(--smrt-color-outline-variant);
    padding-bottom: clamp(3rem, 8vw, 6rem);
  }
  .capability {
    min-height: 15rem; display: block; padding: 2rem clamp(1.25rem, 3vw, 2.5rem) 2.5rem;
    border-right: 1px solid var(--smrt-color-outline-variant); background: var(--smrt-color-surface);
    color: var(--smrt-color-on-surface); text-decoration: none;
  }
  .capability:first-child { border-left: 1px solid var(--smrt-color-outline-variant); }
  .capability:hover h2 { color: var(--smrt-color-primary); text-decoration-color: var(--smrt-color-primary); }
  .capability h2 {
    width: fit-content; margin: 0; color: var(--smrt-color-on-surface); font: var(--smrt-typography-headline-small-font);
    text-decoration: underline; text-decoration-color: var(--smrt-color-outline-variant);
    text-decoration-thickness: 1px; text-underline-offset: 0.25em;
  }
  .capability p { margin: 2.75rem 0 0; color: var(--smrt-color-on-surface-variant); font: var(--smrt-typography-body-medium-font); }

  @media (max-width: 840px) {
    .hero { grid-template-columns: 1fr; gap: 3.5rem; padding-block: 4.5rem; }
    .access-card { max-width: 30rem; }
    .capabilities { grid-template-columns: 1fr; }
    .capability, .capability:first-child {
      min-height: 0; border-right: 1px solid var(--smrt-color-outline-variant);
      border-bottom: 1px solid var(--smrt-color-outline-variant); border-left: 1px solid var(--smrt-color-outline-variant);
    }
    .capability p { margin-top: 1.5rem; }
  }

  @media (max-width: 520px) {
    .site-header, .hero, .capabilities { width: min(100% - 1.25rem, 86rem); }
    .site-header { min-height: 4.5rem; }
    .wordmark { font-size: 0.95rem; }
    .header-actions { gap: 0.3rem; }
    .icon-link { width: 2.35rem; min-height: 2.35rem; }
    h1 { font-size: clamp(2.65rem, 14vw, 4.25rem); }
    .hero-copy > p:last-child { margin-top: 1.5rem; }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { scroll-behavior: auto !important; transition-duration: 0.01ms !important; }
  }
</style>
