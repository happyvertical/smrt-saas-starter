<script lang="ts">
  interface Props {
    label: string;
    used: number;
    limit: number;
    unit?: string;
    action?: "observe" | "warn" | "block";
  }

  const { label, used, limit, unit = "", action = "observe" }: Props = $props();
  const percent = $derived(limit <= 0 ? 100 : Math.min((used / limit) * 100, 100));
  const remaining = $derived(Math.max(limit - used, 0));
</script>

<div class="meter" data-action={action}>
  <div class="meter-header">
    <span>{label}</span>
    <strong>{used.toLocaleString()} / {limit.toLocaleString()} {unit}</strong>
  </div>
  <div class="track" aria-label={`${label} usage`}>
    <div class="bar" style={`width: ${percent}%`}></div>
  </div>
  <p>{remaining.toLocaleString()} {unit} remaining</p>
</div>

<style>
  .meter {
    display: grid;
    gap: 0.45rem;
  }

  .meter-header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    font-size: 0.9rem;
  }

  strong {
    white-space: nowrap;
  }

  .track {
    height: 0.55rem;
    border-radius: 999px;
    background: var(--smrt-color-surface-container-highest, #e8ebef);
    overflow: hidden;
  }

  .bar {
    height: 100%;
    border-radius: inherit;
    background: var(--smrt-color-primary, #155eef);
  }

  [data-action="warn"] .bar {
    background: #b76e00;
  }

  [data-action="block"] .bar {
    background: #b42318;
  }

  p {
    margin: 0;
    color: var(--smrt-color-on-surface-variant, #5e6470);
    font-size: 0.82rem;
  }
</style>
