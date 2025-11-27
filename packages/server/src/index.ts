import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { SERVER_PORT } from "../../shared/src";
import { metricsRouter, tracesRouter } from "./routes";

export async function runServer() {
  const app = new Hono();

  app.use("*", logger());
  app.use(
    "*",
    cors({
      origin: (origin) => origin ?? "http://localhost:3000",
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    }),
  );

  app.options("*", (c) =>
    c.text("", 200, {
      "Access-Control-Allow-Origin": c.req.header("Origin") ?? "",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    }),
  );

  app.get("/health", (c) =>
    c.json({
      status: "ok",
      timestamp: Date.now(),
      service: "nextdoctor-collector",
    }),
  );

  app.route("/", tracesRouter);
  app.route("/", metricsRouter);

  app.notFound((c) => c.json({ error: "Not found" }, 404));

  app.onError((err, c) => {
    console.error("Unhandled error:", err);
    return c.json(
      {
        error: "Internal server error",
        details: err.message,
      },
      500,
    );
  });

  const servedApp = serve({ fetch: app.fetch, port: SERVER_PORT });

  process.on("SIGINT", async () => {
    console.log("Closing NextDoctor");
    await servedApp.close();
  });
}
