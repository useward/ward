import { Data } from "effect";

export class InvalidSpanError extends Data.TaggedError("InvalidSpanError")<{
  readonly message: string;
  readonly spanId?: string;
}> {}

export class InvalidTraceError extends Data.TaggedError("InvalidTraceError")<{
  readonly message: string;
  readonly traceId?: string;
}> {}

export class InvalidMetricError extends Data.TaggedError("InvalidMetricError")<{
  readonly message: string;
  readonly metricName?: string;
}> {}

export class TraceRepositoryError extends Data.TaggedError(
  "TraceRepositoryError",
)<{
  readonly message: string;
  readonly traceId?: string;
}> {}

export class MetricRepositoryError extends Data.TaggedError(
  "MetricRepositoryError",
)<{
  readonly message: string;
}> {}
