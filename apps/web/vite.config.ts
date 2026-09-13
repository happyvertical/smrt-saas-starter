import { smrtConsumer } from "@happyvertical/smrt-core/consumer-plugin";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import { smrtConsumerPackages } from "./smrt-packages.mjs";

export default defineConfig({
  plugins: [
    sveltekit(),
    smrtConsumer({
      packages: smrtConsumerPackages,
      generateTypes: true,
      svelteKit: {
        objects: ["@happyvertical/smrt-saas-objects:StarterAppSetting"],
      },
    }),
  ],
});
