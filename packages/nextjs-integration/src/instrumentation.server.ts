import { SERVER_TRACES_ENDPOINT } from "@nextdoctor/shared";
import { DiagConsoleLogger, DiagLogLevel, diag } from "@opentelemetry/api";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { OTLPHttpJsonTraceExporter, registerOTel } from "@vercel/otel";
import {
  InstrumentationManager,
  NextJsServerInstrumentation,
  FetchInstrumentation,
} from "./instrumentations/index.js";

const SERVICE_NAME = "nextjs-server-app";
const SERVICE_VERSION = "1.0.0";

export async function register() {
  const isDebug = !!process.env.NEXTDOCTOR_DEBUG;

  if (isDebug) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
  }

  const serviceAttributes = {
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
    "app.env": process.env.NODE_ENV || "development",
    "telemetry.sdk.language": "javascript",
    "telemetry.sdk.name": "nextdoctor",
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

  const manager = new InstrumentationManager();

  manager.register(
    new NextJsServerInstrumentation({
      debug: isDebug,
      spanName: "nextjs.page.render",
    }),
  );

  manager.register(
    new FetchInstrumentation({
      debug: isDebug,
    }),
  );

  manager.enable();

  diag.info(`[nextdoctor] Enabled ${manager.count} instrumentations`);
}
