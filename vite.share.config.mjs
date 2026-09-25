// Share-lite viewer build. Relative base so a pack works from any folder or URL prefix.
// Runs AFTER the desktop build (dist/ is emptied there); this only clears dist/share/.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist/share",
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      input: "share.html",
    },
  },
});
