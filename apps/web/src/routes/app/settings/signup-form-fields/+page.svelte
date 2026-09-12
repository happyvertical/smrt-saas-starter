<script lang="ts">
  import { FieldPolicyControlPanel } from "@happyvertical/smrt-fields/svelte";
  import FieldPolicyCatalog from "$lib/components/FieldPolicyCatalog.svelte";
  import { fieldPolicyAdapter } from "$lib/field-policy-client";

  let { data } = $props();
</script>

<svelte:head>
  <title>Signup form | SMRT SaaS Starter</title>
</svelte:head>

<section class="settings-page">
  <header>
    <p>Settings</p>
    <h1>Signup form</h1>
    <p class="description">
      This does not change the public registration page. It changes the internal form a super user
      uses to choose whether people can join this workspace through public signup, invitations only,
      or access requests.
    </p>
    <p class="help">
      Use the controls below to set a field’s label, help text, default value, and whether it
      appears in the basic or advanced view.
    </p>
  </header>

  <FieldPolicyControlPanel
    data={data.fieldPolicies}
    adapter={fieldPolicyAdapter}
    catalog={FieldPolicyCatalog}
    baseUrl="/app/settings/signup-form-fields"
    permissions={data.permissions}
  />
</section>

<style>
  .settings-page,
  .settings-page > header {
    display: grid;
    gap: 0.85rem;
  }

  .settings-page p,
  h1 {
    margin: 0;
  }

  .settings-page > header > p:first-child,
  .description,
  .help {
    color: var(--smrt-color-on-surface-variant, #5e6470);
  }

  h1 {
    font-size: 2rem;
    letter-spacing: 0;
    line-height: 1.15;
  }
</style>
