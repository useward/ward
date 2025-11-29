import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: [
      "src/index.ts",
      "src/middleware.ts",
      "src/instrumentation/client.ts",
      "src/instrumentation/server.ts",
    ],
    format: ["esm"],
    dts: true,
    clean: true,
    external: ["next", "next/server", "next/*"],
    noExternal: ["@nextdoctor/shared"],
  },
]);
