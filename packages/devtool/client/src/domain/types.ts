export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS" | "HEAD"

export type SpanOrigin = "client" | "server"

export type SpanCategory =
  | "http"
  | "render"
  | "hydration"
  | "database"
  | "cache"
  | "external"
  | "middleware"
  | "other"

export type SpanStatus = "ok" | "error" | "unset"

export interface TraceSpan {
  readonly id: string
  readonly parentId: string | undefined
  readonly traceId: string
  readonly name: string
  readonly origin: SpanOrigin
  readonly category: SpanCategory
  readonly startTime: number
  readonly endTime: number
  readonly duration: number
  readonly status: SpanStatus
  readonly attributes: Record<string, string | number | boolean>
  readonly children: ReadonlyArray<TraceSpan>
}

export type FlowType = "page-load" | "navigation" | "api-call" | "background"

export interface PhaseInfo {
  readonly startTime: number
  readonly endTime: number
  readonly duration: number
  readonly spans: ReadonlyArray<TraceSpan>
}

export interface FlowPhases {
  readonly serverDataFetch?: PhaseInfo
  readonly serverRender?: PhaseInfo
  readonly networkTransfer?: PhaseInfo
  readonly hydration?: PhaseInfo
  readonly clientDataFetch?: PhaseInfo
}

export interface FlowStats {
  readonly serverSpanCount: number
  readonly clientSpanCount: number
  readonly errorCount: number
  readonly cacheHits: number
  readonly cacheMisses: number
  readonly slowestSpan?: { readonly name: string; readonly duration: number }
}

export interface RequestFlow {
  readonly id: string
  readonly type: FlowType
  readonly name: string
  readonly url: string
  readonly startTime: number
  readonly endTime: number
  readonly duration: number
  readonly spans: ReadonlyArray<TraceSpan>
  readonly phases: FlowPhases
  readonly stats: FlowStats
}

export type ProfilingStatus = "idle" | "recording" | "stopped"
