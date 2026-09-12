<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>Settings | SMRT SaaS Starter</title>
</svelte:head>

<section class="overview">
  <header>
    <p>Settings</p>
    <h1>{data.settingsHeading}</h1>
    <p class="description">Manage your team, customize the workspace, and configure the starter's signup form.</p>
  </header>

  <div class="cards">
    <a href="/app/settings/members">
      <strong>Members</strong>
      <span>Invite teammates and manage their roles.</span>
    </a>
    <a href="/app/settings/prompts">
      <strong>Prompts</strong>
      <span>Set tenant-specific AI prompt templates.</span>
    </a>
    <a href="/app/settings/languages">
      <strong>Languages</strong>
      <span>Customize the tenant's displayed strings.</span>
    </a>
  </div>
</section>

<style>
  .overview,
  .overview header,
  .cards,
  .cards a {
    display: grid;
    gap: 0.85rem;
  }

  .overview header {
    max-width: 42rem;
  }

  .overview p,
  .overview h1 {
    margin: 0;
  }

  .overview header > p:first-child,
  .description,
  .cards span {
    color: var(--smrt-color-on-surface-variant, #5e6470);
  }

  h1 {
    font-size: 2rem;
    letter-spacing: 0;
    line-height: 1.15;
  }

  .cards {
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  }

  .cards a {
    border: 1px solid var(--smrt-color-outline, #d7dce2);
    border-radius: 0.75rem;
    color: inherit;
    padding: 1rem;
    text-decoration: none;
  }

  .cards a:hover {
    border-color: var(--smrt-color-primary, #155eef);
  }
</style>
