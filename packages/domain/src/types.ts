export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "OPTIONS"
  | "HEAD";

export type SpanOrigin = "client" | "server";

export type SpanCategory =
  | "http"
  | "render"
  | "hydration"
  | "database"
  | "cache"
  | "external"
  | "middleware"
  | "other";

export type SpanStatus = "ok" | "error" | "unset";

export interface TraceSpan {
  readonly id: string;
  readonly parentId: string | undefined;
  readonly traceId: string;
  readonly name: string;
  readonly origin: SpanOrigin;
  readonly category: SpanCategory;
  readonly startTime: number;
  readonly endTime: number;
  readonly duration: number;
  readonly status: SpanStatus;
  readonly attributes: Record<string, string | number | boolean>;
  readonly children: ReadonlyArray<TraceSpan>;
}

export type ResourceType =
  | "document"
  | "fetch"
  | "api"
  | "database"
  | "external"
  | "rsc"
  | "action"
  | "render"
  | "hydration"
  | "cache"
  | "other";

export type NavigationType = "initial" | "navigation" | "back-forward";

export interface Resource {
  readonly id: string;
  readonly parentId: string | undefined;
  readonly sessionId: string;
  readonly projectId: string;
  readonly type: ResourceType;
  readonly origin: SpanOrigin;
  readonly name: string;
  readonly url: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly duration: number;
  readonly status: SpanStatus;
  readonly statusCode: number | undefined;
  readonly size: number | undefined;
  readonly cached: boolean;
  readonly initiator: string | undefined;
  readonly children: ReadonlyArray<Resource>;
  readonly attributes: Record<string, string | number | boolean>;
}

export interface PageTiming {
  readonly navigationStart: number;
  readonly serverStart: number | undefined;
  readonly serverEnd: number | undefined;
  readonly responseStart: number | undefined;
  readonly domContentLoaded: number | undefined;
  readonly load: number | undefined;
  readonly fcp: number | undefined;
  readonly lcp: number | undefined;
  readonly spaLcp: number | undefined;
}

export interface SessionStats {
  readonly totalResources: number;
  readonly serverResources: number;
  readonly clientResources: number;
  readonly totalDuration: number;
  readonly errorCount: number;
  readonly cachedCount: number;
  readonly slowestResource:
    | { readonly name: string; readonly duration: number }
    | undefined;
}

export interface PageSession {
  readonly id: string;
  readonly projectId: string;
  readonly url: string;
  readonly route: string;
  readonly navigationType: NavigationType;
  readonly previousSessionId: string | undefined;
  readonly timing: PageTiming;
  readonly resources: ReadonlyArray<Resource>;
  readonly rootResources: ReadonlyArray<Resource>;
  readonly stats: SessionStats;
}

export type ProfilingStatus = "idle" | "recording" | "stopped";

export interface NavigationEvent {
  readonly sessionId: string;
  readonly projectId: string;
  readonly url: string;
  readonly route: string;
  readonly navigationType: NavigationType;
  readonly previousSessionId: string | undefined;
  readonly timing: {
    readonly navigationStart: number;
    readonly responseStart: number | undefined;
    readonly domContentLoaded: number | undefined;
    readonly load: number | undefined;
    readonly fcp: number | undefined;
    readonly lcp: number | undefined;
  };
}

export interface ResourceFilterState {
  readonly search: string;
  readonly types: ReadonlyArray<ResourceType>;
  readonly origins: ReadonlyArray<SpanOrigin>;
  readonly minDuration: number;
  readonly showErrorsOnly: boolean;
}

export interface ZoomPanState {
  readonly zoom: number;
  readonly panOffset: number;
  readonly viewportWidth: number;
}
