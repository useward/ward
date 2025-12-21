import { serve } from "@hono/node-server";
import { SERVER_PORT } from "@ward/shared";
import type { Hono } from "hono";

export function startServer(app: Hono) {
  const servedApp = serve({ fetch: app.fetch, port: SERVER_PORT });

  process.on("SIGINT", async () => {
    console.log("Closing Ward");
    await servedApp.close();
  });
}
