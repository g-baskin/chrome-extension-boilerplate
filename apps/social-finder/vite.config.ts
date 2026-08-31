import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import manifest from "./manifest.json";

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  build: { rollupOptions: { input: { popup: resolve(__dirname, "src/popup/popup.html") } } },
  server: { port: 5175, strictPort: true, hmr: { port: 5175 } },
});
