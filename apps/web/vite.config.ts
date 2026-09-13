import { smrtConsumer } from "@happyvertical/smrt-core/consumer-plugin";
import { smrtPlugin } from "@happyvertical/smrt-core/vite-plugin";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import { smrtRuntimePackages } from "./smrt-packages.mjs";

export default defineConfig({
  plugins: [
    sveltekit(),
    smrtConsumer({
      packages: smrtRuntimePackages,
      generateTypes: true,
      svelteKit: true,
    }),
    smrtPlugin({
      include: ["src/**/*.ts"],
      generateTypes: true,
      svelteKit: { enabled: false },
    }),
  ],
});
