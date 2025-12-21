import path from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Hono } from "hono";

export function serveStatics(app: Hono) {
  const filename = fileURLToPath(import.meta.url);
  const dirname = path.dirname(filename);

  app.use("/*", serveStatic({ root: path.join(dirname, "../../dist/ui") }));
  app.get(
    "/*",
    serveStatic({
      root: path.join(dirname, "../dist/ui"),
      path: "index.html",
    }),
  );
}
