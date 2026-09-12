<script lang="ts">
  import WebMcpShellBridge, { type ShellDestination, type ShellTenant } from "./WebMcpShellBridge.svelte";

  let { activePath, destinations, tenants }: {
    activePath: string;
    destinations: readonly ShellDestination[];
    tenants: readonly ShellTenant[];
  } = $props();
  // The parent keys this owner by tenant/principal/authority. Route changes
  // replace request registrations but retain this context's last accepted ack.
  let acknowledgement = $state("");
</script>

{#key activePath}
  <WebMcpShellBridge {activePath} {destinations} {tenants} acknowledge={(message) => acknowledgement = message} />
{/key}
<p class="sr-only" aria-live="polite" aria-atomic="true" data-webmcp-ack>{acknowledgement}</p>

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
