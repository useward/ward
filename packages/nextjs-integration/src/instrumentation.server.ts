import {
  ATTR_PROJECT_ID,
  ATTR_SESSION_ID,
  SERVER_TRACES_ENDPOINT,
} from "@nextdoctor/shared";
import {
  createContextKey,
  DiagConsoleLogger,
  DiagLogLevel,
  diag,
  context as otelContext,
} from "@opentelemetry/api";
import {
  BatchSpanProcessor,
  type ReadableSpan,
  type Span,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { OTLPHttpJsonTraceExporter, registerOTel } from "@vercel/otel";
import {
  getProjectId,
  type NextDoctorConfig,
  resolveProjectId,
  setProjectId,
} from "./config.js";
import {
  InstrumentationManager,
  NextJsServerInstrumentation,
} from "./instrumentations/index.js";
import { getRequestContext } from "./request-context.js";

const SERVICE_NAME = "nextjs-server-app";
const SERVICE_VERSION = "1.0.0";

export const SESSION_ID_CONTEXT_KEY = createContextKey("nextdoctor.sessionId");

class SessionIdSpanProcessor implements SpanProcessor {
  onStart(span: Span): void {
    let sessionId = otelContext.active().getValue(SESSION_ID_CONTEXT_KEY) as
      | string
      | undefined;

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

class ProjectIdSpanProcessor implements SpanProcessor {
  onStart(span: Span): void {
    span.setAttribute(ATTR_PROJECT_ID, getProjectId());
  }

  onEnd(_span: ReadableSpan): void {}

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}

export async function register(config?: NextDoctorConfig) {
  const isDebug = config?.debug ?? !!process.env.NEXTDOCTOR_DEBUG;

  const projectId = resolveProjectId(config);
  setProjectId(projectId);

  if (isDebug) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
    console.log(`[nextdoctor] Initialized with projectId: ${projectId}`);
  }

  const traceExporter = new OTLPHttpJsonTraceExporter({
    url: SERVER_TRACES_ENDPOINT,
  });

  const sessionProcessor = new SessionIdSpanProcessor();
  const projectProcessor = new ProjectIdSpanProcessor();
  const batchProcessor = new BatchSpanProcessor(traceExporter);

  registerOTel({
    serviceName: SERVICE_NAME,
    attributes: {
      [ATTR_SERVICE_NAME]: SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
      [ATTR_PROJECT_ID]: projectId,
      "app.env": process.env.NODE_ENV || "development",
    },
    spanProcessors: [sessionProcessor, projectProcessor, batchProcessor],
  });

  const manager = new InstrumentationManager();
  manager.register(new NextJsServerInstrumentation({ debug: isDebug }));
  manager.enable();
}

export type { NextDoctorConfig };
