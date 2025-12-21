import {
  buildPageSession,
  type NavigationEvent,
  type PageSession,
  type RawSpan,
  sortSessionsByTime,
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

interface ProfilingState {
  readonly spans: Map<string, RawSpan>;
  readonly sessionSpans: Map<string, Set<string>>;
  readonly orphanSpans: Set<string>;
  readonly sessions: Map<string, PageSession>;
  readonly navigationEvents: Map<string, NavigationEvent>;
}

const emptyState = (): ProfilingState => ({
  spans: new Map(),
  sessionSpans: new Map(),
  orphanSpans: new Set(),
  sessions: new Map(),
  navigationEvents: new Map(),
});

const findSessionIdFromParent = (
  state: ProfilingState,
  span: RawSpan,
): string | undefined => {
  if (span.sessionId) return span.sessionId;

  if (span.parentId) {
    const parentSpan = state.spans.get(span.parentId);
    if (parentSpan) {
      const parentSessionId = findSessionIdFromParent(state, parentSpan);
      if (parentSessionId) return parentSessionId;
    }
  }

  return undefined;
};

const assignSpanToSession = (
  state: ProfilingState,
  spanId: string,
): boolean => {
  const span = state.spans.get(spanId);
  if (!span) return false;

  const sessionId = findSessionIdFromParent(state, span);
  if (!sessionId) return false;

  if (!state.sessionSpans.has(sessionId)) {
    state.sessionSpans.set(sessionId, new Set());
  }
  state.sessionSpans.get(sessionId)!.add(spanId);
  state.orphanSpans.delete(spanId);
  return true;
};

const tryAssignOrphans = (state: ProfilingState): void => {
  const orphansToRetry = [...state.orphanSpans];
  for (const spanId of orphansToRetry) {
    assignSpanToSession(state, spanId);
  }
};

const ingestSpan = (state: ProfilingState, span: RawSpan): ProfilingState => {
  state.spans.set(span.id, span);

  const assigned = assignSpanToSession(state, span.id);
  if (!assigned) {
    state.orphanSpans.add(span.id);
  }

  tryAssignOrphans(state);

  return state;
};

const ingestNavigationEvent = (
  state: ProfilingState,
  event: NavigationEvent,
): ProfilingState => {
  state.navigationEvents.set(event.sessionId, event);
  return state;
};

const processSessions = (state: ProfilingState): ReadonlyArray<PageSession> => {
  const newSessions = new Map(state.sessions);

  for (const [sessionId, spanIds] of state.sessionSpans) {
    if (!isValidSessionId(sessionId)) continue;

    const sessionSpanList = [...spanIds]
      .map((id) => state.spans.get(id))
      .filter((s): s is RawSpan => s !== undefined);

    if (sessionSpanList.length === 0) continue;

    const navigationEvent = state.navigationEvents.get(sessionId);
    const session = buildPageSession(
      sessionId,
      sessionSpanList,
      navigationEvent,
    );
    if (session) {
      newSessions.set(session.id, session);
    }
  }

  for (const [sessionId, navEvent] of state.navigationEvents) {
    if (!newSessions.has(sessionId) && !state.sessionSpans.has(sessionId)) {
      const emptySession: PageSession = {
        id: sessionId,
        projectId: navEvent.projectId,
        url: navEvent.url,
        route: navEvent.route,
        navigationType: navEvent.navigationType,
        previousSessionId: navEvent.previousSessionId,
        timing: {
          navigationStart: navEvent.timing.navigationStart,
          serverStart: undefined,
          serverEnd: undefined,
          responseStart: navEvent.timing.responseStart,
          domContentLoaded: navEvent.timing.domContentLoaded,
          load: navEvent.timing.load,
          fcp: navEvent.timing.fcp,
          lcp: navEvent.timing.lcp,
          spaLcp: undefined,
        },
        resources: [],
        rootResources: [],
        stats: {
          totalResources: 0,
          serverResources: 0,
          clientResources: 0,
          totalDuration: 0,
          errorCount: 0,
          cachedCount: 0,
          slowestResource: undefined,
        },
      };
      newSessions.set(sessionId, emptySession);
    }
  }

  return sortSessionsByTime([...newSessions.values()]);
};

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
    const stateRef = yield* Ref.make(emptyState());
    const sessionsPubSub =
      yield* PubSub.unbounded<ReadonlyArray<PageSession>>();

    const processAndPublish = pipe(
      Ref.get(stateRef),
      Effect.map(processSessions),
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

    const clear = Ref.set(stateRef, emptyState());

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
