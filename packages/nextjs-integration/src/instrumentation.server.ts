import { ATTR_SESSION_ID, SERVER_TRACES_ENDPOINT } from "@nextdoctor/shared";
import { DiagConsoleLogger, DiagLogLevel, context as otelContext, createContextKey, diag } from "@opentelemetry/api";
import { BatchSpanProcessor, type ReadableSpan, type Span, type SpanProcessor } from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { OTLPHttpJsonTraceExporter, registerOTel } from "@vercel/otel";
import { InstrumentationManager, NextJsServerInstrumentation } from "./instrumentations/index.js";
import { getRequestContext } from "./request-context.js";

const SERVICE_NAME = "nextjs-server-app";
const SERVICE_VERSION = "1.0.0";

export const SESSION_ID_CONTEXT_KEY = createContextKey("nextdoctor.sessionId");

class SessionIdSpanProcessor implements SpanProcessor {
  onStart(span: Span): void {
    let sessionId = otelContext.active().getValue(SESSION_ID_CONTEXT_KEY) as string | undefined;

    if (!sessionId) {
      sessionId = getRequestContext()?.sessionId;
    }

    if (sessionId) {
      span.setAttribute(ATTR_SESSION_ID, sessionId);
    }
  }

  onEnd(_span: ReadableSpan): void {}

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}

export async function register() {
  const isDebug = !!process.env.NEXTDOCTOR_DEBUG;

  if (isDebug) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
  }

  const traceExporter = new OTLPHttpJsonTraceExporter({
    url: SERVER_TRACES_ENDPOINT,
  });

  const sessionProcessor = new SessionIdSpanProcessor();
  const batchProcessor = new BatchSpanProcessor(traceExporter);

  registerOTel({
    serviceName: SERVICE_NAME,
    attributes: {
      [ATTR_SERVICE_NAME]: SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
      "app.env": process.env.NODE_ENV || "development",
    },
    spanProcessors: [sessionProcessor, batchProcessor],
  });

  const manager = new InstrumentationManager();
  manager.register(new NextJsServerInstrumentation({ debug: isDebug }));
  manager.enable();
}
