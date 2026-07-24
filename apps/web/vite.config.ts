import { smrtConsumer } from "@happyvertical/smrt-core/consumer-plugin";
import { smrtPlugin } from "@happyvertical/smrt-core/vite-plugin";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import { smrtRuntimePackages } from "./smrt-packages.mjs";

export default defineConfig({
  // `@happyvertical/sql` (pulled in transitively via `resolveDatabase`) ships an
  // optional DuckDB adapter that, since the 0.84 SDK line, reaches its native
  // `@duckdb/node-api` binding through a statically-analyzable `import()` in the
  // package entry. This app runs on Postgres, so that adapter is never executed,
  // but the SSR rollup pass still tries to bundle the `.node` binary and fails.
  // Externalizing the scope leaves it as a runtime import that is never taken.
  // Tracked upstream — see docs/upstream-work.md.
  ssr: {
    external: ["@duckdb/node-api"],
  },
  optimizeDeps: {
    exclude: ["@duckdb/node-api"],
  },
  build: {
    rollupOptions: {
      external: [/^@duckdb\//],
    },
  },
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
      },
    }),
  ],
});
