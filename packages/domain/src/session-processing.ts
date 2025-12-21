import type { RawSpan } from "./span-processing";
import type {
  NavigationEvent,
  NavigationType,
  PageSession,
  PageTiming,
  Resource,
  ResourceType,
  SessionStats,
  SpanOrigin,
} from "./types";

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
];

const isNoiseSpan = (span: RawSpan): boolean => {
  const name = span.name.toLowerCase();
  const url = String(
    span.attributes["url.full"] ??
      span.attributes["http.url"] ??
      span.attributes["http.target"] ??
      "",
  ).toLowerCase();
  return NOISE_PATTERNS.some((p) => name.includes(p) || url.includes(p));
};

const inferResourceType = (span: RawSpan): ResourceType => {
  const name = span.name.toLowerCase();
  const category = span.category;

  if (category === "render" || name.includes("render")) {
    if (name.includes("rsc") || span.attributes["nextjs.kind"] === "rsc")
      return "rsc";
    return "render";
  }

  if (category === "hydration" || name.includes("hydrat")) return "hydration";
  if (category === "database") return "database";
  if (category === "cache") return "cache";
  if (category === "external") return "external";

  if (span.attributes["nextjs.action"]) return "action";

  const url = String(
    span.attributes["url.full"] ?? span.attributes["http.url"] ?? "",
  );
  if (url.includes("/api/") || name.includes("/api/")) return "api";

  if (category === "http") return "fetch";

  return "other";
};

const extractUrl = (span: RawSpan): string => {
  return String(
    span.attributes["ward.request.url"] ??
      span.attributes["url.full"] ??
      span.attributes["http.url"] ??
      span.attributes["http.target"] ??
      "",
  );
};

const extractStatusCode = (span: RawSpan): number | undefined => {
  const code =
    span.attributes["http.response.status_code"] ??
    span.attributes["http.status_code"];
  return typeof code === "number" ? code : undefined;
};

const extractSize = (span: RawSpan): number | undefined => {
  const size =
    span.attributes["http.response.body.size"] ??
    span.attributes["http.response_content_length"];
  return typeof size === "number" ? size : undefined;
};

const isCached = (span: RawSpan): boolean => {
  const cacheStatus =
    span.attributes["http.cache.status"] ?? span.attributes["nextjs.cache"];
  if (typeof cacheStatus === "string") {
    return cacheStatus === "HIT" || cacheStatus === "STALE";
  }
  return span.attributes["cache.hit"] === true;
};

const extractInitiator = (span: RawSpan): string | undefined => {
  return span.attributes["ward.fetch.initiator"] as string | undefined;
};

const spanToResource = (
  span: RawSpan,
  sessionId: string,
  projectId: string,
): Resource => ({
  id: span.id,
  parentId: span.parentId,
  sessionId,
  projectId,
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
});

const buildResourceTree = (
  resources: ReadonlyArray<Resource>,
): ReadonlyArray<Resource> => {
  const resourceMap = new Map<string, Resource & { children: Resource[] }>();
  const resourceIdSet = new Set(resources.map((r) => r.id));

  for (const resource of resources) {
    resourceMap.set(resource.id, { ...resource, children: [] });
  }

  const roots: (Resource & { children: Resource[] })[] = [];

  for (const resource of resourceMap.values()) {
    if (resource.parentId && resourceMap.has(resource.parentId)) {
      const parent = resourceMap.get(resource.parentId);
      if (parent) {
        parent.children.push(resource);
      }
    } else if (!resource.parentId || !resourceIdSet.has(resource.parentId)) {
      roots.push(resource);
    }
  }

  const sortByStartTime = (items: Resource[]): Resource[] =>
    [...items].sort((a, b) => a.startTime - b.startTime);

  const sortChildren = (resource: Resource): Resource => {
    const mutableChildren = [...resource.children];
    const sortedChildren = sortByStartTime(mutableChildren)
      .map((child) => resourceMap.get(child.id))
      .filter(
        (child): child is Resource & { children: Resource[] } =>
          child !== undefined,
      )
      .map(sortChildren);
    return { ...resource, children: sortedChildren };
  };

  return sortByStartTime(roots).map(sortChildren);
};

const flattenResourceTree = (
  roots: ReadonlyArray<Resource>,
): ReadonlyArray<Resource> => {
  const result: Resource[] = [];
  const traverse = (resources: ReadonlyArray<Resource>) => {
    for (const resource of resources) {
      result.push(resource);
      traverse(resource.children);
    }
  };
  traverse(roots);
  return result;
};

const computeStats = (resources: ReadonlyArray<Resource>): SessionStats => {
  if (resources.length === 0) {
    return {
      totalResources: 0,
      serverResources: 0,
      clientResources: 0,
      totalDuration: 0,
      errorCount: 0,
      cachedCount: 0,
      slowestResource: undefined,
    };
  }

  const firstResource = resources[0] as Resource;
  let serverResources = 0;
  let clientResources = 0;
  let errorCount = 0;
  let cachedCount = 0;
  let minStartTime = firstResource.startTime;
  let maxEndTime = firstResource.endTime;
  let slowestResource: { name: string; duration: number } | undefined;

  for (const resource of resources) {
    if (resource.origin === "server") {
      serverResources++;
    } else {
      clientResources++;
    }

    if (resource.status === "error") {
      errorCount++;
    }

    if (resource.cached) {
      cachedCount++;
    }

    if (resource.startTime < minStartTime) {
      minStartTime = resource.startTime;
    }

    if (resource.endTime > maxEndTime) {
      maxEndTime = resource.endTime;
    }

    if (!slowestResource || resource.duration > slowestResource.duration) {
      slowestResource = { name: resource.name, duration: resource.duration };
    }
  }

  return {
    totalResources: resources.length,
    serverResources,
    clientResources,
    totalDuration: maxEndTime - minStartTime,
    errorCount,
    cachedCount,
    slowestResource,
  };
};

const computeSpaLcp = (
  resources: ReadonlyArray<Resource>,
  navigationStart: number,
): number | undefined => {
  const rscResources = resources.filter(
    (r) =>
      r.type === "rsc" || r.name.includes("_rsc") || r.url.includes("_rsc"),
  );

  if (rscResources.length === 0) return undefined;

  const lastRscEnd = Math.max(...rscResources.map((r) => r.endTime));
  return lastRscEnd - navigationStart;
};

const computeTiming = (
  resources: ReadonlyArray<Resource>,
  navigationEvent?: NavigationEvent,
  navigationType?: "initial" | "navigation" | "back-forward",
): PageTiming => {
  const serverResources = resources.filter((r) => r.origin === "server");
  const clientResources = resources.filter((r) => r.origin === "client");

  const serverStart =
    serverResources.length > 0
      ? Math.min(...serverResources.map((r) => r.startTime))
      : undefined;
  const serverEnd =
    serverResources.length > 0
      ? Math.max(...serverResources.map((r) => r.endTime))
      : undefined;

  const minResourceStart =
    resources.length > 0
      ? Math.min(...resources.map((r) => r.startTime))
      : undefined;
  const navigationStart = minResourceStart ?? serverStart ?? 0;

  const navTiming = navigationEvent?.timing;
  const responseStartRelative = navTiming?.responseStart;

  let responseStart: number | undefined;
  let domContentLoaded: number | undefined;
  let load: number | undefined;
  let fcp: number | undefined;
  let lcp: number | undefined;

  if (
    serverEnd !== undefined &&
    responseStartRelative !== undefined &&
    responseStartRelative > 0
  ) {
    const firstClientStart =
      clientResources.length > 0
        ? Math.min(...clientResources.map((r) => r.startTime))
        : undefined;

    const browserAnchor = firstClientStart ?? serverEnd;

    const browserTimelineStart = responseStartRelative;

    responseStart = browserAnchor;

    if (navTiming?.domContentLoaded !== undefined) {
      domContentLoaded =
        browserAnchor + (navTiming.domContentLoaded - browserTimelineStart);
    }
    if (navTiming?.load !== undefined) {
      load = browserAnchor + (navTiming.load - browserTimelineStart);
    }
    if (navTiming?.fcp !== undefined) {
      fcp = browserAnchor + (navTiming.fcp - browserTimelineStart);
    }
    if (navTiming?.lcp !== undefined) {
      lcp = browserAnchor + (navTiming.lcp - browserTimelineStart);
    }
  }

  const isSpNavigation =
    navigationType === "navigation" || navigationType === "back-forward";
  const spaLcp = isSpNavigation
    ? computeSpaLcp(resources, navigationStart)
    : undefined;

  return {
    navigationStart,
    serverStart,
    serverEnd,
    responseStart,
    domContentLoaded,
    load,
    fcp,
    lcp,
    spaLcp,
  };
};

const extractRoute = (spans: ReadonlyArray<RawSpan>): string => {
  const sortedByStart = [...spans].sort((a, b) => a.startTime - b.startTime);

  for (const span of sortedByStart) {
    const urlPath = span.attributes["url.path"];
    if (
      urlPath &&
      typeof urlPath === "string" &&
      urlPath !== "/" &&
      !urlPath.includes("[")
    ) {
      return urlPath;
    }
  }

  for (const span of sortedByStart) {
    const url =
      span.attributes["ward.request.url"] ??
      span.attributes["url.full"] ??
      span.attributes["http.url"];
    if (url && typeof url === "string") {
      try {
        const pathname = new URL(url, "http://localhost").pathname;
        if (pathname && pathname !== "/" && !pathname.includes("["))
          return pathname;
      } catch {
        const path = url.split("?")[0];
        if (path && path !== "/" && !path.includes("[")) return path;
      }
    }
  }

  for (const span of sortedByStart) {
    const target = span.attributes["http.target"];
    if (target && typeof target === "string") {
      const path = target.split("?")[0];
      if (path && path !== "/" && !path.includes("[")) return path;
    }
  }

  for (const span of sortedByStart) {
    const route =
      span.attributes["ward.request.route"] ?? span.attributes["http.route"];
    if (route && typeof route === "string" && route !== "/") {
      return route;
    }
  }

  const firstSpan = sortedByStart[0];
  if (firstSpan) {
    const name = firstSpan.name;
    if (
      name.includes("/") &&
      !name.startsWith("HTTP") &&
      !name.startsWith("fetch")
    ) {
      return name.split("?")[0] ?? name;
    }
  }

  return "/unknown";
};

const extractSessionUrl = (spans: ReadonlyArray<RawSpan>): string => {
  for (const span of spans) {
    const url =
      span.attributes["ward.request.url"] ??
      span.attributes["url.full"] ??
      span.attributes["http.url"];
    if (url) return String(url);
  }
  return spans[0]?.name ?? "/unknown";
};

const determineNavigationType = (
  spans: ReadonlyArray<RawSpan>,
): NavigationType => {
  const serverSpans = spans.filter((s) => s.origin === "server");
  const clientSpans = spans.filter((s) => s.origin === "client");

  if (serverSpans.length === 0 && clientSpans.length > 0) {
    return "navigation";
  }

  const hasRscRequest = serverSpans.some(
    (s) =>
      s.attributes["nextjs.rsc.request"] === true ||
      s.attributes["nextjs.kind"] === "rsc",
  );

  const hasFullPageRender = serverSpans.some(
    (s) => s.category === "render" && s.attributes["nextjs.kind"] === "page",
  );

  if (hasFullPageRender && !hasRscRequest) {
    return "initial";
  }

  if (hasRscRequest && !hasFullPageRender) {
    return "navigation";
  }

  const hasClientFetchBeforeServer = (() => {
    if (clientSpans.length === 0 || serverSpans.length === 0) return false;
    const earliestClient = Math.min(...clientSpans.map((s) => s.startTime));
    const earliestServer = Math.min(...serverSpans.map((s) => s.startTime));
    return earliestClient < earliestServer;
  })();

  if (hasClientFetchBeforeServer) {
    return "navigation";
  }

  return "initial";
};

const extractProjectId = (
  spans: ReadonlyArray<RawSpan>,
  navigationEvent?: NavigationEvent,
): string => {
  if (navigationEvent?.projectId) return navigationEvent.projectId;
  for (const span of spans) {
    if (span.projectId) return span.projectId;
  }
  return "unknown";
};

export const buildPageSession = (
  sessionId: string,
  spans: ReadonlyArray<RawSpan>,
  navigationEvent?: NavigationEvent,
): PageSession | undefined => {
  const validSpans = spans.filter((s) => !isNoiseSpan(s));
  if (validSpans.length === 0) return undefined;

  const sortedSpans = [...validSpans].sort((a, b) => a.startTime - b.startTime);
  const projectId = extractProjectId(sortedSpans, navigationEvent);
  const resources = sortedSpans.map((span) =>
    spanToResource(span, sessionId, projectId),
  );
  const rootResources = buildResourceTree(resources);
  const flatResources = flattenResourceTree(rootResources);

  const navigationType =
    navigationEvent?.navigationType ?? determineNavigationType(sortedSpans);
  const timing = computeTiming(flatResources, navigationEvent, navigationType);
  const stats = computeStats(flatResources);

  return {
    id: sessionId,
    projectId,
    url: navigationEvent?.url ?? extractSessionUrl(sortedSpans),
    route: navigationEvent?.route ?? extractRoute(sortedSpans),
    navigationType,
    previousSessionId: navigationEvent?.previousSessionId,
    timing,
    resources: flatResources,
    rootResources,
    stats,
  };
};

export const mergeSessionSpans = (
  existingSpans: ReadonlyArray<RawSpan>,
  newSpans: ReadonlyArray<RawSpan>,
): ReadonlyArray<RawSpan> => {
  const existingIds = new Set(existingSpans.map((s) => s.id));
  const uniqueNewSpans = newSpans.filter((s) => !existingIds.has(s.id));
  return [...existingSpans, ...uniqueNewSpans];
};

export const sortSessionsByTime = (
  sessions: ReadonlyArray<PageSession>,
): ReadonlyArray<PageSession> =>
  [...sessions].sort(
    (a, b) => b.timing.navigationStart - a.timing.navigationStart,
  );

export const filterResources = (
  resources: ReadonlyArray<Resource>,
  filter: {
    search?: string;
    types?: ReadonlyArray<ResourceType>;
    origins?: ReadonlyArray<SpanOrigin>;
    minDuration?: number;
    showErrorsOnly?: boolean;
  },
): ReadonlyArray<Resource> => {
  return resources.filter((resource) => {
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      const matchesName = resource.name.toLowerCase().includes(searchLower);
      const matchesUrl = resource.url.toLowerCase().includes(searchLower);
      if (!matchesName && !matchesUrl) return false;
    }

    if (
      filter.types &&
      filter.types.length > 0 &&
      !filter.types.includes(resource.type)
    ) {
      return false;
    }

    if (
      filter.origins &&
      filter.origins.length > 0 &&
      !filter.origins.includes(resource.origin)
    ) {
      return false;
    }

    if (
      filter.minDuration !== undefined &&
      resource.duration < filter.minDuration
    ) {
      return false;
    }

    if (filter.showErrorsOnly && resource.status !== "error") {
      return false;
    }

    return true;
  });
};

export const findCriticalPath = (
  rootResources: ReadonlyArray<Resource>,
): ReadonlyArray<string> => {
  const path: string[] = [];

  const findSlowest = (
    resources: ReadonlyArray<Resource>,
  ): Resource | undefined => {
    if (resources.length === 0) return undefined;
    return resources.reduce((slowest, current) =>
      current.duration > slowest.duration ? current : slowest,
    );
  };

  let current = findSlowest(rootResources);
  while (current) {
    path.push(current.id);
    current = findSlowest(current.children);
  }

  return path;
};
