import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { SERVER_PORT } from "../../shared/src";

export async function runServer() {
  const honoApp = new Hono();

  honoApp.get("/", (c) => c.text("Hello"));

  const app = serve({ fetch: honoApp.fetch, port: SERVER_PORT });

  process.on("SIGINT", async () => {
    console.log("Closing NextDoctor");
    await app.close();
  });

  return { port: SERVER_PORT };
}
