import type { Effect } from "effect";
import { Context } from "effect";
import type { Metric } from "../domain";
import type { MetricRepositoryError } from "../errors";

export interface IMetricRepository {
  readonly save: (
    metrics: ReadonlyArray<Metric>,
  ) => Effect.Effect<void, MetricRepositoryError>;
  readonly findByName: (
    name: string,
    options: { readonly limit: number },
  ) => Effect.Effect<ReadonlyArray<Metric>, MetricRepositoryError>;
  readonly findRecent: (options: {
    readonly limit: number;
    readonly source?: "client" | "server";
  }) => Effect.Effect<ReadonlyArray<Metric>, MetricRepositoryError>;
}

export class MetricRepository extends Context.Tag(
  "@nextdoctor/MetricRepository",
)<MetricRepository, IMetricRepository>() {}
