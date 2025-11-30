import { SERVER_TRACES_ENDPOINT } from "@nextdoctor/shared";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { OTLPHttpJsonTraceExporter, registerOTel } from "@vercel/otel";

const SERVICE_NAME = "nextjs-server-app";

export async function register() {
  const serviceAttributes = {
    "service.name": SERVICE_NAME,
    "app.env": process.env.NODE_ENV || "development",
  };

  const traceExporter = new OTLPHttpJsonTraceExporter({
    url: SERVER_TRACES_ENDPOINT,
  });
  const spanProcessor = new BatchSpanProcessor(traceExporter, {
    scheduledDelayMillis: 100,
  });

  registerOTel({
    serviceName: SERVICE_NAME,
    attributes: serviceAttributes,
    spanProcessors: [spanProcessor],
  });
}
