import { MetricRepositoryError } from "@nextdoctor/core";
import type { Metric } from "@nextdoctor/core/domain";
import { MetricRepository } from "@nextdoctor/core/services";
import Database from "better-sqlite3";
import { Config, Effect, Layer } from "effect";
import { initializeSchema } from "./schema";
import type { MetricRow } from "./types";

const make = Effect.gen(function* () {
  const dbPath = yield* Config.string("DB_PATH").pipe(
    Config.withDefault("./nextdoctor.db"),
  );

  const db = new Database(dbPath);
  initializeSchema(db);

  const insertMetric = db.prepare<
    [
      string, // name
      string, // type
      string, // data_points
      string, // source
    ]
  >(`
    INSERT INTO metrics (name, type, data_points, source)
    VALUES (?, ?, ?, ?)
  `);

  const selectByName = db.prepare<[string, number], MetricRow>(`
    SELECT * FROM metrics 
    WHERE name = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);

  const selectRecent = db.prepare<[string | null, number], MetricRow>(`
    SELECT * FROM metrics
    WHERE (?1 IS NULL OR source = ?1)
    ORDER BY created_at DESC
    LIMIT ?2
  `);

  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      db.close();
    }),
  );

  const rowToMetric = (row: MetricRow): Metric => ({
    name: row.name,
    type: row.type,
    dataPoints: JSON.parse(row.data_points),
    source: row.source,
  });

  return MetricRepository.of({
    save: (metrics) =>
      Effect.try({
        try: () => {
          const transaction = db.transaction(
            (metrics: ReadonlyArray<Metric>) => {
              for (const metric of metrics) {
                insertMetric.run(
                  metric.name,
                  metric.type,
                  JSON.stringify(metric.dataPoints),
                  metric.source,
                );
              }
            },
          );
          transaction(metrics);
        },
        catch: (error) =>
          new MetricRepositoryError({
            message: `Failed to save metrics: ${error}`,
          }),
      }),

    findByName: (name, options) =>
      Effect.try({
        try: () => {
          const rows = selectByName.all(name, options.limit);
          return rows.map(rowToMetric);
        },
        catch: (error) =>
          new MetricRepositoryError({
            message: `Failed to find metrics by name: ${error}`,
          }),
      }),

    findRecent: (options) =>
      Effect.try({
        try: () => {
          const rows = selectRecent.all(options.source || null, options.limit);
          return rows.map(rowToMetric);
        },
        catch: (error) =>
          new MetricRepositoryError({
            message: `Failed to find recent metrics: ${error}`,
          }),
      }),
  });
});

export const MetricRepositoryLive = Layer.scoped(MetricRepository, make);
