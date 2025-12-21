import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  root: __dirname,
  define: {
    "process.env.NODE_ENV": JSON.stringify(mode),
  },
  build: {
    outDir: path.resolve(__dirname, "../dist/ui"),
    emptyOutDir: true,
    minify: mode !== "development",
    sourcemap: mode === "development",
  },
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
