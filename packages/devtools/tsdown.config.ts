import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["server/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  noExternal: ["@nextdoctor/shared", "@nextdoctor/core"],
});
