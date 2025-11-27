import type { Effect } from "effect";
import { Context } from "effect";
import type { Span, Trace } from "../domain";

export interface ITraceRepository {
  readonly save: (trace: Trace) => Effect.Effect<void>;
  readonly saveSpans: (spans: ReadonlyArray<Span>) => Effect.Effect<void>;
  readonly findById: (traceId: string) => Effect.Effect<Trace>;
  readonly findRecent: (options: {
    readonly limit: number;
    readonly source?: "client" | "server";
  }) => Effect.Effect<ReadonlyArray<Trace>>;
}

export class TraceRepository extends Context.Tag("@nextdoctor/TraceRepository")<
  TraceRepository,
  ITraceRepository
>() {}
