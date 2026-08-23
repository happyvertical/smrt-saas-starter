<script lang="ts">
  let { data, form } = $props();
</script>

<svelte:head>
  <title>Members | SMRT SaaS Starter</title>
</svelte:head>

<section class="settings-page">
  <header>
    <p>Settings</p>
    <h1>Members</h1>
    <p class="description">Invite teammates and keep tenant access up to date.</p>
  </header>

  {#if form?.message}
    <p class="notice" data-kind={form.kind}>{form.message}</p>
  {/if}

  <section class="panel">
    <h2>Tenant access</h2>
    <form method="POST" action="?/invite">
      <label>
        <span>Email</span>
        <input
          name="email"
          type="email"
          autocomplete="email"
          value={form?.kind === "invite" ? (form.email ?? "") : ""}
          disabled={!data.canManageMembers}
          placeholder="teammate@example.com"
          required
        />
      </label>
      <label>
        <span>Role</span>
        <select name="roleSlug" disabled={!data.canManageMembers}>
          <option value="member" selected={form?.kind !== "invite" || form.roleSlug === "member"}>Member</option>
          <option value="admin" selected={form?.kind === "invite" && form.roleSlug === "admin"}>Admin</option>
          <option value="viewer" selected={form?.kind === "invite" && form.roleSlug === "viewer"}>Viewer</option>
        </select>
      </label>
      <button type="submit" disabled={!data.canManageMembers}>Add member</button>
    </form>

    <div class="member-list" aria-label="Tenant members">
      {#each data.members as member (member.membershipId)}
        <div class="member-row">
          <strong>{member.email}</strong>
          <span>{member.roleLabel}</span>
          <span>{member.status}</span>
        </div>
      {:else}
        <p>No members are available for this role.</p>
      {/each}
    </div>
  </section>
</section>

<style>
  .settings-page,
  .settings-page > header,
  .panel,
  form,
  label,
  .member-list {
    display: grid;
    gap: 0.85rem;
  }

  .settings-page p,
  h1,
  h2 {
    margin: 0;
  }

  .settings-page > header > p:first-child,
  .description,
  .member-row span {
    color: var(--smrt-color-on-surface-variant, #5e6470);
  }

  h1 { font-size: 2rem; letter-spacing: 0; line-height: 1.15; }
  h2 { font-size: 1.25rem; letter-spacing: 0; }

  .panel,
  .notice {
    border: 1px solid var(--smrt-color-outline, #d7dce2);
    border-radius: 0.75rem;
    padding: 1rem;
  }

  .member-row {
    display: grid;
    gap: 0.35rem;
    grid-template-columns: minmax(0, 1fr) auto auto;
    padding-top: 0.75rem;
    border-top: 1px solid var(--smrt-color-outline, #d7dce2);
  }

  @media (max-width: 640px) {
    .member-row { grid-template-columns: 1fr; }
  }
</style>
