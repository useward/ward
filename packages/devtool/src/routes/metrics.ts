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

metricsRouter.get("/api/metrics", async (c) => {
  try {
    const limit = Number(c.req.query("limit")) || 100;
    const source = c.req.query("source") as "client" | "server" | undefined;

    const program = Effect.gen(function* () {
      const repo = yield* MetricRepository;
      return yield* repo.findRecent({ limit, source });
    });

    const metrics = await runtime.runPromise(program);
    return c.json({
      metrics,
      count: metrics.length,
      limit,
    });
  } catch (error) {
    console.error("Error fetching metrics:", error);
    return c.json(
      {
        error: "Failed to fetch metrics",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});

metricsRouter.get("/api/metrics/:name", async (c) => {
  try {
    const name = c.req.param("name");
    const limit = Number(c.req.query("limit")) || 100;

    if (!name) {
      return c.json({ error: "Metric name is required" }, 400);
    }

    const program = Effect.gen(function* () {
      const repo = yield* MetricRepository;
      return yield* repo.findByName(name, { limit });
    });

    const metrics = await runtime.runPromise(program);
    return c.json({
      name,
      metrics,
      count: metrics.length,
    });
  } catch (error) {
    console.error("Error fetching metrics by name:", error);
    return c.json(
      {
        error: "Failed to fetch metrics",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});

metricsRouter.get("/api/metrics-names", async (c) => {
  try {
    const source = c.req.query("source") as "client" | "server" | undefined;

    const program = Effect.gen(function* () {
      const repo = yield* MetricRepository;
      const metrics = yield* repo.findRecent({ limit: 1000, source });

      const uniqueNames = Array.from(
        new Set(metrics.map((m) => m.name)),
      ).sort();

      return uniqueNames;
    });

    const names = await runtime.runPromise(program);
    return c.json({
      names,
      count: names.length,
    });
  } catch (error) {
    console.error("Error fetching metric names:", error);
    return c.json(
      {
        error: "Failed to fetch metric names",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
