import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  root: __dirname,
  build: {
    outDir: path.resolve(__dirname, "../../dist/ui"),
    emptyOutDir: true,
  },
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
  ],
});
