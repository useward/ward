import { SERVER_TRACES_ENDPOINT } from "@nextdoctor/shared";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { OTLPHttpJsonTraceExporter, registerOTel } from "@vercel/otel";
import { NextJsRscInstrumentation } from "./nextjs-rsc-instrumentation";

const SERVICE_NAME = "nextjs-server-app";

export async function register() {
  const serviceAttributes = {
    "service.name": SERVICE_NAME,
    "app.env": process.env.NODE_ENV || "development",
  };

  const traceExporter = new OTLPHttpJsonTraceExporter({
    url: SERVER_TRACES_ENDPOINT,
  });
  const spanProcessor = new BatchSpanProcessor(traceExporter);

  registerOTel({
    serviceName: SERVICE_NAME,
    attributes: serviceAttributes,
    spanProcessors: [spanProcessor],
  });

  registerOTel({ serviceName: "my-next-app", spanProcessors: [spanProcessor] });

  const sdk = new NodeSDK({
    instrumentations: [
      ...getNodeAutoInstrumentations(),
      new UndiciInstrumentation(),
      new NextJsRscInstrumentation()
    ],
    spanProcessors: [spanProcessor],
  });

  sdk.start();
}
