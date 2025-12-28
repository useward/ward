import {
  createEmptySessionState,
  enforceSessionLimit,
  ingestNavigationEvent,
  ingestSpan,
  type NavigationEvent,
  type PageSession,
  processSessions,
  type Resource,
  type SessionState,
  sortSessionsByTime,
} from "@useward/domain";
import { isValidSessionId } from "@useward/shared";
import type { McpConfig } from "../config";
import { SSEClient, type TelemetryEvent } from "./sse-client";

export class SessionStore {
  private state: SessionState = createEmptySessionState();
  private sseClient: SSEClient;
  private connected = false;
  private updateTimer: NodeJS.Timeout | null = null;
  private debounceMs: number;
  private maxSessions: number;

  constructor(config: McpConfig) {
    this.debounceMs = config.debounceMs;
    this.maxSessions = config.sessionRetention;

    this.sseClient = new SSEClient({
      url: config.devtoolsUrl,
      onTelemetry: (event) => this.handleTelemetry(event),
      onNavigation: (event) => this.handleNavigation(event),
      onConnect: () => {
        this.connected = true;
      },
      onDisconnect: () => {
        this.connected = false;
      },
      onError: (error) => {
        console.error("[Ward MCP]", error.message);
      },
    });
  }

  connect(): void {
    this.sseClient.connect();
  }

  disconnect(): void {
    this.sseClient.disconnect();
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }
  }

  get isConnected(): boolean {
    return this.connected;
  }

  private handleTelemetry(event: TelemetryEvent): void {
    for (const span of event.spans) {
      ingestSpan(this.state, span);
    }
    this.scheduleUpdate();
  }

  private handleNavigation(event: NavigationEvent): void {
    ingestNavigationEvent(this.state, event);
    this.scheduleUpdate();
  }

  private scheduleUpdate(): void {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }
    this.updateTimer = setTimeout(
      () => this.processAndEnforceLimit(),
      this.debounceMs,
    );
  }

  private processAndEnforceLimit(): void {
    processSessions(this.state, isValidSessionId);
    enforceSessionLimit(this.state, this.maxSessions);
  }

  getSessions(): ReadonlyArray<PageSession> {
    return sortSessionsByTime([...this.state.sessions.values()]);
  }

  getSession(sessionId: string): PageSession | undefined {
    return this.state.sessions.get(sessionId);
  }

  getSessionsByRoute(route: string): ReadonlyArray<PageSession> {
    return this.getSessions().filter(
      (s) => s.route === route || s.route.startsWith(route),
    );
  }

  getProjects(): ReadonlyArray<string> {
    const projects = new Set<string>();
    for (const session of this.state.sessions.values()) {
      projects.add(session.projectId);
    }
    return [...projects].sort();
  }

  getSessionsByProject(projectId: string): ReadonlyArray<PageSession> {
    return this.getSessions().filter((s) => s.projectId === projectId);
  }

  getErrors(): ReadonlyArray<{ session: PageSession; resource: Resource }> {
    const errors: { session: PageSession; resource: Resource }[] = [];
    for (const session of this.state.sessions.values()) {
      for (const resource of session.resources) {
        if (
          resource.status === "error" ||
          (resource.statusCode && resource.statusCode >= 400)
        ) {
          errors.push({ session, resource });
        }
      }
    }
    return errors.sort((a, b) => b.resource.startTime - a.resource.startTime);
  }

  getSlowResources(
    thresholdMs: number,
  ): ReadonlyArray<{ session: PageSession; resource: Resource }> {
    const slow: { session: PageSession; resource: Resource }[] = [];
    for (const session of this.state.sessions.values()) {
      for (const resource of session.resources) {
        if (resource.duration >= thresholdMs) {
          slow.push({ session, resource });
        }
      }
    }
    return slow.sort((a, b) => b.resource.duration - a.resource.duration);
  }

  clear(): void {
    this.state = createEmptySessionState();
  }
}
