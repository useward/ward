import type { Hono } from "hono";
import { cors } from "hono/cors";
import { SESSION_ID_HEADER } from "@nextdoctor/shared";

const ALLOWED_HEADERS = ["Content-Type", "Authorization", SESSION_ID_HEADER];

export function setupCors(app: Hono) {
  app.use(
    "*",
    cors({
      origin: (origin) => origin ?? "http://localhost:3000",
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ALLOWED_HEADERS,
      credentials: true,
    }),
  );
}
