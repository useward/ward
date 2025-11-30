import {
  SERVER_METRICS_ENDPOINT,
  SERVER_TRACES_ENDPOINT,
} from "@nextdoctor/shared";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import {
  detectResources,
  osDetector,
  processDetector,
  resourceFromAttributes,
} from "@opentelemetry/resources";
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { registerOTel } from "@vercel/otel";

const SERVICE_NAME = "nextjs-server-app";

export async function register() {
  const serviceAttributes = {
    "service.name": SERVICE_NAME,
    "app.env": process.env.NODE_ENV || "development",
  };

  const serviceResource = resourceFromAttributes(serviceAttributes);

  const detectedResources = await detectResources({
    detectors: [osDetector, processDetector],
  });

  const finalResource = serviceResource.merge(detectedResources);

  const traceExporter = new OTLPTraceExporter({ url: SERVER_TRACES_ENDPOINT });
  const spanProcessor = new BatchSpanProcessor(traceExporter, {
    scheduledDelayMillis: 100,
  });

  registerOTel({
    serviceName: SERVICE_NAME,
    attributes: serviceAttributes,
    spanProcessors: [spanProcessor],
  });

  const metricExporter = new OTLPMetricExporter({
    url: SERVER_METRICS_ENDPOINT,
  });

  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 10000,
  });

  new MeterProvider({
    resource: finalResource,
    readers: [metricReader],
  });
}
