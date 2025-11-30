import { Schema } from "effect";
import type { KeyValue } from "./Span";

export interface Metric {
  readonly name: string;
  readonly type: MetricType;
  readonly dataPoints: ReadonlyArray<DataPoint>;
  readonly source: "client" | "server";
}

export type MetricType = "gauge" | "sum" | "histogram";

export interface DataPoint {
  readonly value: number;
  readonly timeUnixNano: string;
  readonly attributes: ReadonlyArray<KeyValue>;
}

export interface HistogramDataPoint extends DataPoint {
  readonly count: number;
  readonly sum: number;
  readonly bucketCounts: ReadonlyArray<number>;
  readonly explicitBounds: ReadonlyArray<number>;
}

export const DataPointSchema = Schema.Struct({
  value: Schema.Number,
  timeUnixNano: Schema.String,
  attributes: Schema.Array(
    Schema.Struct({
      key: Schema.String,
      value: Schema.Unknown,
    }),
  ),
});

export const HistogramDataPointSchema = Schema.extend(
  DataPointSchema,
  Schema.Struct({
    count: Schema.Number,
    sum: Schema.Number,
    bucketCounts: Schema.Array(Schema.Number),
    explicitBounds: Schema.Array(Schema.Number),
  }),
);

export const MetricSchema = Schema.Struct({
  name: Schema.String,
  type: Schema.Literal("gauge", "sum", "histogram"),
  dataPoints: Schema.Array(DataPointSchema),
  source: Schema.Literal("client", "server"),
});
