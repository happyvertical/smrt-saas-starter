<script lang="ts">
  import { FieldPolicyControlPanel } from "@happyvertical/smrt-fields/svelte";
  import FieldPolicyCatalog from "$lib/components/FieldPolicyCatalog.svelte";
  import { fieldPolicyAdapter } from "$lib/field-policy-client";

  let { data } = $props();
</script>

<svelte:head>
  <title>Signup form fields | SMRT SaaS Starter</title>
</svelte:head>

<section class="settings-page">
  <header>
    <p>Settings</p>
    <h1>Signup form fields</h1>
    <p class="description">
      Customize the form super users use to choose public, invite-only, or request-access signup.
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
  .description {
    color: var(--smrt-color-on-surface-variant, #5e6470);
  }

  h1 {
    font-size: 2rem;
    letter-spacing: 0;
    line-height: 1.15;
  }
</style>
