import { smrtConsumer } from "@happyvertical/smrt-core/consumer-plugin";
import { smrtPlugin } from "@happyvertical/smrt-core/vite-plugin";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    sveltekit(),
    smrtConsumer({
      packages: [
        "@happyvertical/smrt-users",
        "@happyvertical/smrt-profiles",
        "@happyvertical/smrt-features",
        "@happyvertical/smrt-prompts",
        "@happyvertical/smrt-languages",
        "@happyvertical/smrt-chat",
        "@happyvertical/smrt-app-mcp",
        "@happyvertical/smrt-subscriptions",
        "@happyvertical/smrt-commerce",
        "@happyvertical/smrt-ledgers",
        "@happyvertical/smrt-analytics",
      ],
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
      },
    }),
  ],
});
