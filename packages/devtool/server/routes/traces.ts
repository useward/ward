import { Effect } from "effect";
import { Hono } from "hono";

export const tracesRouter = new Hono();

tracesRouter.post("/v1/client-traces", async (c) => {
  try {
     const _body = await c.req.json();

    const _program = Effect.gen(function* () {
      // sse send
    });

    // const result = await runtime.runPromise(program);
    return c.json({});
  } catch (error) {
    console.error("Error processing client traces:", error);
    return c.json(
      {
        success: false,
        error: "Failed to process traces",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});

tracesRouter.post("/v1/server-traces", async (c) => {
  try {
     const _body = await c.req.json();

    const _program = Effect.gen(function* () {
      // sse send
    });

    // const result = await runtime.runPromise(program);
    return c.json({});
  } catch (error) {
    console.error("Error processing server traces:", error);
    return c.json(
      {
        success: false,
        error: "Failed to process traces",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
