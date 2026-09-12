<script lang="ts">
  import { Provider } from "@happyvertical/smrt-svelte";
  import { ThemeProvider, themeScript } from "@happyvertical/smrt-ui/themes";
  import "@happyvertical/smrt-ui/themes/styles/happyvertical-fonts.css";
  import "@happyvertical/smrt-ui/themes/styles/happyvertical.css";

  let { children } = $props();

  const themeStorageKey = "smrt-saas-starter-theme";
  const themeBootstrap = themeScript({
    preset: "happyvertical",
    storageKey: themeStorageKey,
  });
</script>

<svelte:head>
  <!-- Split the tag name so Vite does not parse the interpolated bootstrap as source code. -->
  {@html `<scr${"ipt"}>${themeBootstrap}</scr${"ipt"}>`}
</svelte:head>

<Provider webmcp={{ ui: {}, effects: ["read", "write", "destructive"] }}>
  <ThemeProvider preset="happyvertical" storageKey={themeStorageKey}>
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
    background: var(--smrt-color-background);
  }
</style>
