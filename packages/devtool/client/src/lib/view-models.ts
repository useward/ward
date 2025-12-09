import type { RequestFlow, FlowType, TraceSpan, SpanCategory } from "@/domain"

export interface FlowTypeConfig {
  readonly label: string
  readonly color: string
}

export const FLOW_TYPE_CONFIG: Record<FlowType, FlowTypeConfig> = {
  "page-load": { label: "Page", color: "bg-green-600" },
  navigation: { label: "Nav", color: "bg-blue-600" },
  "api-call": { label: "API", color: "bg-purple-600" },
  background: { label: "BG", color: "bg-gray-600" },
}

export interface SpanColorConfig {
  readonly bg: string
  readonly border: string
  readonly text: string
}

export const CATEGORY_COLORS: Record<SpanCategory, SpanColorConfig> = {
  http: { bg: "bg-blue-500/40", border: "border-blue-500", text: "text-blue-400" },
  render: { bg: "bg-green-500/40", border: "border-green-500", text: "text-green-400" },
  hydration: { bg: "bg-purple-500/40", border: "border-purple-500", text: "text-purple-400" },
  database: { bg: "bg-amber-500/40", border: "border-amber-500", text: "text-amber-400" },
  cache: { bg: "bg-cyan-500/40", border: "border-cyan-500", text: "text-cyan-400" },
  external: { bg: "bg-orange-500/40", border: "border-orange-500", text: "text-orange-400" },
  middleware: { bg: "bg-pink-500/40", border: "border-pink-500", text: "text-pink-400" },
  other: { bg: "bg-gray-500/40", border: "border-gray-500", text: "text-gray-400" },
}

export const ERROR_COLORS: SpanColorConfig = {
  bg: "bg-red-500/50",
  border: "border-red-500",
  text: "text-red-400",
}

export const getSpanColors = (span: TraceSpan): SpanColorConfig =>
  span.status === "error" ? ERROR_COLORS : CATEGORY_COLORS[span.category]

export const countDataFetches = (flow: RequestFlow): number =>
  flow.spans.filter((s) => s.category === "http" || s.category === "database" || s.category === "external").length

export const formatDuration = (ms: number): string => `${ms}ms`

export const formatSessionDuration = (startTime: number): string => {
  const seconds = Math.floor((Date.now() - startTime) / 1000)
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
}

export const getSpanDisplayName = (span: TraceSpan): string => {
  const name = span.name
  if (name.startsWith("HTTP ") || name === "fetch") {
    const url = span.attributes["url.full"] ?? span.attributes["http.url"] ?? span.attributes["http.target"]
    if (url) {
      try {
        const parsed = new URL(String(url), "http://localhost")
        const method = span.attributes["http.request.method"] ?? span.attributes["http.method"] ?? ""
        const path = parsed.pathname.length > 30 ? parsed.pathname.substring(0, 30) + "..." : parsed.pathname
        return method ? `${method} ${path}` : path
      } catch {
        return name
      }
    }
  }
  return name
}
