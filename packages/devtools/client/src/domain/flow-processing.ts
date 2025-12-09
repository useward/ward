import { pipe, Array as A } from "effect"
import type { TraceSpan, RequestFlow, FlowType, FlowPhases, FlowStats, PhaseInfo } from "./types"
import type { RawSpan } from "./span-processing"

const NOISE_PATTERNS = [
  "__nextjs_original-stack-frame",
  "_next/static",
  "_next/image",
  "/g/collect",
  "google-analytics",
  "googletagmanager",
  "favicon.ico",
  ".ico",
  ".png",
  ".jpg",
  ".svg",
  ".woff",
  ".css",
]

const isNoiseSpan = (span: RawSpan): boolean => {
  const name = span.name.toLowerCase()
  const url = String(span.attributes["url.full"] ?? span.attributes["http.url"] ?? span.attributes["http.target"] ?? "").toLowerCase()
  return NOISE_PATTERNS.some((p) => name.includes(p) || url.includes(p))
}

const extractUrl = (spans: ReadonlyArray<RawSpan>): string => {
  for (const span of spans) {
    const url = span.attributes["nextdoctor.request.url"] ?? span.attributes["url.full"] ?? span.attributes["http.url"]
    if (url) return String(url)
  }
  return spans[0]?.name ?? "/unknown"
}

const extractName = (spans: ReadonlyArray<RawSpan>): string => {
  const renderSpan = spans.find((s) => s.category === "render")
  if (renderSpan) {
    const route = renderSpan.attributes["nextdoctor.request.route"] ?? renderSpan.attributes["http.route"] ?? renderSpan.attributes["url.path"]
    if (route) return String(route)
  }
  const url = extractUrl(spans)
  try {
    return new URL(url, "http://localhost").pathname
  } catch {
    return url.split("?")[0]
  }
}

const determineFlowType = (spans: ReadonlyArray<RawSpan>): FlowType => {
  const hasRender = spans.some((s) => s.category === "render")
  const hasServerSpans = spans.some((s) => s.origin === "server")

  if (hasRender && hasServerSpans) {
    return "page-load"
  }

  const urls = spans.map((s) => s.attributes["url.full"] ?? s.attributes["http.url"]).filter(Boolean)
  if (urls.some((u) => String(u).includes("/api/"))) {
    return "api-call"
  }

  return "background"
}

const buildPhase = (spans: ReadonlyArray<TraceSpan>): PhaseInfo => {
  const startTime = Math.min(...spans.map((s) => s.startTime))
  const endTime = Math.max(...spans.map((s) => s.endTime))
  return { startTime, endTime, duration: endTime - startTime, spans }
}

const computePhases = (spans: ReadonlyArray<TraceSpan>): FlowPhases => {
  const serverSpans = spans.filter((s) => s.origin === "server")
  const clientSpans = spans.filter((s) => s.origin === "client")

  const serverDataSpans = serverSpans.filter((s) => s.category === "database" || s.category === "external" || s.category === "http")
  const renderSpans = serverSpans.filter((s) => s.category === "render")
  const hydrationSpans = clientSpans.filter((s) => s.category === "hydration")
  const clientDataSpans = clientSpans.filter((s) => s.category === "http")

  const networkTransfer = serverSpans.length > 0 && clientSpans.length > 0
    ? (() => {
        const serverEnd = Math.max(...serverSpans.map((s) => s.endTime))
        const clientStart = Math.min(...clientSpans.map((s) => s.startTime))
        return clientStart > serverEnd
          ? { startTime: serverEnd, endTime: clientStart, duration: clientStart - serverEnd, spans: [] as ReadonlyArray<TraceSpan> }
          : undefined
      })()
    : undefined

  return {
    serverDataFetch: serverDataSpans.length > 0 ? buildPhase(serverDataSpans) : undefined,
    serverRender: renderSpans.length > 0 ? buildPhase(renderSpans) : undefined,
    hydration: hydrationSpans.length > 0 ? buildPhase(hydrationSpans) : undefined,
    clientDataFetch: clientDataSpans.length > 0 ? buildPhase(clientDataSpans) : undefined,
    networkTransfer,
  }
}

const computeStats = (spans: ReadonlyArray<TraceSpan>): FlowStats => {
  const serverSpans = spans.filter((s) => s.origin === "server")
  const clientSpans = spans.filter((s) => s.origin === "client")
  const errorSpans = spans.filter((s) => s.status === "error")
  const cacheSpans = spans.filter((s) => s.category === "cache")

  const slowestSpan = pipe(
    spans,
    A.reduce(undefined as { name: string; duration: number } | undefined, (acc, span) => {
      if (!acc || span.duration > acc.duration) {
        return { name: span.name, duration: span.duration }
      }
      return acc
    })
  )

  return {
    serverSpanCount: serverSpans.length,
    clientSpanCount: clientSpans.length,
    errorCount: errorSpans.length,
    cacheHits: cacheSpans.filter((s) => s.attributes["cache.hit"] === true).length,
    cacheMisses: cacheSpans.filter((s) => s.attributes["cache.hit"] === false).length,
    slowestSpan,
  }
}

export const buildFlow = (id: string, spans: ReadonlyArray<RawSpan>): RequestFlow | undefined => {
  const validSpans = spans.filter((s) => !isNoiseSpan(s))
  if (validSpans.length === 0) return undefined

  const sortedSpans = [...validSpans].sort((a, b) => a.startTime - b.startTime)
  const startTime = Math.min(...sortedSpans.map((s) => s.startTime))
  const endTime = Math.max(...sortedSpans.map((s) => s.endTime))

  return {
    id,
    type: determineFlowType(sortedSpans),
    name: extractName(sortedSpans),
    url: extractUrl(sortedSpans),
    startTime,
    endTime,
    duration: endTime - startTime,
    spans: sortedSpans,
    phases: computePhases(sortedSpans),
    stats: computeStats(sortedSpans),
  }
}

export const mergeFlows = (existing: Map<string, RequestFlow>, incoming: ReadonlyArray<RequestFlow>): Map<string, RequestFlow> => {
  const result = new Map(existing)
  for (const flow of incoming) {
    result.set(flow.id, flow)
  }
  return result
}

export const sortFlowsByTime = (flows: ReadonlyArray<RequestFlow>): ReadonlyArray<RequestFlow> =>
  [...flows].sort((a, b) => b.startTime - a.startTime)
