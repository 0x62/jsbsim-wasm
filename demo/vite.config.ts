import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@sdk": path.resolve(__dirname, "../src/index.ts")
    }
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname, "..")]
    }
  }
});
