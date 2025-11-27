import type { Effect } from "effect";
import { Context } from "effect";
import type { Span, Trace } from "../domain";
import type { TraceRepositoryError } from "../errors";

export interface ITraceRepository {
  readonly save: (trace: Trace) => Effect.Effect<void, TraceRepositoryError>;
  readonly saveSpans: (
    spans: ReadonlyArray<Span>,
  ) => Effect.Effect<void, TraceRepositoryError>;
  readonly findById: (
    traceId: string,
  ) => Effect.Effect<Trace, TraceRepositoryError>;
  readonly findRecent: (options: {
    readonly limit: number;
    readonly source?: "client" | "server";
  }) => Effect.Effect<ReadonlyArray<Trace>, TraceRepositoryError>;
}

export class TraceRepository extends Context.Tag("@nextdoctor/TraceRepository")<
  TraceRepository,
  ITraceRepository
>() {}
