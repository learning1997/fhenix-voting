import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Some dependencies in the CoFHE SDK expect Node's `global` to exist.
  define: {
    global: "globalThis",
  },
  // TFHE/WASM ships modern syntax; keep both dev and build targets wide open.
  esbuild: {
    target: "esnext",
  },
  optimizeDeps: {
    // tfhe's WASM loader resolves tfhe_bg.wasm relative to its JS module. Prebundling moves
    // that module into .vite/deps without the adjacent WASM asset, so serve tfhe directly.
    exclude: ["tfhe"],
    esbuildOptions: { target: "esnext" },
  },
  build: {
    target: "esnext",
  },
  // @cofhe/sdk spawns its ZK-proving worker with `new Worker(..., { type: "module" })`.
  // Vite defaults workers to IIFE output, which cannot be code-split, so the worker build fails.
  worker: {
    format: "es",
  },
  server: {
    port: 5173,
  },
});
