<script lang="ts">
  import { Provider, ThemeProvider } from "@happyvertical/smrt-svelte";

  let { children } = $props();
</script>

<Provider>
  <ThemeProvider>
    {@render children()}
  </ThemeProvider>
</Provider>
