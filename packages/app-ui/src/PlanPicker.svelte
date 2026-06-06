<script lang="ts">
  import { Check, CreditCard } from "lucide-svelte";

  export interface PlanOption {
    id: string;
    slug: string;
    name: string;
    description: string;
    monthlyPrice: number;
    currency: string;
    features: string[];
    current?: boolean;
  }

  interface Props {
    plans: PlanOption[];
    loading?: boolean;
    onselect?: (plan: PlanOption) => void;
  }

  const { plans, loading = false, onselect }: Props = $props();

  const formatter = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
</script>

<div class="plan-grid">
  {#each plans as plan (plan.id)}
    <article class:current={plan.current} class="plan">
      <div class="plan-header">
        <div>
          <h3>{plan.name}</h3>
          <p>{plan.description}</p>
        </div>
        {#if plan.current}
          <span class="current-label">Current</span>
        {/if}
      </div>

      <div class="price">
        <span>{formatter.format(plan.monthlyPrice)}</span>
        <small>/mo</small>
      </div>

      <ul>
        {#each plan.features as feature}
          <li><Check size={16} /> {feature}</li>
        {/each}
      </ul>

      <button type="button" disabled={loading || plan.current} onclick={() => onselect?.(plan)}>
        <CreditCard size={16} />
        {plan.current ? "Selected" : "Choose plan"}
      </button>
    </article>
  {/each}
</div>

<style>
  .plan-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1rem;
  }

  .plan {
    border: 1px solid var(--smrt-color-outline, #d7dce2);
    border-radius: 8px;
    padding: 1rem;
    background: var(--smrt-color-surface, #fff);
    display: grid;
    gap: 1rem;
  }

  .plan.current {
    border-color: var(--smrt-color-primary, #155eef);
  }

  .plan-header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }

  h3,
  p {
    margin: 0;
  }

  h3 {
    font-size: 1rem;
    line-height: 1.3;
  }

  p,
  li,
  small {
    color: var(--smrt-color-on-surface-variant, #5e6470);
  }

  .current-label {
    align-self: start;
    border-radius: 999px;
    background: var(--smrt-color-primary-container, #dbe8ff);
    color: var(--smrt-color-on-primary-container, #05326b);
    font-size: 0.75rem;
    padding: 0.2rem 0.5rem;
  }

  .price span {
    font-size: 1.8rem;
    font-weight: 700;
  }

  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.5rem;
  }

  li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.92rem;
  }

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: 2.5rem;
    border: 1px solid var(--smrt-color-primary, #155eef);
    border-radius: 6px;
    background: var(--smrt-color-primary, #155eef);
    color: var(--smrt-color-on-primary, #fff);
    cursor: pointer;
    font-weight: 600;
  }

  button:disabled {
    cursor: default;
    opacity: 0.65;
  }
</style>
