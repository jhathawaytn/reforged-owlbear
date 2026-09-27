import { defineConfig } from "vite";
import { resolve } from "path";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svelte()],
  server: {
    // Owlbear Rodeo loads this dev server in an iframe from a different
    // origin (https://www.owlbear.rodeo). Vite's dev server disables CORS
    // by default as of 5.4.12 (CVE-2025-24010) / carried into 4.x installs
    // that pick up the patched minor - without this, Owlbear's "Add a
    // custom extension" fetch fails with "Failed to fetch". Dev-only;
    // production builds are static files with no dev server.
    cors: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        popover: resolve(__dirname, "popover.html"),
      },
    },
  },
});
