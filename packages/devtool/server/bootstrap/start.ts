import { serve } from "@hono/node-server";
import { SERVER_PORT } from "@nextdoctor/shared";
import type { Hono } from "hono";

export function startServer(app: Hono) {
  const servedApp = serve({ fetch: app.fetch, port: SERVER_PORT });

  process.on("SIGINT", async () => {
    console.log("Closing NextDoctor");
    await servedApp.close();
  });
}
