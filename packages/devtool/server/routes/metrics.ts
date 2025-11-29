import { MetricRepository, OtlpParser } from "@nextdoctor/core/services";
import { Effect } from "effect";
import { Hono } from "hono";
import { runtime } from "../runtime";

export const metricsRouter = new Hono();

metricsRouter.post("/v1/client-metrics", async (c) => {
  try {
    const body = await c.req.json();

    const program = Effect.gen(function* () {
      const parser = yield* OtlpParser;
      const repo = yield* MetricRepository;

      const metrics = yield* parser.parseMetrics(body, "client");

      if (metrics.length > 0) {
        yield* repo.save(metrics);
      }

      return { success: true, metricsProcessed: metrics.length };
    });

    const result = await runtime.runPromise(program);
    return c.json(result);
  } catch (error) {
    console.error("Error processing client metrics:", error);
    return c.json(
      {
        success: false,
        error: "Failed to process metrics",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});

metricsRouter.post("/v1/server-metrics", async (c) => {
  try {
    const body = await c.req.json();

    const program = Effect.gen(function* () {
      const parser = yield* OtlpParser;
      const repo = yield* MetricRepository;

      const metrics = yield* parser.parseMetrics(body, "server");

      if (metrics.length > 0) {
        yield* repo.save(metrics);
      }

      return { success: true, metricsProcessed: metrics.length };
    });

    const result = await runtime.runPromise(program);
    return c.json(result);
  } catch (error) {
    console.error("Error processing server metrics:", error);
    return c.json(
      {
        success: false,
        error: "Failed to process metrics",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
