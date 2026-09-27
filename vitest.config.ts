import { defineConfig } from "vitest/config";

// Separate from vite.config.ts on purpose - these are pure-function unit
// tests over src/lib/*.ts (rules math), no Svelte component rendering or
// dev-server plugins needed.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
