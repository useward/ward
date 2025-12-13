import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: [
      "src/index.ts",
      "src/middleware.ts",
      "src/instrumentation.client.ts",
      "src/instrumentation.server.ts",
      "src/server-react.ts",
      "src/turbopack-config.ts",
      "src/session-meta.tsx",
    ],
    format: ["esm"],
    dts: true,
    clean: true,
    external: ["next", "next/server", "next/*", "react", "react/jsx-runtime"],
    noExternal: ["@nextdoctor/shared"],
    platform: "browser",
  },
]);
