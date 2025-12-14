import {
  ATTR_SESSION_ID,
  CLIENT_METRICS_ENDPOINT,
  CLIENT_SESSION_ID_PREFIX,
  CLIENT_TRACES_ENDPOINT,
  NAVIGATION_EVENTS_ENDPOINT,
  SERVER_PORT,
  SESSION_ID_HEADER,
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

type NavigationType = "initial" | "navigation" | "back-forward";

interface NavigationEventPayload {
  sessionId: string;
  url: string;
  route: string;
  navigationType: NavigationType;
  previousSessionId: string | null;
  timing: {
    navigationStart: number;
    responseStart: number | null;
    domContentLoaded: number | null;
    load: number | null;
    fcp: number | null;
    lcp: number | null;
  };
}

interface SessionState {
  currentSessionId: string | null;
  previousSessionId: string | null;
  navigationStartTime: number;
  currentPathname: string;
  pendingNavigationSessionId: string | null;
  pendingNavigationPathname: string | null;
  navigationInProgress: boolean;
  fcp: number | null;
  lcp: number | null;
}

class SessionManager {
  private state: SessionState;

  constructor() {
    this.state = {
      currentSessionId: null,
      previousSessionId: null,
      navigationStartTime: 0,
      currentPathname: typeof window !== "undefined" ? window.location.pathname : "/",
      pendingNavigationSessionId: null,
      pendingNavigationPathname: null,
      navigationInProgress: false,
      fcp: null,
      lcp: null,
    };
  }

  generateSessionId(): string {
    return `${CLIENT_SESSION_ID_PREFIX}${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private readServerSessionId(): string | null {
    const meta = document.querySelector('meta[name="nextdoctor-session-id"]');
    return meta?.getAttribute("content") ?? null;
  }

  private sendNavigationEvent(event: NavigationEventPayload): void {
    fetch(NAVIGATION_EVENTS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      keepalive: true,
    }).catch((error) => {
      if (process.env.NODE_ENV === "development") {
        console.warn("[nextdoctor] Failed to send navigation event:", error);
      }
    });
  }

  initialize(): void {
    const serverSessionId = this.readServerSessionId();
    this.state.currentSessionId = serverSessionId || this.generateSessionId();
    this.state.navigationStartTime = performance.now();
    this.state.currentPathname = window.location.pathname;
  }

  finalizeNavigation(navigationType: "navigation" | "back-forward"): void {
    const newPathname = window.location.pathname;

    const isPendingForThisPath =
      this.state.pendingNavigationSessionId &&
      this.state.pendingNavigationPathname === newPathname;
    const isActualNavigation = newPathname !== this.state.currentPathname;

    if (!isActualNavigation && !isPendingForThisPath) {
      this.state.pendingNavigationSessionId = null;
      this.state.pendingNavigationPathname = null;
      this.state.navigationInProgress = false;
      return;
    }

    this.state.previousSessionId = this.state.currentSessionId;
    this.state.currentSessionId = isPendingForThisPath
      ? this.state.pendingNavigationSessionId
      : this.generateSessionId();
    this.state.pendingNavigationSessionId = null;
    this.state.pendingNavigationPathname = null;
    this.state.navigationInProgress = false;
    this.state.navigationStartTime = performance.now();
    this.state.currentPathname = newPathname;

    this.sendNavigationEvent({
      sessionId: this.state.currentSessionId!,
      url: window.location.href,
      route: newPathname,
      navigationType,
      previousSessionId: this.state.previousSessionId,
      timing: {
        navigationStart: this.state.navigationStartTime,
        responseStart: null,
        domContentLoaded: null,
        load: null,
        fcp: null,
        lcp: null,
      },
    });
  }

  private isPageRoute(pathname: string): boolean {
    const nonPagePrefixes = ["/api/", "/rest/", "/v1/", "/g/", "/_next/", "/__nextjs"];
    if (nonPagePrefixes.some((prefix) => pathname.startsWith(prefix))) {
      return false;
    }
    if (pathname.includes(".")) {
      return false;
    }
    return true;
  }

  getSessionIdForUrl(url: string): string {
    try {
      const parsed = new URL(url, window.location.origin);
      const targetPathname = parsed.pathname;

      const isRscNavigationRequest =
        (parsed.searchParams.has("_rsc") || url.includes("_rsc=")) &&
        this.isPageRoute(targetPathname) &&
        targetPathname !== this.state.currentPathname;

      if (isRscNavigationRequest) {
        if (
          this.state.pendingNavigationSessionId &&
          this.state.pendingNavigationPathname === targetPathname
        ) {
          return this.state.pendingNavigationSessionId;
        }

        if (
          !this.state.navigationInProgress ||
          targetPathname !== this.state.pendingNavigationPathname
        ) {
          this.state.navigationInProgress = true;
          this.state.pendingNavigationSessionId = this.generateSessionId();
          this.state.pendingNavigationPathname = targetPathname;
        }

        return this.state.pendingNavigationSessionId!;
      }

      if (this.state.pendingNavigationSessionId && this.state.pendingNavigationPathname) {
        const isRelatedToNavigation =
          targetPathname === this.state.pendingNavigationPathname ||
          (this.isPageRoute(targetPathname) && targetPathname !== this.state.currentPathname);

        if (isRelatedToNavigation) {
          return this.state.pendingNavigationSessionId;
        }
      }
    } catch {
      return this.state.currentSessionId || this.generateSessionId();
    }

    return this.state.currentSessionId || this.generateSessionId();
  }

  getCurrentSessionId(): string {
    if (!this.state.currentSessionId) {
      this.initialize();
    }
    return this.state.currentSessionId!;
  }

  setFcp(value: number): void {
    this.state.fcp = value;
  }

  setLcp(value: number): void {
    const previousLcp = this.state.lcp;
    this.state.lcp = value;

    if (previousLcp !== null && this.state.currentSessionId) {
      this.sendWebVitalsUpdate();
    }
  }

  private sendWebVitalsUpdate(): void {
    if (!this.state.currentSessionId) return;

    this.sendNavigationEvent({
      sessionId: this.state.currentSessionId,
      url: window.location.href,
      route: this.state.currentPathname,
      navigationType: "initial",
      previousSessionId: null,
      timing: {
        navigationStart: this.state.navigationStartTime,
        responseStart: null,
        domContentLoaded: null,
        load: null,
        fcp: this.state.fcp,
        lcp: this.state.lcp,
      },
    });
  }

  sendInitialNavigationEvent(navEntry: PerformanceNavigationTiming): void {
    this.sendNavigationEvent({
      sessionId: this.getCurrentSessionId(),
      url: window.location.href,
      route: window.location.pathname,
      navigationType: "initial",
      previousSessionId: null,
      timing: {
        navigationStart: navEntry.startTime,
        responseStart: navEntry.responseStart,
        domContentLoaded: navEntry.domContentLoadedEventEnd,
        load: navEntry.loadEventEnd,
        fcp: this.state.fcp,
        lcp: this.state.lcp,
      },
    });
  }
}

const sessionManager = new SessionManager();

export const getCurrentSessionId = (): string => {
  return sessionManager.getCurrentSessionId();
};

export function register() {
  if (typeof window === "undefined") return;

  sessionManager.initialize();

  const resource = resourceFromAttributes({
    "service.name": "nextjs-client-app",
    "app.env": process.env.NODE_ENV || "development",
    "page.url": window.location.href,
  });

  const traceExporter = new OTLPTraceExporter({ url: CLIENT_TRACES_ENDPOINT });

  const sessionSpanProcessor = {
    onStart(span: Span): void {
      const urlAttr = span.attributes?.["http.url"] || span.attributes?.["url.full"];
      const sessionId = urlAttr
        ? sessionManager.getSessionIdForUrl(String(urlAttr))
        : sessionManager.getCurrentSessionId();
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
    const sessionId = sessionManager.getSessionIdForUrl(url);
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
          span.setAttribute(ATTR_SESSION_ID, sessionManager.getSessionIdForUrl(url));
        },
      }),
      new XMLHttpRequestInstrumentation({
        applyCustomAttributesOnSpan: (span, xhr) => {
          const url = xhr.responseURL || "";
          span.setAttribute(ATTR_SESSION_ID, sessionManager.getSessionIdForUrl(url));
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
      sessionManager.sendInitialNavigationEvent(entry as PerformanceNavigationTiming);
    }
  });

  navigationObserver.observe({ type: "navigation", buffered: true });

  const paintObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.name === "first-contentful-paint") {
        sessionManager.setFcp(entry.startTime);
      }
    }
  });

  paintObserver.observe({ type: "paint", buffered: true });

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
        [ATTR_SESSION_ID]: sessionManager.getCurrentSessionId(),
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
        const lcpTime = typedEntry.renderTime ?? typedEntry.loadTime ?? typedEntry.startTime;
        sessionManager.setLcp(lcpTime);
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
    sessionManager.finalizeNavigation("navigation");
    return result;
  };

  history.replaceState = function (...args) {
    const result = originalReplaceState.apply(this, args);
    sessionManager.finalizeNavigation("navigation");
    return result;
  };

  window.addEventListener("popstate", () => {
    sessionManager.finalizeNavigation("back-forward");
  });
}
