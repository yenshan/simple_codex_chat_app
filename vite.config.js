import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backend = `http://127.0.0.1:${process.env.PORT || 8087}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: "localhost",
    strictPort: true,
    open: true,
    proxy: {
      "/api": {
        target: backend,
        changeOrigin: true,
      },
    },
  },
});
