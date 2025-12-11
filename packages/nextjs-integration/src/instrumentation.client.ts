import {
  CLIENT_METRICS_ENDPOINT,
  CLIENT_TRACES_ENDPOINT,
  NAVIGATION_EVENTS_ENDPOINT,
  SERVER_PORT,
  SESSION_ID_HEADER,
  ATTR_SESSION_ID,
} from "@nextdoctor/shared";
import { ZoneContextManager } from "@opentelemetry/context-zone";
import {
  AggregationTemporalityPreference,
  OTLPMetricExporter,
} from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch";
import { XMLHttpRequestInstrumentation } from "@opentelemetry/instrumentation-xml-http-request";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { BatchSpanProcessor, type Span } from "@opentelemetry/sdk-trace-base";
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";

const generateSessionId = (): string =>
  `nav_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

let currentSessionId: string | null = null;
let previousSessionId: string | null = null;
let navigationStartTime: number = 0;
let currentPathname: string = typeof window !== "undefined" ? window.location.pathname : "/";
let pendingNavigationSessionId: string | null = null;
let pendingNavigationPathname: string | null = null;
let navigationInProgress = false;

const readServerSessionId = (): string | null => {
  const meta = document.querySelector('meta[name="nextdoctor-session-id"]');
  return meta?.getAttribute("content") ?? null;
};

const sendNavigationEvent = (event: {
  sessionId: string;
  url: string;
  route: string;
  navigationType: "initial" | "navigation" | "back-forward";
  previousSessionId: string | null;
  timing: {
    navigationStart: number;
    responseStart: number | null;
    domContentLoaded: number | null;
    load: number | null;
  };
}): void => {
  try {
    fetch(NAVIGATION_EVENTS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      keepalive: true,
    }).catch(() => {});
  } catch {}
};

const initializeSession = (): void => {
  const serverSessionId = readServerSessionId();
  currentSessionId = serverSessionId || generateSessionId();
  navigationStartTime = performance.now();
  currentPathname = window.location.pathname;
  console.log(`[nextdoctor] initializeSession: sessionId=${currentSessionId}, pathname=${currentPathname}, fromServer=${!!serverSessionId}`);
};

const finalizeNavigation = (navigationType: "navigation" | "back-forward"): void => {
  const newPathname = window.location.pathname;

  console.log(`[nextdoctor] finalizeNavigation: type=${navigationType}, newPath=${newPathname}, currentPath=${currentPathname}, pending=${pendingNavigationSessionId}, pendingPath=${pendingNavigationPathname}`);

  const isPendingForThisPath = pendingNavigationSessionId && pendingNavigationPathname === newPathname;
  const isActualNavigation = newPathname !== currentPathname;

  if (!isActualNavigation && !isPendingForThisPath) {
    console.log(`[nextdoctor] finalizeNavigation: skipped (same path, no matching pending)`);
    pendingNavigationSessionId = null;
    pendingNavigationPathname = null;
    navigationInProgress = false;
    return;
  }

  previousSessionId = currentSessionId;
  currentSessionId = isPendingForThisPath ? pendingNavigationSessionId : generateSessionId();
  pendingNavigationSessionId = null;
  pendingNavigationPathname = null;
  navigationInProgress = false;
  navigationStartTime = performance.now();
  currentPathname = newPathname;

  console.log(`[nextdoctor] finalizeNavigation: new session=${currentSessionId}, prev=${previousSessionId}`);

  sendNavigationEvent({
    sessionId: currentSessionId,
    url: window.location.href,
    route: newPathname,
    navigationType,
    previousSessionId,
    timing: {
      navigationStart: navigationStartTime,
      responseStart: null,
      domContentLoaded: null,
      load: null,
    },
  });
};

const isPageRoute = (pathname: string): boolean => {
  if (pathname.startsWith("/api/")) return false;
  if (pathname.startsWith("/rest/")) return false;
  if (pathname.startsWith("/v1/")) return false;
  if (pathname.startsWith("/g/")) return false;
  if (pathname.startsWith("/_next/")) return false;
  if (pathname.startsWith("/__nextjs")) return false;
  if (pathname.includes(".")) return false;
  return true;
};

const getSessionIdForUrl = (url: string): string => {
  try {
    const parsed = new URL(url, window.location.origin);
    const targetPathname = parsed.pathname;

    const isRscNavigationRequest =
      (parsed.searchParams.has("_rsc") || url.includes("_rsc=")) &&
      isPageRoute(targetPathname) &&
      targetPathname !== currentPathname;

    if (isRscNavigationRequest) {
      if (pendingNavigationSessionId && pendingNavigationPathname === targetPathname) {
        console.log(`[nextdoctor] reusing pending session for RSC nav to ${targetPathname}: ${pendingNavigationSessionId}`);
        return pendingNavigationSessionId;
      }

      if (!navigationInProgress || targetPathname !== pendingNavigationPathname) {
        navigationInProgress = true;
        pendingNavigationSessionId = generateSessionId();
        pendingNavigationPathname = targetPathname;
        console.log(`[nextdoctor] created pending session for RSC nav to ${targetPathname}: ${pendingNavigationSessionId}`);
      }

      return pendingNavigationSessionId!;
    }

    if (pendingNavigationSessionId && pendingNavigationPathname) {
      const isRelatedToNavigation =
        targetPathname === pendingNavigationPathname ||
        (isPageRoute(targetPathname) && targetPathname !== currentPathname);

      if (isRelatedToNavigation) {
        console.log(`[nextdoctor] using pending session for related request ${targetPathname}: ${pendingNavigationSessionId}`);
        return pendingNavigationSessionId;
      }
    }
  } catch (e) {
    console.error(`[nextdoctor] getSessionIdForUrl error:`, e);
  }

  return currentSessionId || generateSessionId();
};

export const getCurrentSessionId = (): string => {
  if (!currentSessionId) {
    initializeSession();
  }
  return currentSessionId!;
};

export function register() {
  if (typeof window === "undefined") return;

  initializeSession();

  const resource = resourceFromAttributes({
    "service.name": "nextjs-client-app",
    "app.env": process.env.NODE_ENV || "development",
    "page.url": window.location.href,
  });

  const traceExporter = new OTLPTraceExporter({ url: CLIENT_TRACES_ENDPOINT });

  const sessionSpanProcessor = {
    onStart(span: Span): void {
      const urlAttr = span.attributes?.["http.url"] || span.attributes?.["url.full"];
      const sessionId = urlAttr ? getSessionIdForUrl(String(urlAttr)) : getCurrentSessionId();
      span.setAttribute(ATTR_SESSION_ID, sessionId);
    },
    onEnd(): void {},
    shutdown(): Promise<void> {
      return Promise.resolve();
    },
    forceFlush(): Promise<void> {
      return Promise.resolve();
    },
  };

  const provider = new WebTracerProvider({
    resource,
    spanProcessors: [sessionSpanProcessor, new BatchSpanProcessor(traceExporter)],
  });

  provider.register({ contextManager: new ZoneContextManager() });

  const originalFetch = window.fetch;
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const sessionId = getSessionIdForUrl(url);
    const headers = new Headers(init?.headers);

    if (!headers.has(SESSION_ID_HEADER)) {
      headers.set(SESSION_ID_HEADER, sessionId);
    }

    return originalFetch.call(this, input, { ...init, headers });
  };

  registerInstrumentations({
    instrumentations: [
      new FetchInstrumentation({
        ignoreUrls: [new RegExp(`localhost:${SERVER_PORT}`)],
        applyCustomAttributesOnSpan: (span, request) => {
          const url = request instanceof Request ? request.url : String(request);
          span.setAttribute(ATTR_SESSION_ID, getSessionIdForUrl(url));
        },
      }),
      new XMLHttpRequestInstrumentation({
        applyCustomAttributesOnSpan: (span, xhr) => {
          const url = xhr.responseURL || "";
          span.setAttribute(ATTR_SESSION_ID, getSessionIdForUrl(url));
        },
      }),
    ],
    tracerProvider: provider,
  });

  const metricExporter = new OTLPMetricExporter({
    url: CLIENT_METRICS_ENDPOINT,
    temporalityPreference: AggregationTemporalityPreference.DELTA,
  });

  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 5000,
  });

  const meterProvider = new MeterProvider({
    resource,
    readers: [metricReader],
  });

  const meter = meterProvider.getMeter("nextjs-performance-observer");

  const hydrationDuration = meter.createHistogram("nextjs.hydration.duration", {
    unit: "ms",
    description: "Duration of the Next.js hydration process.",
  });

  const longTaskDuration = meter.createHistogram("browser.long_task.duration", {
    unit: "ms",
    description: "Duration of tasks blocking the main thread for over 50ms.",
  });

  const lcpValue = meter.createHistogram("web_vitals.lcp", {
    unit: "ms",
    description: "Largest Contentful Paint value.",
  });

  const navigationObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const navEntry = entry as PerformanceNavigationTiming;

      sendNavigationEvent({
        sessionId: getCurrentSessionId(),
        url: window.location.href,
        route: window.location.pathname,
        navigationType: "initial",
        previousSessionId: null,
        timing: {
          navigationStart: navEntry.startTime,
          responseStart: navEntry.responseStart,
          domContentLoaded: navEntry.domContentLoadedEventEnd,
          load: navEntry.loadEventEnd,
        },
      });
    }
  });

  navigationObserver.observe({ type: "navigation", buffered: true });

  const performanceObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const typedEntry = entry as PerformanceEntry & {
        duration: number;
        name: string;
        startTime: number;
        renderTime?: number;
        loadTime?: number;
      };

      const commonAttributes = {
        "page.path": window.location.pathname,
        "entry.name": typedEntry.name,
        [ATTR_SESSION_ID]: getCurrentSessionId(),
      };

      if (
        typedEntry.entryType === "measure" &&
        typedEntry.name.startsWith("Next.js-")
      ) {
        hydrationDuration.record(typedEntry.duration, {
          ...commonAttributes,
          "nextjs.measure.type": typedEntry.name.replace("Next.js-", ""),
        });
      } else if (typedEntry.entryType === "longtask") {
        longTaskDuration.record(typedEntry.duration, {
          ...commonAttributes,
          "longtask.name": typedEntry.name,
          "longtask.start_time": typedEntry.startTime.toFixed(2),
        });
      } else if (typedEntry.entryType === "largest-contentful-paint") {
        lcpValue.record(typedEntry.duration, {
          ...commonAttributes,
          "lcp.render_time": typedEntry.renderTime?.toFixed(2) || "N/A",
          "lcp.load_time": typedEntry.loadTime?.toFixed(2) || "N/A",
        });
      }
    }
  });

  performanceObserver.observe({
    entryTypes: ["measure", "longtask", "largest-contentful-paint"],
    buffered: true,
  });

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    const result = originalPushState.apply(this, args);
    finalizeNavigation("navigation");
    return result;
  };

  history.replaceState = function (...args) {
    const result = originalReplaceState.apply(this, args);
    finalizeNavigation("navigation");
    return result;
  };

  window.addEventListener("popstate", () => {
    finalizeNavigation("back-forward");
  });
}
