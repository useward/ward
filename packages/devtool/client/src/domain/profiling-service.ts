import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import { pipe } from "effect/Function"
import * as Layer from "effect/Layer"
import * as PubSub from "effect/PubSub"
import * as Ref from "effect/Ref"
import * as Stream from "effect/Stream"
import { buildFlow, sortFlowsByTime } from "./flow-processing"
import type { RawSpan } from "./span-processing"
import { TelemetryClientService, type TelemetryError, type TelemetryEvent } from "./telemetry-client"
import type { RequestFlow } from "./types"

export class ProfilingServiceConfig extends Context.Tag("ProfilingServiceConfig")<
  ProfilingServiceConfig,
  { readonly debounceMs: number; readonly maxSpansPerTrace: number }
>() {}

export interface SpanProcessingError {
  readonly _tag: "SpanProcessingError"
  readonly message: string
}

export const SpanProcessingError = (message: string): SpanProcessingError => ({
  _tag: "SpanProcessingError",
  message,
})

export type ProfilingError = SpanProcessingError | TelemetryError

interface ProfilingState {
  readonly spans: Map<string, RawSpan>
  readonly traceSpans: Map<string, Set<string>>
  readonly flows: Map<string, RequestFlow>
}

const emptyState = (): ProfilingState => ({
  spans: new Map(),
  traceSpans: new Map(),
  flows: new Map(),
})

const ingestSpan = (state: ProfilingState, span: RawSpan): ProfilingState => {
  state.spans.set(span.id, span)

  if (!state.traceSpans.has(span.traceId)) {
    state.traceSpans.set(span.traceId, new Set())
  }
  state.traceSpans.get(span.traceId)!.add(span.id)

  return state
}

const processFlows = (state: ProfilingState): ReadonlyArray<RequestFlow> => {
  const newFlows = new Map(state.flows)

  for (const [traceId, spanIds] of state.traceSpans) {
    const traceSpanList = [...spanIds]
      .map((id) => state.spans.get(id))
      .filter((s): s is RawSpan => s !== undefined)

    if (traceSpanList.length === 0) continue

    const flow = buildFlow(`trace_${traceId}`, traceSpanList)
    if (flow) {
      newFlows.set(flow.id, flow)
    }
  }

  return sortFlowsByTime([...newFlows.values()])
}

export interface ProfilingService {
  readonly flows: Stream.Stream<ReadonlyArray<RequestFlow>, ProfilingError>
  readonly clear: Effect.Effect<void>
}

export class ProfilingServiceTag extends Context.Tag("ProfilingService")<
  ProfilingServiceTag,
  ProfilingService
>() {}

export const ProfilingServiceLive = Layer.scoped(
  ProfilingServiceTag,
  Effect.gen(function* () {
    const config = yield* ProfilingServiceConfig
    const telemetryClient = yield* TelemetryClientService
    const stateRef = yield* Ref.make(emptyState())
    const flowsPubSub = yield* PubSub.unbounded<ReadonlyArray<RequestFlow>>()

    const processAndPublish = pipe(
      Ref.get(stateRef),
      Effect.map(processFlows),
      Effect.flatMap((flows) => PubSub.publish(flowsPubSub, flows))
    )

    const ingestEvent = (event: TelemetryEvent) =>
      pipe(
        Ref.update(stateRef, (state) => {
          let newState = state
          for (const span of event.spans) {
            newState = ingestSpan(newState, span)
          }
          return newState
        }),
        Effect.zipRight(processAndPublish)
      )

    yield* pipe(
      telemetryClient.events,
      Stream.mapEffect(ingestEvent),
      Stream.runDrain,
      Effect.forkScoped
    )

    const flows = pipe(
      Stream.fromPubSub(flowsPubSub),
      Stream.debounce(Duration.millis(config.debounceMs))
    )

    const clear = Ref.set(stateRef, emptyState())

    return { flows, clear }
  })
)

export const ProfilingServiceConfigLive = (debounceMs: number, maxSpansPerTrace: number) =>
  Layer.succeed(ProfilingServiceConfig, { debounceMs, maxSpansPerTrace })

export const DefaultProfilingServiceConfig = ProfilingServiceConfigLive(500, 1000)
