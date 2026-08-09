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
      include: ["../../packages/app-objects/src/models/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.spec.ts"],
      generateTypes: true,
      svelteKit: {
        enabled: true,
        routesDir: "src/routes/api/generated",
        objectsDir: "../../packages/app-objects/src/models",
        configPath: "src/lib/server",
        configFileName: "smrt.ts",
        changesRoute: { enabled: false },
        eventsRoute: { enabled: false },
      },
    }),
  ],
});
