import { OtlpParser, TraceRepository } from "@nextdoctor/core/services";
import { Effect } from "effect";
import { Hono } from "hono";
import { runtime } from "../runtime";

export const tracesRouter = new Hono();

tracesRouter.post("/v1/client-traces", async (c) => {
  try {
    const body = await c.req.json();

    const program = Effect.gen(function* () {
      const parser = yield* OtlpParser;
      const repo = yield* TraceRepository;

      const spans = yield* parser.parseTraces(body, "client");

      if (spans.length > 0) {
        yield* repo.saveSpans(spans);
      }

      return { success: true, spansProcessed: spans.length };
    });

    const result = await runtime.runPromise(program);
    return c.json(result);
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
    const body = await c.req.json();

    const program = Effect.gen(function* () {
      const parser = yield* OtlpParser;
      const repo = yield* TraceRepository;

      const spans = yield* parser.parseTraces(body, "server");

      if (spans.length > 0) {
        yield* repo.saveSpans(spans);
      }

      return { success: true, spansProcessed: spans.length };
    });

    const result = await runtime.runPromise(program);
    return c.json(result);
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
