import { ATTR_SESSION_ID, SESSION_ID_HEADER } from "@nextdoctor/shared";
import {
  type Attributes,
  type AttributeValue,
  context,
  createContextKey,
  type Span,
  SpanKind,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_SERVER_ADDRESS,
  ATTR_URL_FULL,
  ATTR_URL_PATH,
} from "@opentelemetry/semantic-conventions";

import {
  ATTR_REQUEST_ID,
  ATTR_REQUEST_ROUTE,
  ATTR_REQUEST_URL,
  ATTR_SPAN_CATEGORY,
  generateRequestId,
  generateSessionId,
  type RequestContext,
  runWithRequestContext,
} from "../request-context.js";
import { BaseInstrumentation } from "./base-instrumentation.js";

const SESSION_ID_CONTEXT_KEY = createContextKey("nextdoctor.sessionId");

const DEFAULT_SPAN_NAME = "nextjs.page.render";
const INSTRUMENTATION_NAME = "nextjs-server-instrumentation";
const INSTRUMENTATION_VERSION = "1.0.0";
const NEXT_SERVER_PATH = "next/dist/server/next-server.js";
const HTTP_SERVER_ERROR_THRESHOLD = 500;

export interface NextJsServerInstrumentationConfig {
  debug?: boolean;
  spanName?: string;
}

interface NextServerRenderResponse {
  status?: number;
  statusCode?: number;
  body?: ReadableStream | { getReader?: () => unknown };
  headers?: Map<string, string> | { get?: (key: string) => string | null };
}

// biome-ignore lint/suspicious/noExplicitAny: Required to avoid Node.js dependencies
type IncomingMessage = any;
// biome-ignore lint/suspicious/noExplicitAny: Required to avoid Node.js dependencies
type ServerResponse = any;

type RenderMethod = (
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl?: URL,
) => Promise<NextServerRenderResponse>;

interface NextServerPrototype {
  render: RenderMethod;
}

interface NextServerConstructor {
  prototype: NextServerPrototype;
}

interface NextServerModule {
  default?: NextServerConstructor;
  prototype?: NextServerPrototype;
}

const originalRenderMethods = new WeakMap<NextServerPrototype, RenderMethod>();

export class NextJsServerInstrumentation extends BaseInstrumentation {
  private readonly spanName: string;
  private patchedProto?: NextServerPrototype;

  constructor(userConfig: NextJsServerInstrumentationConfig = {}) {
    super({
      debug: userConfig.debug,
      instrumentationName: INSTRUMENTATION_NAME,
      instrumentationVersion: INSTRUMENTATION_VERSION,
    });

    this.spanName = userConfig.spanName ?? DEFAULT_SPAN_NAME;
  }

  protected patch(): void {
    try {
      const proto = this.resolveNextServerPrototype();
      if (!proto?.render) {
        this.log("NextServer.prototype.render not found; skipping patch");
        return;
      }

      if (!originalRenderMethods.has(proto)) {
        originalRenderMethods.set(proto, proto.render);
      } else {
        this.log(
          "NextServer.prototype.render already patched; re-using original",
        );
      }

      const originalRender = originalRenderMethods.get(proto);
      if (!originalRender) {
        this.log("Failed to retrieve original render method");
        return;
      }

      proto.render = this.createRenderPatch(originalRender);
      this.patchedProto = proto;

      this.log("Successfully patched NextServer.prototype.render");
    } catch (err) {
      this.logError("Failed to patch next-server.js", err);
    }
  }

  protected unpatch(): void {
    if (!this.patchedProto) return;

    try {
      const originalRender = originalRenderMethods.get(this.patchedProto);
      if (originalRender) {
        this.patchedProto.render = originalRender;
        this.log("Successfully unpatched NextServer.prototype.render");
      }
    } catch (err) {
      this.logError("Failed to unpatch next-server.js", err);
    } finally {
      this.patchedProto = undefined;
    }
  }

  private resolveNextServerPrototype(): NextServerPrototype | undefined {
    try {
      const nextServerPath = require.resolve(NEXT_SERVER_PATH);
      const nextServerModule = require(nextServerPath) as NextServerModule;
      const NextServer = nextServerModule?.default ?? nextServerModule;
      return NextServer?.prototype;
    } catch (err) {
      this.logError("Failed to resolve NextServer prototype", err);
      return undefined;
    }
  }

  private createRenderPatch(original: RenderMethod): RenderMethod {
    const instrumentation = this;
    const spanName = this.spanName;
    const tracer = this.tracer;

    return async function wrappedRender(
      this: unknown,
      req: IncomingMessage,
      res: ServerResponse,
      parsedUrl?: URL,
    ): Promise<NextServerRenderResponse> {
      const url = req.url || parsedUrl?.toString() || "/";

      const isNoiseRequest =
        url.includes("/manifest.json") ||
        url.includes("/icon") ||
        url.includes("/favicon") ||
        url.includes("/apple-touch-icon") ||
        url.includes("/_next/static") ||
        url.includes("/_next/image") ||
        /\.(ico|png|jpg|jpeg|gif|svg|webp|woff|woff2|css|js)(\?|$)/i.test(url);

      if (isNoiseRequest) {
        return original.call(this, req, res, parsedUrl);
      }

      const requestId = generateRequestId();

      const incomingSessionId = req.headers?.[SESSION_ID_HEADER] as
        | string
        | undefined;
      const sessionId = incomingSessionId || generateSessionId();

      const isApiRoute = url.includes("/api/") || url.includes("/_next/");
      const isRscRequest =
        req.headers?.rsc === "1" ||
        req.headers?.accept?.includes("text/x-component");

      let dynamicSpanName = spanName;
      if (isApiRoute) {
        dynamicSpanName = "nextjs.api.handler";
      } else if (isRscRequest) {
        dynamicSpanName = "nextjs.rsc.render";
      }

      const attrs = instrumentation.buildAttributes(
        req,
        parsedUrl,
        requestId,
        sessionId,
        isRscRequest,
      );
      const span = tracer.startSpan(
        dynamicSpanName,
        { kind: SpanKind.SERVER, attributes: attrs },
        context.active(),
      );

      let ctx = trace.setSpan(context.active(), span);
      ctx = ctx.setValue(SESSION_ID_CONTEXT_KEY, sessionId);

      const requestContext: RequestContext = {
        requestId,
        sessionId,
        rootSpan: span,
        url,
        startTime: Date.now(),
        route: parsedUrl?.pathname,
      };

      if (!incomingSessionId) {
        res.setHeader(SESSION_ID_HEADER, sessionId);
      }

      return context.with(ctx, () => {
        return runWithRequestContext(requestContext, async () => {
          const start = performance.now();

          try {
            const response = await original.call(this, req, res, parsedUrl);
            instrumentation.recordSuccess(span, response, res, start);
            return response;
          } catch (err) {
            instrumentation.recordError(span, err);
            throw err;
          } finally {
            span.end();
          }
        });
      });
    };
  }

  private recordSuccess(
    span: Span,
    response: NextServerRenderResponse,
    res: ServerResponse,
    startTime: number,
  ): void {
    const duration = performance.now() - startTime;
    span.setAttribute("nextjs.render.duration_ms", duration);

    this.setStatusCode(span, response, res);
    this.setStreamingInfo(span, response);
    this.setCacheInfo(span, response);
  }

  private setStatusCode(
    span: Span,
    response: NextServerRenderResponse,
    res: ServerResponse,
  ): void {
    const status = response?.status ?? response?.statusCode ?? res?.statusCode;

    if (typeof status === "number") {
      span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, status);

      if (status >= HTTP_SERVER_ERROR_THRESHOLD) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: `HTTP ${status}`,
        });
      }
    }
  }

  private setStreamingInfo(
    span: Span,
    response: NextServerRenderResponse,
  ): void {
    const isStream =
      response?.body instanceof ReadableStream ||
      (response?.body && typeof response.body.getReader === "function");

    span.setAttribute("nextjs.rsc.is_stream", Boolean(isStream));
  }

  private setCacheInfo(span: Span, response: NextServerRenderResponse): void {
    const headers = response?.headers;
    const cacheHeader =
      headers instanceof Map
        ? headers.get("x-nextjs-cache")
        : headers?.get?.("x-nextjs-cache");

    if (cacheHeader) {
      span.setAttribute("nextjs.cache", cacheHeader);
    }
  }

  private recordError(span: Span, err: unknown): void {
    const error = this.ensureError(err);

    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message || "Next.js render error",
    });
  }

  private buildAttributes(
    req: IncomingMessage,
    parsedUrl?: URL,
    requestId?: string,
    sessionId?: string,
    isRscRequest?: boolean,
  ): Attributes {
    const attrs: Record<string, AttributeValue> = {
      [ATTR_HTTP_REQUEST_METHOD]: req.method ?? "UNKNOWN",
      [ATTR_SPAN_CATEGORY]: "render",
      "nextjs.kind": isRscRequest ? "rsc" : "page",
      "nextjs.runtime": "nodejs",
    };

    if (requestId) {
      attrs[ATTR_REQUEST_ID] = requestId;
    }

    if (sessionId) {
      attrs[ATTR_SESSION_ID] = sessionId;
    }

    if (req.url) {
      attrs[ATTR_URL_FULL] = req.url;
      attrs[ATTR_REQUEST_URL] = req.url;
    }

    if (parsedUrl?.pathname) {
      attrs[ATTR_URL_PATH] = parsedUrl.pathname;
      attrs["http.route"] = parsedUrl.pathname;
      attrs[ATTR_REQUEST_ROUTE] = parsedUrl.pathname;
    }

    const host = req.headers?.host;
    if (host) {
      attrs[ATTR_SERVER_ADDRESS] = host;
    }

    if (req.headers?.rsc) {
      attrs["nextjs.rsc.request"] = true;
    }

    if (req.headers?.["next-action"]) {
      attrs["nextjs.action"] = req.headers["next-action"];
      attrs[ATTR_SPAN_CATEGORY] = "action";
    }

    return attrs;
  }
}
