<script lang="ts">
  import { BarChart3, CreditCard, Gauge, Settings } from "lucide-svelte";

  interface Props {
    name: string;
    size?: number;
  }

  const { name, size = 18 }: Props = $props();
  const icons = {
    "bar-chart": BarChart3,
    "credit-card": CreditCard,
    gauge: Gauge,
    settings: Settings,
  };

  const Icon = $derived(icons[name as keyof typeof icons] ?? BarChart3);
</script>

<Icon {size} />
