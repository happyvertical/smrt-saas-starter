<script lang="ts">
  import { FieldPolicyControlPanel } from "@happyvertical/smrt-fields/svelte";
  import FieldPolicyCatalog from "$lib/components/FieldPolicyCatalog.svelte";
  import { fieldPolicyAdapter } from "$lib/field-policy-client";

  let { data } = $props();
</script>

<svelte:head>
  <title>Field settings | SMRT SaaS Starter</title>
</svelte:head>

<section class="page">
  <FieldPolicyControlPanel
    data={data.fieldPolicies}
    adapter={fieldPolicyAdapter}
    catalog={FieldPolicyCatalog}
    baseUrl="/app/settings/field-policies"
    permissions={data.permissions}
  />
</section>

<style>
  .page {
    padding: clamp(1rem, 3vw, 2rem);
    max-width: 1120px;
  }
</style>
