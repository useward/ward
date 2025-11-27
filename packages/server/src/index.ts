import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { METRICS_ROUTE, SERVER_PORT, TRACES_ROUTE } from "../../shared/src";

export async function runServer() {
  const app = new Hono();

  app.use("*", cors({
    origin: (origin) => origin ?? "http://localhost:3000",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }))

  app.options("*", (c) =>
    c.text("", 200, {
      "Access-Control-Allow-Origin": c.req.header("Origin") ?? "",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    })
  )

  app.post(METRICS_ROUTE, async (request) => {
    return request.text("ok", 200, {
      "Access-Control-Allow-Origin": request.req.header("Origin") ?? "",
      "Access-Control-Allow-Credentials": "true",
    })
  })

  app.post(TRACES_ROUTE, async (request) => {
    return request.text("ok", 200, {
      "Access-Control-Allow-Origin": request.req.header("Origin") ?? "",
      "Access-Control-Allow-Credentials": "true",
    })
  })

  const servedApp = serve({ fetch: app.fetch, port: SERVER_PORT });

  process.on("SIGINT", async () => {
    console.log("Closing NextDoctor");
    await servedApp.close();
  });

  return { port: SERVER_PORT };
}
