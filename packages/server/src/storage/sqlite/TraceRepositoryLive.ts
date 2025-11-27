import { TraceRepositoryError } from "@nextdoctor/core/errors";
import { Effect, Layer, Config } from "effect";
import Database from "better-sqlite3";
import { TraceRepository } from "@nextdoctor/core/services";
import type { Trace, Span } from "@nextdoctor/core/domain";
import { initializeSchema } from "./schema";
import type { SpanRow, TraceRow } from "./types";

const make = Effect.gen(function* () {
  const dbPath = yield* Config.string("DB_PATH").pipe(
    Config.withDefault("./nextdoctor.db"),
  );

  const db = new Database(dbPath);
  initializeSchema(db);

  const insertSpan = db.prepare<
    [
      string, // trace_id
      string, // span_id
      string | null, // parent_span_id
      string, // name
      number, // kind
      string, // start_time_unix_nano
      string, // end_time_unix_nano
      string, // attributes
      string, // events
      string, // status
      string, // source
    ]
  >(`
    INSERT OR REPLACE INTO spans (
      trace_id, span_id, parent_span_id, name, kind,
      start_time_unix_nano, end_time_unix_nano,
      attributes, events, status, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const selectByTraceId = db.prepare<[string], SpanRow>(`
    SELECT * FROM spans WHERE trace_id = ? ORDER BY start_time_unix_nano ASC
  `);

  const selectRecent = db.prepare<[string | null, number], TraceRow>(`
    SELECT DISTINCT trace_id, source, MIN(start_time_unix_nano) as min_time
    FROM spans
    WHERE (?1 IS NULL OR source = ?1)
    GROUP BY trace_id, source
    ORDER BY min_time DESC
    LIMIT ?2
  `);

  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      db.close();
      console.log("Database connection closed");
    }),
  );

  const rowToSpan = (row: SpanRow): Span => ({
    traceId: row.trace_id,
    spanId: row.span_id,
    parentSpanId: row.parent_span_id,
    name: row.name,
    kind: row.kind,
    startTimeUnixNano: row.start_time_unix_nano,
    endTimeUnixNano: row.end_time_unix_nano,
    attributes: JSON.parse(row.attributes),
    events: JSON.parse(row.events),
    status: JSON.parse(row.status),
    source: row.source,
  });

  return TraceRepository.of({
    save: (trace) =>
      Effect.try({
        try: () => {
          const transaction = db.transaction((spans: ReadonlyArray<Span>) => {
            for (const span of spans) {
              insertSpan.run(
                span.traceId,
                span.spanId,
                span.parentSpanId,
                span.name,
                span.kind,
                span.startTimeUnixNano,
                span.endTimeUnixNano,
                JSON.stringify(span.attributes),
                JSON.stringify(span.events),
                JSON.stringify(span.status),
                span.source,
              );
            }
          });
          transaction(trace.spans);
        },
        catch: (error) =>
          new TraceRepositoryError({
            message: `Failed to save trace: ${error}`,
            traceId: trace.traceId,
          }),
      }),

    saveSpans: (spans) =>
      Effect.try({
        try: () => {
          const transaction = db.transaction((spans: ReadonlyArray<Span>) => {
            for (const span of spans) {
              insertSpan.run(
                span.traceId,
                span.spanId,
                span.parentSpanId,
                span.name,
                span.kind,
                span.startTimeUnixNano,
                span.endTimeUnixNano,
                JSON.stringify(span.attributes),
                JSON.stringify(span.events),
                JSON.stringify(span.status),
                span.source,
              );
            }
          });
          transaction(spans);
        },
        catch: (error) =>
          new TraceRepositoryError({
            message: `Failed to save spans: ${error}`,
            traceId: spans[0]?.traceId,
          }),
      }),

    findById: (traceId) =>
      Effect.gen(function* () {
        const rows = yield* Effect.try({
          try: () => selectByTraceId.all(traceId),
          catch: (error) =>
            new TraceRepositoryError({
              message: `Failed to find trace: ${error}`,
              traceId: traceId,
            }),
        });

        if (rows.length === 0) {
          return yield* Effect.fail(
            new TraceRepositoryError({
              message: `Trace not found: ${traceId}`,
              traceId,
            }),
          );
        }

        const spans = rows.map(rowToSpan);

        return {
          traceId,
          spans,
          source: spans[0]!.source,
        } satisfies Trace;
      }),

    findRecent: (options) =>
      Effect.gen(function* () {
        const traceRows = yield* Effect.try({
          try: () => selectRecent.all(options.source || null, options.limit),
          catch: (error) =>
            new TraceRepositoryError({
              message: `Failed to find traces: ${error}`,
            }),
        });

        if (traceRows.length === 0) {
          return [];
        }

        const traceIds = traceRows.map((row) => row.trace_id);

        const placeholders = traceIds.map(() => "?").join(",");
        const selectSpansByTraceIds = db.prepare<string[], SpanRow>(`
          SELECT * FROM spans 
          WHERE trace_id IN (${placeholders})
          ORDER BY trace_id, start_time_unix_nano ASC
        `);

        const spanRows = yield* Effect.try({
          try: () => selectSpansByTraceIds.all(...traceIds),
          catch: (error) =>
            new TraceRepositoryError({
              message: `Failed to load spans: ${error}`,
            }),
        });

        const spansByTrace = new Map<string, Span[]>();
        for (const row of spanRows) {
          const span = rowToSpan(row);
          if (!spansByTrace.has(span.traceId)) {
            spansByTrace.set(span.traceId, []);
          }
          spansByTrace.get(span.traceId)?.push(span);
        }

        return traceRows.map((row) => ({
          traceId: row.trace_id,
          spans: spansByTrace.get(row.trace_id) || [],
          source: row.source,
        }));
      }),
  });
});

export const TraceRepositoryLive = Layer.scoped(TraceRepository, make);
