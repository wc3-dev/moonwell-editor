import { svelte } from "@sveltejs/vite-plugin-svelte";
import UnoCSS from "unocss/vite";
import { defineConfig } from "vite";

// "./" keeps the built page's links relative, so it loads from the app's virtual host folder.
export default defineConfig({
  base: "./",
  plugins: [UnoCSS(), svelte()],
  resolve: { dedupe: ["vscode"] },
  worker: { format: "es" },
  server: { port: 5173, strictPort: true },
});
