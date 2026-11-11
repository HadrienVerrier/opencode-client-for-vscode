import { defineConfig } from "vite"
import { fileURLToPath } from "node:url"
import app from "@opencode/app/vite"

export default defineConfig({
  plugins: app,
  publicDir: fileURLToPath(new URL("../app/public", import.meta.url)),
  resolve: {
    alias: {
      // The app's plugin list is this build's: same built-ins, plus the one that opens links in VS Code.
      "@opencode/gui-plugins/renderer": fileURLToPath(new URL("./src/host/plugins.ts", import.meta.url)),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 47800,
  },
  build: {
    outDir: "dist/host",
    assetsDir: "_assets",
    target: "esnext",
    sourcemap: false,
    emptyOutDir: true,
  },
})
