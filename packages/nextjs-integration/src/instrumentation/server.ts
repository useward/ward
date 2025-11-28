import { METRIC_ENDPOINT, TRACE_ENDPOINT } from "@nextdoctor/shared";
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
import { spawn } from "node:child_process";

const SERVICE_NAME = "nextjs-server-app";

export async function register() {
  const nextDoctorPrecess = spawn("nextdoctor", []);

  const killNextDoctorIfNeeded = () => {
    if (nextDoctorPrecess && !nextDoctorPrecess.killed) {
      nextDoctorPrecess.kill();
    }
  };

  process.on("exit", killNextDoctorIfNeeded);
  process.on("SIGINT", killNextDoctorIfNeeded);

  const serviceAttributes = {
    "service.name": SERVICE_NAME,
    "app.env": process.env.NODE_ENV || "development",
  };

  const serviceResource = resourceFromAttributes(serviceAttributes);

  const detectedResources = await detectResources({
    detectors: [osDetector, processDetector],
  });

  const finalResource = serviceResource.merge(detectedResources);

  const traceExporter = new OTLPTraceExporter({ url: TRACE_ENDPOINT });
  const spanProcessor = new BatchSpanProcessor(traceExporter, {
    scheduledDelayMillis: 100,
  });

  registerOTel({
    serviceName: SERVICE_NAME,
    attributes: serviceAttributes,
    spanProcessors: [spanProcessor],
  });

  const metricExporter = new OTLPMetricExporter({ url: METRIC_ENDPOINT });

  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 10000,
  });

  new MeterProvider({
    resource: finalResource,
    readers: [metricReader],
  });
}
