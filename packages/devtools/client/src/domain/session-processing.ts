import { pipe, Array as A } from "effect"
import type {
  Resource,
  ResourceType,
  PageSession,
  PageTiming,
  SessionStats,
  NavigationType,
  NavigationEvent,
  SpanOrigin,
} from "./types"
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
  const url = String(
    span.attributes["url.full"] ?? span.attributes["http.url"] ?? span.attributes["http.target"] ?? ""
  ).toLowerCase()
  return NOISE_PATTERNS.some((p) => name.includes(p) || url.includes(p))
}

const inferResourceType = (span: RawSpan): ResourceType => {
  const name = span.name.toLowerCase()
  const category = span.category

  if (category === "render" || name.includes("render")) {
    if (name.includes("rsc") || span.attributes["nextjs.kind"] === "rsc") return "rsc"
    return "render"
  }

  if (category === "hydration" || name.includes("hydrat")) return "hydration"
  if (category === "database") return "database"
  if (category === "cache") return "cache"
  if (category === "external") return "external"

  if (span.attributes["nextjs.action"]) return "action"

  const url = String(span.attributes["url.full"] ?? span.attributes["http.url"] ?? "")
  if (url.includes("/api/") || name.includes("/api/")) return "api"

  if (category === "http") return "fetch"

  return "other"
}

const extractUrl = (span: RawSpan): string => {
  return String(
    span.attributes["nextdoctor.request.url"] ??
      span.attributes["url.full"] ??
      span.attributes["http.url"] ??
      span.attributes["http.target"] ??
      ""
  )
}

const extractStatusCode = (span: RawSpan): number | undefined => {
  const code = span.attributes["http.response.status_code"] ?? span.attributes["http.status_code"]
  return typeof code === "number" ? code : undefined
}

const extractSize = (span: RawSpan): number | undefined => {
  const size = span.attributes["http.response.body.size"] ?? span.attributes["http.response_content_length"]
  return typeof size === "number" ? size : undefined
}

const isCached = (span: RawSpan): boolean => {
  const cacheStatus = span.attributes["http.cache.status"] ?? span.attributes["nextjs.cache"]
  if (typeof cacheStatus === "string") {
    return cacheStatus === "HIT" || cacheStatus === "STALE"
  }
  return span.attributes["cache.hit"] === true
}

const extractInitiator = (span: RawSpan): string | undefined => {
  return span.attributes["nextdoctor.fetch.initiator"] as string | undefined
}

const spanToResource = (span: RawSpan, sessionId: string): Resource => ({
  id: span.id,
  parentId: span.parentId,
  sessionId,
  type: inferResourceType(span),
  origin: span.origin,
  name: span.name,
  url: extractUrl(span),
  startTime: span.startTime,
  endTime: span.endTime,
  duration: span.duration,
  status: span.status,
  statusCode: extractStatusCode(span),
  size: extractSize(span),
  cached: isCached(span),
  initiator: extractInitiator(span),
  children: [],
  attributes: span.attributes,
})

const buildResourceTree = (resources: ReadonlyArray<Resource>): ReadonlyArray<Resource> => {
  const resourceMap = new Map<string, Resource & { children: Resource[] }>()
  const resourceIdSet = new Set(resources.map((r) => r.id))

  for (const resource of resources) {
    resourceMap.set(resource.id, { ...resource, children: [] })
  }

  const roots: (Resource & { children: Resource[] })[] = []

  for (const resource of resourceMap.values()) {
    if (resource.parentId && resourceMap.has(resource.parentId)) {
      const parent = resourceMap.get(resource.parentId)!
      parent.children.push(resource)
    } else if (!resource.parentId || !resourceIdSet.has(resource.parentId)) {
      roots.push(resource)
    }
  }

  const sortByStartTime = (items: Resource[]): Resource[] =>
    [...items].sort((a, b) => a.startTime - b.startTime)

  const sortChildren = (resource: Resource): Resource => {
    const mutableChildren = [...resource.children]
    const sortedChildren = sortByStartTime(mutableChildren).map((child) =>
      sortChildren(resourceMap.get(child.id)!)
    )
    return { ...resource, children: sortedChildren }
  }

  return sortByStartTime(roots).map(sortChildren)
}

const flattenResourceTree = (roots: ReadonlyArray<Resource>): ReadonlyArray<Resource> => {
  const result: Resource[] = []
  const traverse = (resources: ReadonlyArray<Resource>) => {
    for (const resource of resources) {
      result.push(resource)
      traverse(resource.children)
    }
  }
  traverse(roots)
  return result
}

const computeStats = (resources: ReadonlyArray<Resource>): SessionStats => {
  const serverResources = resources.filter((r) => r.origin === "server").length
  const clientResources = resources.filter((r) => r.origin === "client").length
  const errorCount = resources.filter((r) => r.status === "error").length
  const cachedCount = resources.filter((r) => r.cached).length

  const totalDuration =
    resources.length > 0
      ? Math.max(...resources.map((r) => r.endTime)) - Math.min(...resources.map((r) => r.startTime))
      : 0

  const slowestResource = pipe(
    resources,
    A.reduce(undefined as { name: string; duration: number } | undefined, (acc, resource) => {
      if (!acc || resource.duration > acc.duration) {
        return { name: resource.name, duration: resource.duration }
      }
      return acc
    })
  )

  return {
    totalResources: resources.length,
    serverResources,
    clientResources,
    totalDuration,
    errorCount,
    cachedCount,
    slowestResource,
  }
}

const computeTiming = (
  resources: ReadonlyArray<Resource>,
  navigationEvent?: NavigationEvent
): PageTiming => {
  const serverResources = resources.filter((r) => r.origin === "server")

  const serverStart = serverResources.length > 0 ? Math.min(...serverResources.map((r) => r.startTime)) : undefined
  const serverEnd = serverResources.length > 0 ? Math.max(...serverResources.map((r) => r.endTime)) : undefined

  return {
    navigationStart: navigationEvent?.timing.navigationStart ?? serverStart ?? 0,
    serverStart,
    serverEnd,
    responseStart: navigationEvent?.timing.responseStart,
    domContentLoaded: navigationEvent?.timing.domContentLoaded,
    load: navigationEvent?.timing.load,
  }
}

const extractRoute = (spans: ReadonlyArray<RawSpan>): string => {
  const sortedByStart = [...spans].sort((a, b) => a.startTime - b.startTime)

  for (const span of sortedByStart) {
    const urlPath = span.attributes["url.path"]
    if (urlPath && typeof urlPath === "string" && urlPath !== "/" && !urlPath.includes("[")) {
      return urlPath
    }
  }

  for (const span of sortedByStart) {
    const url = span.attributes["nextdoctor.request.url"] ?? span.attributes["url.full"] ?? span.attributes["http.url"]
    if (url && typeof url === "string") {
      try {
        const pathname = new URL(url, "http://localhost").pathname
        if (pathname && pathname !== "/" && !pathname.includes("[")) return pathname
      } catch {
        const path = url.split("?")[0]
        if (path && path !== "/" && !path.includes("[")) return path
      }
    }
  }

  for (const span of sortedByStart) {
    const target = span.attributes["http.target"]
    if (target && typeof target === "string") {
      const path = target.split("?")[0]
      if (path && path !== "/" && !path.includes("[")) return path
    }
  }

  for (const span of sortedByStart) {
    const route =
      span.attributes["nextdoctor.request.route"] ??
      span.attributes["http.route"]
    if (route && typeof route === "string" && route !== "/") {
      return route
    }
  }

  const firstSpan = sortedByStart[0]
  if (firstSpan) {
    const name = firstSpan.name
    if (name.includes("/") && !name.startsWith("HTTP") && !name.startsWith("fetch")) {
      return name.split("?")[0]
    }
  }

  return "/unknown"
}

const extractSessionUrl = (spans: ReadonlyArray<RawSpan>): string => {
  for (const span of spans) {
    const url = span.attributes["nextdoctor.request.url"] ?? span.attributes["url.full"] ?? span.attributes["http.url"]
    if (url) return String(url)
  }
  return spans[0]?.name ?? "/unknown"
}

const determineNavigationType = (spans: ReadonlyArray<RawSpan>): NavigationType => {
  const serverSpans = spans.filter((s) => s.origin === "server")
  const clientSpans = spans.filter((s) => s.origin === "client")

  if (serverSpans.length === 0 && clientSpans.length > 0) {
    return "navigation"
  }

  const hasRscRequest = serverSpans.some(
    (s) => s.attributes["nextjs.rsc.request"] === true || s.attributes["nextjs.kind"] === "rsc"
  )

  const hasFullPageRender = serverSpans.some(
    (s) => s.category === "render" && s.attributes["nextjs.kind"] === "page"
  )

  if (hasFullPageRender && !hasRscRequest) {
    return "initial"
  }

  if (hasRscRequest && !hasFullPageRender) {
    return "navigation"
  }

  const hasClientFetchBeforeServer = (() => {
    if (clientSpans.length === 0 || serverSpans.length === 0) return false
    const earliestClient = Math.min(...clientSpans.map((s) => s.startTime))
    const earliestServer = Math.min(...serverSpans.map((s) => s.startTime))
    return earliestClient < earliestServer
  })()

  if (hasClientFetchBeforeServer) {
    return "navigation"
  }

  return "initial"
}

export const buildPageSession = (
  sessionId: string,
  spans: ReadonlyArray<RawSpan>,
  navigationEvent?: NavigationEvent
): PageSession | undefined => {
  const validSpans = spans.filter((s) => !isNoiseSpan(s))
  if (validSpans.length === 0) return undefined

  const sortedSpans = [...validSpans].sort((a, b) => a.startTime - b.startTime)
  const resources = sortedSpans.map((span) => spanToResource(span, sessionId))
  const rootResources = buildResourceTree(resources)
  const flatResources = flattenResourceTree(rootResources)

  const timing = computeTiming(flatResources, navigationEvent)
  const stats = computeStats(flatResources)

  return {
    id: sessionId,
    url: navigationEvent?.url ?? extractSessionUrl(sortedSpans),
    route: navigationEvent?.route ?? extractRoute(sortedSpans),
    navigationType: navigationEvent?.navigationType ?? determineNavigationType(sortedSpans),
    previousSessionId: navigationEvent?.previousSessionId,
    timing,
    resources: flatResources,
    rootResources,
    stats,
  }
}

export const mergeSessionSpans = (
  existingSpans: ReadonlyArray<RawSpan>,
  newSpans: ReadonlyArray<RawSpan>
): ReadonlyArray<RawSpan> => {
  const existingIds = new Set(existingSpans.map((s) => s.id))
  const uniqueNewSpans = newSpans.filter((s) => !existingIds.has(s.id))
  return [...existingSpans, ...uniqueNewSpans]
}

export const sortSessionsByTime = (sessions: ReadonlyArray<PageSession>): ReadonlyArray<PageSession> =>
  [...sessions].sort((a, b) => b.timing.navigationStart - a.timing.navigationStart)

export const filterResources = (
  resources: ReadonlyArray<Resource>,
  filter: {
    search?: string
    types?: ReadonlyArray<ResourceType>
    origins?: ReadonlyArray<SpanOrigin>
    minDuration?: number
    showErrorsOnly?: boolean
  }
): ReadonlyArray<Resource> => {
  return resources.filter((resource) => {
    if (filter.search) {
      const searchLower = filter.search.toLowerCase()
      const matchesName = resource.name.toLowerCase().includes(searchLower)
      const matchesUrl = resource.url.toLowerCase().includes(searchLower)
      if (!matchesName && !matchesUrl) return false
    }

    if (filter.types && filter.types.length > 0 && !filter.types.includes(resource.type)) {
      return false
    }

    if (filter.origins && filter.origins.length > 0 && !filter.origins.includes(resource.origin)) {
      return false
    }

    if (filter.minDuration !== undefined && resource.duration < filter.minDuration) {
      return false
    }

    if (filter.showErrorsOnly && resource.status !== "error") {
      return false
    }

    return true
  })
}

export const findCriticalPath = (rootResources: ReadonlyArray<Resource>): ReadonlyArray<string> => {
  const path: string[] = []

  const findSlowest = (resources: ReadonlyArray<Resource>): Resource | undefined => {
    if (resources.length === 0) return undefined
    return resources.reduce((slowest, current) =>
      current.duration > slowest.duration ? current : slowest
    )
  }

  let current = findSlowest(rootResources)
  while (current) {
    path.push(current.id)
    current = findSlowest(current.children)
  }

  return path
}
