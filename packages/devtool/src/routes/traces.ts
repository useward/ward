import {
  OtlpParser,
  TraceRepository,
  TraceService,
} from "@nextdoctor/core/services";
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

tracesRouter.get("/api/traces", async (c) => {
  try {
    const limit = Number(c.req.query("limit")) || 100;
    const source = c.req.query("source") as "client" | "server" | undefined;

    const program = Effect.gen(function* () {
      const repo = yield* TraceRepository;

      const traces = yield* repo.findRecent({
        limit,
        source,
      });

      return traces;
    });

    const traces = await runtime.runPromise(program);
    return c.json({
      traces,
      count: traces.length,
      limit,
    });
  } catch (error) {
    console.error("Error fetching traces:", error);
    return c.json(
      {
        error: "Failed to fetch traces",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});

tracesRouter.get("/api/traces/:traceId", async (c) => {
  try {
    const traceId = c.req.param("traceId");

    if (!traceId) {
      return c.json({ error: "traceId is required" }, 400);
    }

    const program = Effect.gen(function* () {
      const service = yield* TraceService;
      const trace = yield* service.getTrace(traceId);
      return trace;
    });

    const trace = await runtime.runPromise(program);
    return c.json(trace);
  } catch (error) {
    console.error("Error fetching trace:", error);

    if (error instanceof Error && error.message.includes("not found")) {
      return c.json(
        {
          error: "Trace not found",
          traceId: c.req.param("traceId"),
        },
        404,
      );
    }

    return c.json(
      {
        error: "Failed to fetch trace",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});

tracesRouter.get("/api/traces/:traceId/tree", async (c) => {
  try {
    const traceId = c.req.param("traceId");

    if (!traceId) {
      return c.json({ error: "traceId is required" }, 400);
    }

    const program = Effect.gen(function* () {
      const service = yield* TraceService;
      const tree = yield* service.getTraceTree(traceId);
      return { traceId, tree };
    });

    const result = await runtime.runPromise(program);
    return c.json(result);
  } catch (error) {
    console.error("Error fetching trace tree:", error);

    if (error instanceof Error && error.message.includes("not found")) {
      return c.json(
        {
          error: "Trace not found",
          traceId: c.req.param("traceId"),
        },
        404,
      );
    }

    return c.json(
      {
        error: "Failed to fetch trace tree",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});

tracesRouter.get("/api/traces/recent", async (c) => {
  try {
    const limit = Number(c.req.query("limit")) || 50;

    const program = Effect.gen(function* () {
      const service = yield* TraceService;
      return yield* service.listRecent(limit);
    });

    const traces = await runtime.runPromise(program);
    return c.json({
      traces,
      count: traces.length,
    });
  } catch (error) {
    console.error("Error fetching recent traces:", error);
    return c.json(
      {
        error: "Failed to fetch recent traces",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
