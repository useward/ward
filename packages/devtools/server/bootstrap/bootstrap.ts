import type { Hono } from "hono";
import { logger } from "hono/logger";
import { setupCors } from "./cors";
import { setupIngestion } from "./ingestion";
import { startServer } from "./start";
import { serveStatics } from "./statics";

export function bootstrap(app: Hono) {
  app.use("*", logger());

  setupCors(app);

  setupIngestion(app);
  serveStatics(app);

  app.get("/health", (c) =>
    c.json({
      status: "ok",
      timestamp: Date.now(),
      service: "ward-collector",
    }),
  );

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

  startServer(app);
}
