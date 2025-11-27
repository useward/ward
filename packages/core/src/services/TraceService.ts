import { Context, Effect, Option } from "effect";
import type { SpanNode, Trace } from "../domain";
import {
  buildSpanTree,
  getServiceName,
  getTotalDuration,
} from "../domain/Trace";
import { TraceRepository } from "./TraceRepository";

export interface ITraceService {
  readonly getTrace: (
    traceId: string,
  ) => Effect.Effect<Trace, never, TraceRepository>;
  readonly getTraceTree: (
    traceId: string,
  ) => Effect.Effect<ReadonlyArray<SpanNode>, never, TraceRepository>;
  readonly listRecent: (
    limit: number,
  ) => Effect.Effect<ReadonlyArray<TraceWithMetadata>, never, TraceRepository>;
}

export class TraceService extends Context.Tag("@nextdoctor/TraceService")<
  TraceService,
  ITraceService
>() {}

export interface TraceWithMetadata {
  readonly trace: Trace;
  readonly duration: bigint;
  readonly serviceName: string;
  readonly spanCount: number;
}

export const TraceServiceLive = TraceService.of({
  getTrace: (traceId) =>
    Effect.gen(function* () {
      const repo = yield* TraceRepository;
      return yield* repo.findById(traceId);
    }),

  getTraceTree: (traceId) =>
    Effect.gen(function* () {
      const repo = yield* TraceRepository;
      const trace = yield* repo.findById(traceId);
      return buildSpanTree(trace.spans);
    }),

  listRecent: (limit) =>
    Effect.gen(function* () {
      const repo = yield* TraceRepository;
      const traces = yield* repo.findRecent({ limit });

      return traces.map((trace) => ({
        trace,
        duration: getTotalDuration(trace),
        serviceName: Option.getOrElse(getServiceName(trace), () => "unknown"),
        spanCount: trace.spans.length,
      }));
    }),
});
