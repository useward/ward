import {
  buildPageSession,
  type NavigationEvent,
  type PageSession,
  type RawSpan,
  type Resource,
  sortSessionsByTime,
} from "@nextdoctor/domain"
import { isValidSessionId } from "@nextdoctor/shared"
import type { McpConfig } from "../config"
import { SSEClient, type TelemetryEvent } from "./sse-client"

interface SessionStoreState {
  spans: Map<string, RawSpan>
  sessionSpans: Map<string, Set<string>>
  orphanSpans: Set<string>
  sessions: Map<string, PageSession>
  navigationEvents: Map<string, NavigationEvent>
}

export class SessionStore {
  private state: SessionStoreState = {
    spans: new Map(),
    sessionSpans: new Map(),
    orphanSpans: new Set(),
    sessions: new Map(),
    navigationEvents: new Map(),
  }

  private sseClient: SSEClient
  private connected = false
  private updateTimer: NodeJS.Timeout | null = null
  private debounceMs: number
  private maxSessions: number

  constructor(config: McpConfig) {
    this.debounceMs = config.debounceMs
    this.maxSessions = config.sessionRetention

    this.sseClient = new SSEClient({
      url: config.devtoolsUrl,
      onTelemetry: (event) => this.handleTelemetry(event),
      onNavigation: (event) => this.handleNavigation(event),
      onConnect: () => {
        this.connected = true
      },
      onDisconnect: () => {
        this.connected = false
      },
      onError: (error) => {
        console.error("[NextDoctor MCP]", error.message)
      },
    })
  }

  connect(): void {
    this.sseClient.connect()
  }

  disconnect(): void {
    this.sseClient.disconnect()
    if (this.updateTimer) {
      clearTimeout(this.updateTimer)
    }
  }

  get isConnected(): boolean {
    return this.connected
  }

  private handleTelemetry(event: TelemetryEvent): void {
    for (const span of event.spans) {
      this.ingestSpan(span)
    }
    this.scheduleUpdate()
  }

  private handleNavigation(event: NavigationEvent): void {
    this.state.navigationEvents.set(event.sessionId, event)
    this.scheduleUpdate()
  }

  private findSessionIdFromParent(span: RawSpan): string | undefined {
    if (span.sessionId) return span.sessionId

    if (span.parentId) {
      const parentSpan = this.state.spans.get(span.parentId)
      if (parentSpan) {
        return this.findSessionIdFromParent(parentSpan)
      }
    }

    return undefined
  }

  private assignSpanToSession(spanId: string): boolean {
    const span = this.state.spans.get(spanId)
    if (!span) return false

    const sessionId = this.findSessionIdFromParent(span)
    if (!sessionId) return false

    if (!this.state.sessionSpans.has(sessionId)) {
      this.state.sessionSpans.set(sessionId, new Set())
    }
    this.state.sessionSpans.get(sessionId)!.add(spanId)
    this.state.orphanSpans.delete(spanId)
    return true
  }

  private tryAssignOrphans(): void {
    const orphansToRetry = [...this.state.orphanSpans]
    for (const spanId of orphansToRetry) {
      this.assignSpanToSession(spanId)
    }
  }

  private ingestSpan(span: RawSpan): void {
    this.state.spans.set(span.id, span)

    const assigned = this.assignSpanToSession(span.id)
    if (!assigned) {
      this.state.orphanSpans.add(span.id)
    }

    this.tryAssignOrphans()
  }

  private scheduleUpdate(): void {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer)
    }
    this.updateTimer = setTimeout(() => this.processSessions(), this.debounceMs)
  }

  private processSessions(): void {
    for (const [sessionId, spanIds] of this.state.sessionSpans) {
      if (!isValidSessionId(sessionId)) continue

      const sessionSpanList = [...spanIds]
        .map((id) => this.state.spans.get(id))
        .filter((s): s is RawSpan => s !== undefined)

      if (sessionSpanList.length === 0) continue

      const navigationEvent = this.state.navigationEvents.get(sessionId)
      const session = buildPageSession(sessionId, sessionSpanList, navigationEvent)
      if (session) {
        this.state.sessions.set(session.id, session)
      }
    }

    for (const [sessionId, navEvent] of this.state.navigationEvents) {
      if (!this.state.sessions.has(sessionId) && !this.state.sessionSpans.has(sessionId)) {
        const emptySession: PageSession = {
          id: sessionId,
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
        }
        this.state.sessions.set(sessionId, emptySession)
      }
    }

    const sessions = this.getSessions()
    if (sessions.length > this.maxSessions) {
      const toRemove = sessions.slice(this.maxSessions)
      for (const session of toRemove) {
        this.state.sessions.delete(session.id)
        this.state.sessionSpans.delete(session.id)
        this.state.navigationEvents.delete(session.id)
      }
    }
  }

  getSessions(): ReadonlyArray<PageSession> {
    return sortSessionsByTime([...this.state.sessions.values()])
  }

  getSession(sessionId: string): PageSession | undefined {
    return this.state.sessions.get(sessionId)
  }

  getSessionsByRoute(route: string): ReadonlyArray<PageSession> {
    return this.getSessions().filter((s) => s.route === route || s.route.startsWith(route))
  }

  getErrors(): ReadonlyArray<{ session: PageSession; resource: Resource }> {
    const errors: { session: PageSession; resource: Resource }[] = []
    for (const session of this.state.sessions.values()) {
      for (const resource of session.resources) {
        if (resource.status === "error" || (resource.statusCode && resource.statusCode >= 400)) {
          errors.push({ session, resource })
        }
      }
    }
    return errors.sort((a, b) => b.resource.startTime - a.resource.startTime)
  }

  getSlowResources(thresholdMs: number): ReadonlyArray<{ session: PageSession; resource: Resource }> {
    const slow: { session: PageSession; resource: Resource }[] = []
    for (const session of this.state.sessions.values()) {
      for (const resource of session.resources) {
        if (resource.duration >= thresholdMs) {
          slow.push({ session, resource })
        }
      }
    }
    return slow.sort((a, b) => b.resource.duration - a.resource.duration)
  }

  clear(): void {
    this.state = {
      spans: new Map(),
      sessionSpans: new Map(),
      orphanSpans: new Set(),
      sessions: new Map(),
      navigationEvents: new Map(),
    }
  }
}
