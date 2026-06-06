<script lang="ts">
  import { ExternalLink } from "lucide-svelte";
  import UsageMeter from "./UsageMeter.svelte";

  interface Threshold {
    metricKey: string;
    label: string;
    used: number;
    limit: number;
    unit?: string;
    action: "observe" | "warn" | "block";
  }

  interface Props {
    planName: string;
    status: string;
    periodEnd?: string | null;
    thresholds: Threshold[];
    onportal?: () => void;
  }

  const { planName, status, periodEnd = null, thresholds, onportal }: Props = $props();
</script>

<section class="billing-summary">
  <header>
    <div>
      <p>Current plan</p>
      <h2>{planName}</h2>
      <span>{status}</span>
    </div>
    {#if onportal}
      <button type="button" onclick={onportal}>
        <ExternalLink size={16} />
        Manage
      </button>
    {/if}
  </header>

  {#if periodEnd}
    <p class="period">Renews {new Date(periodEnd).toLocaleDateString()}</p>
  {/if}

  <div class="meters">
    {#each thresholds as threshold (threshold.metricKey)}
      <UsageMeter
        label={threshold.label}
        used={threshold.used}
        limit={threshold.limit}
        unit={threshold.unit}
        action={threshold.action}
      />
    {/each}
  </div>
</section>

<style>
  .billing-summary {
    display: grid;
    gap: 1rem;
  }

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  p,
  h2 {
    margin: 0;
  }

  header p,
  .period {
    color: var(--smrt-color-on-surface-variant, #5e6470);
  }

  h2 {
    font-size: 1.35rem;
    line-height: 1.25;
  }

  span {
    display: inline-flex;
    margin-top: 0.4rem;
    font-size: 0.82rem;
    text-transform: capitalize;
  }

  button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    border: 1px solid var(--smrt-color-outline, #d7dce2);
    border-radius: 6px;
    background: var(--smrt-color-surface, #fff);
    min-height: 2.25rem;
    padding: 0 0.75rem;
    cursor: pointer;
  }

  .meters {
    display: grid;
    gap: 1rem;
  }
</style>
