import { SERVER_PORT } from "@nextdoctor/shared";
import { ZoneContextManager } from "@opentelemetry/context-zone";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch";
import { XMLHttpRequestInstrumentation } from "@opentelemetry/instrumentation-xml-http-request";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";

const TRACE_ENDPOINT = `http://localhost:${SERVER_PORT}/v1/client-traces`;
const METRIC_ENDPOINT = `http://localhost:${SERVER_PORT}/v1/client-metrics`;

export function register() {
  if (typeof window === "undefined") return;

  const resource = resourceFromAttributes({
    "service.name": "nextjs-client-app",
    "app.env": process.env.NODE_ENV || "development",
    "page.url": window.location.href,
  });

  const traceExporter = new OTLPTraceExporter({ url: TRACE_ENDPOINT });

  const provider = new WebTracerProvider({
    resource,
    spanProcessors: [new BatchSpanProcessor(traceExporter)],
  });

  provider.register({ contextManager: new ZoneContextManager() });

  registerInstrumentations({
    instrumentations: [
      new FetchInstrumentation({
        ignoreUrls: [new RegExp(`localhost:${SERVER_PORT}`)],
      }),
      new XMLHttpRequestInstrumentation(),
    ],
    tracerProvider: provider,
  });

  const metricExporter = new OTLPMetricExporter({ url: METRIC_ENDPOINT });

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

  const observer = new PerformanceObserver((list) => {
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

  observer.observe({
    entryTypes: ["measure", "longtask", "largest-contentful-paint"],
    buffered: true,
  });
}
