import type { Effect } from "effect";
import { Context } from "effect";
import type { Metric, Span } from "../domain";
import type { InvalidMetricError, InvalidSpanError } from "../errors";

export interface IOtlpParser {
  readonly parseTraces: (
    payload: unknown,
    source: "client" | "server",
  ) => Effect.Effect<ReadonlyArray<Span>, InvalidSpanError>;

  readonly parseMetrics: (
    payload: unknown,
    source: "client" | "server",
  ) => Effect.Effect<ReadonlyArray<Metric>, InvalidMetricError>;
}

export class OtlpParser extends Context.Tag("@nextdoctor/OtlpParser")<
  OtlpParser,
  IOtlpParser
>() {}
