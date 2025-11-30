import { Effect } from "effect";
import { Hono } from "hono";

export const metricsRouter = new Hono();

metricsRouter.post("/v1/client-metrics", async (c) => {
  try {
    const _body = await c.req.json();

    const _program = Effect.gen(function* () {
      // sse send
    });

    // const result = await runtime.runPromise(program);
    return c.json({});
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
     const _body = await c.req.json();

    const _program = Effect.gen(function* () {
      // sse send
    });

    // const result = await runtime.runPromise(program);
    return c.json({});
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
