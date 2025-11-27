import type { Effect } from "effect";
import { Context } from "effect";
import type { Metric } from "../domain";

export interface IMetricRepository {
  readonly save: (metrics: ReadonlyArray<Metric>) => Effect.Effect<void>;
  readonly findByName: (
    name: string,
    options: { readonly limit: number },
  ) => Effect.Effect<ReadonlyArray<Metric>>;
  readonly findRecent: (options: {
    readonly limit: number;
    readonly source?: "client" | "server";
  }) => Effect.Effect<ReadonlyArray<Metric>>;
}

export class MetricRepository extends Context.Tag(
  "@nextdoctor/MetricRepository",
)<MetricRepository, IMetricRepository>() {}
