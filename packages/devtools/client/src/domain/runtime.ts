import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import {
  DefaultProfilingServiceConfig,
  ProfilingServiceLive,
  ProfilingServiceTag,
} from "./profiling-service";
import {
  DefaultTelemetryClientConfig,
  TelemetryClientLive,
} from "./telemetry-client";

const MainLayer = Layer.mergeAll(
  ProfilingServiceLive.pipe(
    Layer.provide(DefaultProfilingServiceConfig),
    Layer.provide(TelemetryClientLive),
    Layer.provide(DefaultTelemetryClientConfig),
  ),
);

export type AppServices = Layer.Layer.Success<typeof MainLayer>;

export const AppRuntime = ManagedRuntime.make(MainLayer);

export const getProfilingService = () =>
  AppRuntime.runSync(ProfilingServiceTag);
