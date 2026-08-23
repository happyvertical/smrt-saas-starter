<script lang="ts">
  import { registerFieldPolicyFocusTool } from "@happyvertical/smrt-fields/svelte";
  import { useAdminShell } from "@happyvertical/smrt-svelte/workspace";
  import { onMount } from "svelte";
  import FieldPolicyFocusPanel from "$lib/components/FieldPolicyFocusPanel.svelte";
  import { getStarterAppSettingObjectRef } from "$lib/field-policy";

  const shell = useAdminShell();

  onMount(() =>
    registerFieldPolicyFocusTool(shell, getStarterAppSettingObjectRef(), {
      id: "field-policy",
      label: "Signup form fields",
      description: "Organization defaults and personal signup-form preferences",
      order: 20,
      component: FieldPolicyFocusPanel,
    }),
  );
</script>
