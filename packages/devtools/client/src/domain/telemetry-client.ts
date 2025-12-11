import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Queue from "effect/Queue"
import * as Stream from "effect/Stream"
import type { Scope } from "effect/Scope"
import type { OTLPExportTraceServiceRequest } from "./otel-types"
import { extractSpansFromPayload, type RawSpan } from "./span-processing"
import type { SpanOrigin, NavigationEvent, NavigationType } from "./types"

export class TelemetryClientConfig extends Context.Tag("TelemetryClientConfig")<
  TelemetryClientConfig,
  { readonly streamUrl: string }
>() {}

export interface TelemetryEvent {
  readonly origin: SpanOrigin
  readonly spans: ReadonlyArray<RawSpan>
}

export interface TelemetryParseError {
  readonly _tag: "TelemetryParseError"
  readonly message: string
}

export interface TelemetryConnectionError {
  readonly _tag: "TelemetryConnectionError"
  readonly message: string
}

export const TelemetryParseError = (message: string): TelemetryParseError => ({
  _tag: "TelemetryParseError",
  message,
})

export const TelemetryConnectionError = (message: string): TelemetryConnectionError => ({
  _tag: "TelemetryConnectionError",
  message,
})

export type TelemetryError = TelemetryParseError | TelemetryConnectionError

const parseTraceData = (data: string, origin: SpanOrigin): Option.Option<TelemetryEvent> => {
  try {
    const payload: OTLPExportTraceServiceRequest = JSON.parse(data)
    const spans = extractSpansFromPayload(payload, origin)
    return spans.length > 0 ? Option.some({ origin, spans }) : Option.none()
  } catch {
    return Option.none()
  }
}

const parseNavigationEvent = (data: string): Option.Option<NavigationEvent> => {
  try {
    const parsed = JSON.parse(data)
    return Option.some({
      sessionId: parsed.sessionId,
      url: parsed.url,
      route: parsed.route,
      navigationType: parsed.navigationType as NavigationType,
      previousSessionId: parsed.previousSessionId ?? undefined,
      timing: {
        navigationStart: parsed.timing.navigationStart,
        responseStart: parsed.timing.responseStart ?? undefined,
        domContentLoaded: parsed.timing.domContentLoaded ?? undefined,
        load: parsed.timing.load ?? undefined,
      },
    })
  } catch {
    return Option.none()
  }
}

export interface TelemetryClient {
  readonly events: Stream.Stream<TelemetryEvent, TelemetryError>
  readonly navigationEvents: Stream.Stream<NavigationEvent, TelemetryError>
  readonly connectionStatus: Stream.Stream<boolean, never>
}

export class TelemetryClientService extends Context.Tag("TelemetryClientService")<
  TelemetryClientService,
  TelemetryClient
>() {}

const createEventSourceStream = (
  url: string
): Effect.Effect<
  {
    events: Stream.Stream<TelemetryEvent, TelemetryError>
    navigationEvents: Stream.Stream<NavigationEvent, TelemetryError>
    connectionStatus: Stream.Stream<boolean>
  },
  never,
  Scope
> =>
  Effect.gen(function* () {
    const eventQueue = yield* Queue.unbounded<TelemetryEvent>()
    const navigationQueue = yield* Queue.unbounded<NavigationEvent>()
    const connectionQueue = yield* Queue.unbounded<boolean>()

    const offerEvent = (event: TelemetryEvent) => Effect.runSync(Queue.offer(eventQueue, event))
    const offerNavigation = (event: NavigationEvent) => Effect.runSync(Queue.offer(navigationQueue, event))
    const offerConnection = (status: boolean) => Effect.runSync(Queue.offer(connectionQueue, status))

    yield* Effect.acquireRelease(
      Effect.sync(() => {
        const es = new EventSource(url)

        es.onopen = () => offerConnection(true)
        es.onerror = () => offerConnection(false)

        es.addEventListener("client-traces", (event: MessageEvent) => {
          const parsed = parseTraceData(event.data, "client")
          if (Option.isSome(parsed)) {
            offerEvent(parsed.value)
          }
        })

        es.addEventListener("server-traces", (event: MessageEvent) => {
          const parsed = parseTraceData(event.data, "server")
          if (Option.isSome(parsed)) {
            offerEvent(parsed.value)
          }
        })

        es.addEventListener("navigation-event", (event: MessageEvent) => {
          const parsed = parseNavigationEvent(event.data)
          if (Option.isSome(parsed)) {
            offerNavigation(parsed.value)
          }
        })

        return es
      }),
      (es) => Effect.sync(() => es.close())
    )

    return {
      events: Stream.fromQueue(eventQueue),
      navigationEvents: Stream.fromQueue(navigationQueue),
      connectionStatus: Stream.fromQueue(connectionQueue),
    }
  })

export const TelemetryClientLive = Layer.scoped(
  TelemetryClientService,
  Effect.gen(function* () {
    const config = yield* TelemetryClientConfig
    return yield* createEventSourceStream(config.streamUrl)
  })
)

export const TelemetryClientConfigLive = (streamUrl: string) =>
  Layer.succeed(TelemetryClientConfig, { streamUrl })

export const DefaultTelemetryClientConfig = TelemetryClientConfigLive(
  "http://localhost:19393/v1/telemetry-stream"
)
