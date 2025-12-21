import { buildPageSession, sortSessionsByTime } from "./session-processing";
import type { RawSpan } from "./span-processing";
import type { NavigationEvent, PageSession } from "./types";

export interface SessionState {
  readonly spans: Map<string, RawSpan>;
  readonly sessionSpans: Map<string, Set<string>>;
  readonly orphanSpans: Set<string>;
  readonly sessions: Map<string, PageSession>;
  readonly navigationEvents: Map<string, NavigationEvent>;
}

export const createEmptySessionState = (): SessionState => ({
  spans: new Map(),
  sessionSpans: new Map(),
  orphanSpans: new Set(),
  sessions: new Map(),
  navigationEvents: new Map(),
});

export const findSessionIdFromParent = (
  state: SessionState,
  span: RawSpan,
): string | undefined => {
  if (span.sessionId) return span.sessionId;

  if (span.parentId) {
    const parentSpan = state.spans.get(span.parentId);
    if (parentSpan) {
      return findSessionIdFromParent(state, parentSpan);
    }
  }

  return undefined;
};

/**
 * Assigns a span to its session based on session ID lookup.
 * Returns true if assignment was successful.
 */
export const assignSpanToSession = (
  state: SessionState,
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

/**
 * Attempts to assign orphan spans whose parents may now be available.
 */
export const tryAssignOrphans = (state: SessionState): void => {
  const orphansToRetry = [...state.orphanSpans];
  for (const spanId of orphansToRetry) {
    assignSpanToSession(state, spanId);
  }
};

/**
 * Ingests a span into the state, assigning it to a session if possible.
 * Returns the updated state (mutates in place for performance).
 */
export const ingestSpan = (
  state: SessionState,
  span: RawSpan,
): SessionState => {
  state.spans.set(span.id, span);

  const assigned = assignSpanToSession(state, span.id);
  if (!assigned) {
    state.orphanSpans.add(span.id);
  }

  tryAssignOrphans(state);

  return state;
};

export const ingestNavigationEvent = (
  state: SessionState,
  event: NavigationEvent,
): SessionState => {
  state.navigationEvents.set(event.sessionId, event);
  return state;
};

export const createEmptySession = (navEvent: NavigationEvent): PageSession => ({
  id: navEvent.sessionId,
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
});

/**
 * Processes all session spans and navigation events into PageSession objects.
 * Updates state.sessions in place and returns sorted sessions.
 */
export const processSessions = (
  state: SessionState,
  isValidSessionId: (id: string) => boolean,
): ReadonlyArray<PageSession> => {
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
      state.sessions.set(session.id, session);
    }
  }

  for (const [sessionId, navEvent] of state.navigationEvents) {
    if (!state.sessions.has(sessionId) && !state.sessionSpans.has(sessionId)) {
      state.sessions.set(sessionId, createEmptySession(navEvent));
    }
  }

  return sortSessionsByTime([...state.sessions.values()]);
};

/**
 * Enforces a maximum number of sessions by removing the oldest ones.
 * Cleans up related spans and navigation events.
 */
export const enforceSessionLimit = (
  state: SessionState,
  maxSessions: number,
): void => {
  const sessions = sortSessionsByTime([...state.sessions.values()]);
  if (sessions.length <= maxSessions) return;

  const toRemove = sessions.slice(maxSessions);
  for (const session of toRemove) {
    state.sessions.delete(session.id);
    state.sessionSpans.delete(session.id);
    state.navigationEvents.delete(session.id);
  }
};

export const clearSessionState = (state: SessionState): SessionState => {
  state.spans.clear();
  state.sessionSpans.clear();
  state.orphanSpans.clear();
  state.sessions.clear();
  state.navigationEvents.clear();
  return state;
};
