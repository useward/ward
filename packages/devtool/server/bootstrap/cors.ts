import type { Hono } from "hono";
import { cors } from "hono/cors";

export function setupCors(app: Hono) {
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
}
