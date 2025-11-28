import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/domain/index.ts",
    "src/errors/index.ts",
    "src/services/index.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
});
