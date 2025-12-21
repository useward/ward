import {
  createEmptySessionState,
  ingestNavigationEvent,
  ingestSpan,
  type NavigationEvent,
  type PageSession,
  processSessions,
} from "@nextdoctor/domain";
import { isValidSessionId } from "@nextdoctor/shared";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import {
  TelemetryClientService,
  type TelemetryError,
  type TelemetryEvent,
} from "./telemetry-client";

export class ProfilingServiceConfig extends Context.Tag(
  "ProfilingServiceConfig",
)<
  ProfilingServiceConfig,
  { readonly debounceMs: number; readonly maxSpansPerSession: number }
>() {}

export interface SpanProcessingError {
  readonly _tag: "SpanProcessingError";
  readonly message: string;
}

export const SpanProcessingError = (message: string): SpanProcessingError => ({
  _tag: "SpanProcessingError",
  message,
});

export type ProfilingError = SpanProcessingError | TelemetryError;

export interface ProfilingService {
  readonly sessions: Stream.Stream<ReadonlyArray<PageSession>, ProfilingError>;
  readonly clear: Effect.Effect<void>;
}

export class ProfilingServiceTag extends Context.Tag("ProfilingService")<
  ProfilingServiceTag,
  ProfilingService
>() {}

export const ProfilingServiceLive = Layer.scoped(
  ProfilingServiceTag,
  Effect.gen(function* () {
    const config = yield* ProfilingServiceConfig;
    const telemetryClient = yield* TelemetryClientService;
    const stateRef = yield* Ref.make(createEmptySessionState());
    const sessionsPubSub =
      yield* PubSub.unbounded<ReadonlyArray<PageSession>>();

    const processAndPublish = pipe(
      Ref.get(stateRef),
      Effect.map((state) => processSessions(state, isValidSessionId)),
      Effect.flatMap((sessions) => PubSub.publish(sessionsPubSub, sessions)),
    );

    const ingestTelemetryEvent = (event: TelemetryEvent) =>
      pipe(
        Ref.update(stateRef, (state) => {
          let newState = state;
          for (const span of event.spans) {
            newState = ingestSpan(newState, span);
          }
          return newState;
        }),
        Effect.zipRight(processAndPublish),
      );

    const ingestNavEvent = (event: NavigationEvent) =>
      pipe(
        Ref.update(stateRef, (state) => ingestNavigationEvent(state, event)),
        Effect.zipRight(processAndPublish),
      );

    yield* pipe(
      telemetryClient.events,
      Stream.mapEffect(ingestTelemetryEvent),
      Stream.runDrain,
      Effect.forkScoped,
    );

    yield* pipe(
      telemetryClient.navigationEvents,
      Stream.mapEffect(ingestNavEvent),
      Stream.runDrain,
      Effect.forkScoped,
    );

    const sessions = pipe(
      Stream.fromPubSub(sessionsPubSub),
      Stream.debounce(Duration.millis(config.debounceMs)),
    );

    const clear = Ref.set(stateRef, createEmptySessionState());

    return { sessions, clear };
  }),
);

export const ProfilingServiceConfigLive = (
  debounceMs: number,
  maxSpansPerSession: number,
) => Layer.succeed(ProfilingServiceConfig, { debounceMs, maxSpansPerSession });

export const DefaultProfilingServiceConfig = ProfilingServiceConfigLive(
  500,
  1000,
);
