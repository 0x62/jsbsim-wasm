import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

function getBasePath(): string {
  const value = process.env.DEMO_BASE_PATH;
  if (!value || value === "/") {
    return "/";
  }

  return value.endsWith("/") ? value : `${value}/`;
}

export default defineConfig({
  base: getBasePath(),
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
