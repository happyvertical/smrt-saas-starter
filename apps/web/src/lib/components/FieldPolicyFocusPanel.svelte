<script lang="ts">
  import {
    FieldPolicyGearButton,
    FieldPolicyGearProvider,
  } from "@happyvertical/smrt-fields/svelte";
  import {
    getStarterAppSettingDefinition,
    getStarterAppSettingObjectRef,
  } from "$lib/field-policy";
  import { fieldPolicyAdapter } from "$lib/field-policy-client";

  const definition = getStarterAppSettingDefinition();
  const objectRef = getStarterAppSettingObjectRef();
</script>

<section class="focus-panel" aria-label="Signup form fields">
  <h2>Signup form fields</h2>
  <p>Set organization defaults or personalize the signup-access form.</p>
  <FieldPolicyGearProvider
    {objectRef}
    fields={definition.fields}
    adapter={fieldPolicyAdapter}
  >
    <FieldPolicyGearButton label="Configure application settings" />
  </FieldPolicyGearProvider>
</section>

<style>
  .focus-panel {
    display: grid;
    gap: var(--smrt-spacing-3, 0.75rem);
    padding: var(--smrt-spacing-4, 1rem);
  }

  h2,
  p {
    margin: 0;
  }

  p {
    color: var(--smrt-color-on-surface-variant, #5e6470);
  }
</style>
