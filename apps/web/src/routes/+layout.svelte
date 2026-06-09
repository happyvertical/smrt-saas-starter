<script lang="ts">
  import { Provider, ThemeProvider } from "@happyvertical/smrt-svelte";

  let { children } = $props();
</script>

<Provider>
  <ThemeProvider>
    {@render children()}
  </ThemeProvider>
</Provider>

<style>
  :global(html),
  :global(body) {
    min-height: 100%;
    margin: 0;
  }

  :global(body) {
    background: var(--smrt-color-background, #f7f8fa);
  }
</style>
