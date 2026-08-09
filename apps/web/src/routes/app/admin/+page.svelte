<script lang="ts">
  import {
    FieldPolicyGearProvider,
    ObjectForm,
    type ObjectFormFieldSnippetProps,
  } from "@happyvertical/smrt-fields/svelte";
  import { untrack } from "svelte";
  import {
    getStarterAppSettingDefinition,
    getStarterAppSettingObjectRef,
  } from "$lib/field-policy";
  import { fieldPolicyAdapter, starterAppSettingsClient } from "$lib/field-policy-client";

  let { data, form } = $props();

  const inviteRows = $derived(data.invitations ?? []);
  const accessRows = $derived(data.accessRequests ?? []);
  const tenantRows = $derived(data.tenants ?? []);
  const definition = getStarterAppSettingDefinition();
  const objectRef = getStarterAppSettingObjectRef();
  const formFields = {
    value: definition.fields.value,
    metadata: definition.fields.metadata,
  };
  let settingId = $state<string | null>(untrack(() => data.signupAccess.id));
  let record = $state<Record<string, unknown>>({
    value: untrack(() => data.signupAccess.mode),
    metadata: { ...untrack(() => data.signupAccess.metadata) },
  });
  let saveMessage = $state<string | null>(null);
  let saveError = $state<string | null>(null);
  let saving = $state(false);

  function itemId(value: unknown): string | null {
    if (!value || typeof value !== "object") return null;
    const id = (value as Record<string, unknown>).id;
    return typeof id === "string" && id ? id : null;
  }

  async function saveSignupAccess(): Promise<void> {
    saving = true;
    saveError = null;
    saveMessage = null;
    const payload = {
      value: String(record.value ?? "public"),
      metadata: record.metadata ?? {},
    };

    try {
      const saved = settingId
        ? await starterAppSettingsClient.update(settingId, payload)
        : await starterAppSettingsClient.create({ key: "signup.access_mode", ...payload });
      settingId ??= itemId(saved);
      saveMessage = "Signup access updated.";
    } catch (error) {
      saveError = error instanceof Error ? error.message : "Could not update signup access.";
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head>
  <title>Admin | SMRT SaaS Starter</title>
</svelte:head>

<section class="page">
  <header>
    <p>Super user</p>
    <h1>Starter administration</h1>
  </header>

  {#snippet signupModeRenderer(props: ObjectFormFieldSnippetProps)}
    <fieldset class="mode-choices" aria-label="Signup access mode">
      <label class="choice">
        <input
          type="radio"
          name={props.field.name}
          value="public"
          checked={props.value === "public"}
          disabled={props.disabled}
          onchange={() => props.setValue("public")}
        />
        <span>
          <strong>Public</strong>
          <small>Anyone can create a tenant workspace.</small>
        </span>
      </label>
      <label class="choice">
        <input
          type="radio"
          name={props.field.name}
          value="invite-only"
          checked={props.value === "invite-only"}
          disabled={props.disabled}
          onchange={() => props.setValue("invite-only")}
        />
        <span>
          <strong>Invite only</strong>
          <small>New tenant workspaces require a super-user invite.</small>
        </span>
      </label>
      <label class="choice">
        <input
          type="radio"
          name={props.field.name}
          value="request-access"
          checked={props.value === "request-access"}
          disabled={props.disabled}
          onchange={() => props.setValue("request-access")}
        />
        <span>
          <strong>Request access</strong>
          <small>Visitors join a waitlist; a super user approves and graduates them.</small>
        </span>
      </label>
    </fieldset>
  {/snippet}

  {#snippet signupActions()}
    <button type="submit" disabled={saving}>
      {saving ? "Saving…" : "Save access mode"}
    </button>
  {/snippet}

  <div class="grid">
    <section class="panel">
      <h2>Signup access</h2>
      {#if saveError}
        <p class="notice error">{saveError}</p>
      {:else if saveMessage}
        <p class="notice success">{saveMessage}</p>
      {/if}

      <FieldPolicyGearProvider
        {objectRef}
        fields={formFields}
        adapter={fieldPolicyAdapter}
      >
        <ObjectForm
          {objectRef}
          fields={formFields}
          policy={data.signupPolicy}
          bind:value={record}
          isNewRecord={settingId === null}
          disabled={saving}
          showPolicyGear
          renderers={{ value: signupModeRenderer }}
          actions={signupActions}
          onsubmit={saveSignupAccess}
        />
      </FieldPolicyGearProvider>
    </section>

    <section class="panel">
      <h2>Tenant owner invite</h2>
      {#if form?.kind === "inviteTenantOwner" && form.message}
        <p class="notice error">{form.message}</p>
      {:else if form?.kind === "inviteTenantOwner" && form.acceptUrl}
        <div class="notice success">
          <span>Invitation created for {form.email}.</span>
          <a href={form.acceptUrl}>{form.acceptUrl}</a>
        </div>
      {/if}

      <form method="POST" action="?/inviteTenantOwner" class="invite-form">
        <label>
          <span>Email</span>
          <input
            name="email"
            type="email"
            autocomplete="email"
            value={form?.kind === "inviteTenantOwner" ? (form.email ?? "") : ""}
            placeholder="founder@example.com"
            required
          />
        </label>
        <button type="submit">Create invite</button>
      </form>
    </section>
  </div>

  <section class="panel">
    <h2>Tenant owner invitations</h2>
    {#if form?.kind === "revokeInvitation" && form.message}
      <p class="notice error">{form.message}</p>
    {:else if form?.kind === "revokeInvitation" && form.success}
      <p class="notice success">Invitation revoked.</p>
    {/if}

    <div class="table" role="table" aria-label="Tenant owner invitations">
      <div class="row header" role="row">
        <span role="columnheader">Email</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Uses</span>
        <span role="columnheader">Expires</span>
        <span role="columnheader">Action</span>
      </div>
      {#each inviteRows as invitation (invitation.id)}
        <div class="row" role="row">
          <span role="cell">{invitation.email || "Shareable link"}</span>
          <span role="cell">{invitation.status}</span>
          <span role="cell">{invitation.useCount}/{invitation.maxUses || "unlimited"}</span>
          <span role="cell">{new Date(invitation.expiresAt).toLocaleDateString()}</span>
          <span role="cell">
            {#if invitation.status === "pending"}
              <form method="POST" action="?/revokeInvitation">
                <input type="hidden" name="invitationId" value={invitation.id} />
                <button class="secondary" type="submit">Revoke</button>
              </form>
            {:else}
              <span class="muted">Closed</span>
            {/if}
          </span>
        </div>
      {:else}
        <div class="empty">No tenant owner invitations yet.</div>
      {/each}
    </div>
  </section>

  <section class="panel">
    <h2>Access requests</h2>
    {#if form?.kind === "approveAccessRequest" || form?.kind === "declineAccessRequest" || form?.kind === "graduateAccessRequest"}
      {#if form.message}
        <p class="notice error">{form.message}</p>
      {:else if form.success}
        <p class="notice success">
          {#if form.kind === "graduateAccessRequest"}
            Graduated {form.email} into a user.
          {:else if form.kind === "approveAccessRequest"}
            Approved {form.email}.
          {:else}
            Declined {form.email}.
          {/if}
        </p>
      {/if}
    {/if}

    <div class="table" role="table" aria-label="Access requests">
      <div class="row access header" role="row">
        <span role="columnheader">Email</span>
        <span role="columnheader">Name</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Requested</span>
        <span role="columnheader">Actions</span>
      </div>
      {#each accessRows as request (request.id)}
        <div class="row access" role="row">
          <span role="cell">{request.email}</span>
          <span role="cell">{request.name || "—"}</span>
          <span role="cell"><span class="status">{request.status}</span></span>
          <span role="cell">
            {request.requestedAt ? new Date(request.requestedAt).toLocaleDateString() : "—"}
          </span>
          <span role="cell" class="actions">
            <form method="POST" action="?/approveAccessRequest">
              <input type="hidden" name="id" value={request.id} />
              <button class="secondary" type="submit">Approve</button>
            </form>
            <form method="POST" action="?/declineAccessRequest">
              <input type="hidden" name="id" value={request.id} />
              <button class="secondary" type="submit">Decline</button>
            </form>
            <form method="POST" action="?/graduateAccessRequest" class="graduate">
              <input type="hidden" name="id" value={request.id} />
              <select name="existingTenantId" aria-label="Graduate into an existing tenant">
                <option value="">New tenant / user only</option>
                {#each tenantRows as tenant (tenant.id)}
                  <option value={tenant.id}>{tenant.name}</option>
                {/each}
              </select>
              <select name="role" aria-label="Membership role for existing tenant">
                <option value="member">member</option>
                <option value="admin">admin</option>
                <option value="viewer">viewer</option>
              </select>
              <input name="tenantName" placeholder="New tenant name (blank = user only)" />
              <button type="submit">Graduate</button>
            </form>
          </span>
        </div>
      {:else}
        <div class="empty">No open access requests.</div>
      {/each}
    </div>
  </section>
</section>

<style>
  .page {
    display: grid;
    gap: 1rem;
    padding: clamp(1rem, 3vw, 1.5rem);
  }

  header {
    display: grid;
    gap: 0.25rem;
  }

  header p,
  h1,
  h2 {
    margin: 0;
  }

  header p,
  small,
  .muted {
    color: var(--smrt-color-on-surface-variant, #5e6470);
  }

  h1 {
    font-size: 1.8rem;
    line-height: 1.15;
    letter-spacing: 0;
  }

  h2 {
    font-size: 1rem;
    line-height: 1.3;
    letter-spacing: 0;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .panel {
    display: grid;
    gap: 0.9rem;
    border: 1px solid var(--smrt-color-outline, #d7dce2);
    border-radius: 8px;
    background: var(--smrt-color-surface, #fff);
    padding: 1rem;
  }

  form,
  label {
    display: grid;
    gap: 0.55rem;
  }

  .mode-choices {
    display: grid;
    gap: 0.75rem;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .choice {
    grid-template-columns: auto 1fr;
    align-items: start;
    border: 1px solid var(--smrt-color-outline, #d7dce2);
    border-radius: 6px;
    padding: 0.75rem;
  }

  .choice span {
    display: grid;
    gap: 0.15rem;
  }

  input[type="email"] {
    min-height: 2.5rem;
    border: 1px solid var(--smrt-color-outline, #cbd3dc);
    border-radius: 6px;
    padding: 0 0.75rem;
    font: inherit;
  }

  button {
    min-height: 2.4rem;
    border: 1px solid var(--smrt-color-primary, #155eef);
    border-radius: 6px;
    background: var(--smrt-color-primary, #155eef);
    color: var(--smrt-color-on-primary, #fff);
    font: inherit;
    font-weight: 800;
    cursor: pointer;
  }

  button.secondary {
    min-height: 2rem;
    border-color: var(--smrt-color-outline, #d7dce2);
    background: var(--smrt-color-surface, #fff);
    color: inherit;
    font-weight: 700;
  }

  .notice {
    margin: 0;
    border-radius: 6px;
    padding: 0.75rem;
  }

  .notice.success {
    display: grid;
    gap: 0.3rem;
    border: 1px solid #12b76a;
    background: #ecfdf3;
    color: #067647;
  }

  .notice.error {
    border: 1px solid #b42318;
    background: #fff4f2;
    color: #7a271a;
  }

  .notice a {
    color: inherit;
    overflow-wrap: anywhere;
  }

  .table {
    display: grid;
    overflow: hidden;
    border: 1px solid var(--smrt-color-outline, #d7dce2);
    border-radius: 8px;
  }

  .row {
    display: grid;
    grid-template-columns: minmax(9rem, 1.5fr) minmax(5rem, 0.7fr) minmax(5rem, 0.6fr) minmax(6rem, 0.7fr) minmax(5rem, 0.6fr);
    gap: 0.75rem;
    align-items: center;
    padding: 0.65rem 0.75rem;
    border-bottom: 1px solid var(--smrt-color-outline, #d7dce2);
  }

  .row:last-child {
    border-bottom: 0;
  }

  .row.header {
    background: var(--smrt-color-surface-container-low, #f7f8fa);
    font-weight: 800;
  }

  .row span {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .empty {
    padding: 1rem;
    color: var(--smrt-color-on-surface-variant, #5e6470);
  }

  .row.access {
    grid-template-columns: minmax(8rem, 1.3fr) minmax(5rem, 0.9fr) minmax(5rem, 0.55fr) minmax(5rem, 0.6fr) minmax(14rem, 2fr);
  }

  .status {
    text-transform: capitalize;
    color: var(--smrt-color-on-surface-variant, #5e6470);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
  }

  .actions form {
    display: flex;
    gap: 0.3rem;
    align-items: center;
  }

  .actions .graduate select,
  .actions .graduate input {
    min-height: 2rem;
    border: 1px solid var(--smrt-color-outline, #cbd3dc);
    border-radius: 6px;
    padding: 0 0.5rem;
    font: inherit;
  }

  .actions .graduate input {
    min-width: 11rem;
  }

  @media (max-width: 760px) {
    .grid {
      grid-template-columns: 1fr;
    }

    .row,
    .row.access {
      grid-template-columns: 1fr;
    }

    .row.header {
      display: none;
    }
  }
</style>
