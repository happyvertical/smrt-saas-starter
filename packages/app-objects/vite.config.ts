import { resolve } from "node:path";
import { smrtPlugin } from "@happyvertical/smrt-core/vite-plugin";
import { defineConfig } from "vite";

const packageRoot = import.meta.dirname;

export default defineConfig({
  build: {
    lib: { entry: resolve(packageRoot, "src/index.ts"), formats: ["es"] },
    rollupOptions: {
      external: [/^node:/, /^@happyvertical\//],
      output: { dir: resolve(packageRoot, "dist"), format: "es" },
    },
    sourcemap: true,
    minify: false,
    target: "es2022",
  },
  plugins: [
    smrtPlugin({
      projectRoot: packageRoot,
      include: ["src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.spec.ts"],
      generateTypes: true,
      hmr: false,
    }),
  ],
});
