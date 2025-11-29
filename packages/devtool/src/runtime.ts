import { TraceService, TraceServiceLive } from "@nextdoctor/core/services";
import { ConfigProvider, Layer, ManagedRuntime } from "effect";
import { OtlpParserLive } from "./adapters/OtlpParserLive";
import { MetricRepositoryLive } from "./storage/sqlite/MetricRepositoryLive";
import { TraceRepositoryLive } from "./storage/sqlite/TraceRepositoryLive";

const ConfigLayer = Layer.setConfigProvider(ConfigProvider.fromEnv());

const StorageLayer = Layer.mergeAll(
  TraceRepositoryLive,
  MetricRepositoryLive,
).pipe(Layer.provide(ConfigLayer));

const AdapterLayer = OtlpParserLive;

const ServiceLayer = Layer.provide(
  Layer.succeed(TraceService, TraceServiceLive),
  StorageLayer,
);

export const AppLayer = Layer.mergeAll(
  StorageLayer,
  AdapterLayer,
  ServiceLayer,
);

export const runtime = ManagedRuntime.make(AppLayer);
