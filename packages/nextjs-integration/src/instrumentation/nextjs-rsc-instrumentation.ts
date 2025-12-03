import {
  type Attributes,
  type AttributeValue,
  context,
  diag,
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

const DEFAULT_SPAN_NAME = "nextjs.rsc.render";
const INSTRUMENTATION_NAME = "nextjs-rsc-instrumentation";
const INSTRUMENTATION_VERSION = "1.0.0";
const NEXT_SERVER_PATH = "next/dist/server/next-server.js";
const HTTP_SERVER_ERROR_THRESHOLD = 500;

export interface NextJsRscInstrumentationConfig {
  debug?: boolean;
  spanName?: string;
}

interface NextServerRenderResponse {
  status?: number;
  statusCode?: number;
  body?: ReadableStream | { getReader?: () => unknown };
  headers?: Map<string, string> | { get?: (key: string) => string | null };
}

// Using 'any' to avoid importing Node.js 'http' module
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

// WeakMap to store original render methods without mutating Next.js prototypes
const originalRenderMethods = new WeakMap<NextServerPrototype, RenderMethod>();

export class NextJsRscInstrumentation {
  readonly config: Required<NextJsRscInstrumentationConfig>;
  #patchedProto?: NextServerPrototype;
  #tracer: ReturnType<typeof trace.getTracer>;
  #isEnabled = false;

  constructor(userConfig: NextJsRscInstrumentationConfig = {}) {
    this.config = {
      spanName: userConfig.spanName ?? DEFAULT_SPAN_NAME,
      debug: userConfig.debug ?? false,
    };

    // Create tracer once during construction
    this.#tracer = trace.getTracer(INSTRUMENTATION_NAME, INSTRUMENTATION_VERSION);
  }

  enable(): void {
    // Idempotency check
    if (this.#isEnabled) {
      this.#log("Instrumentation already enabled, skipping");
      return;
    }

    // Only patch if we're in a Node.js environment
    // In Edge runtime, require() doesn't exist, so skip patching entirely
    if (typeof require === "undefined" || typeof require.resolve === "undefined") {
      this.#log("Skipping Next.js server patching: not in Node.js environment");
      return;
    }

    this.#patchNextServer();
    this.#isEnabled = true;
  }

  disable(): void {
    if (!this.#isEnabled) {
      this.#log("Instrumentation not enabled, skipping disable");
      return;
    }

    this.#unpatchNextServer();
    this.#isEnabled = false;
  }

  #patchNextServer(): void {
    try {
      const proto = this.#resolveNextServerPrototype();
      if (!proto?.render) {
        this.#log("NextServer.prototype.render not found; skipping patch");
        return;
      }

      // Store original using WeakMap to avoid mutating Next.js prototype
      if (!originalRenderMethods.has(proto)) {
        originalRenderMethods.set(proto, proto.render);
      } else {
        this.#log("NextServer.prototype.render already patched; re-using original");
      }

      const originalRender = originalRenderMethods.get(proto);
      if (!originalRender) {
        this.#log("Failed to retrieve original render method");
        return;
      }

      proto.render = this.#createRenderPatch(originalRender);
      this.#patchedProto = proto;

      this.#log("Successfully patched NextServer.prototype.render");
    } catch (err) {
      this.#logError("Failed to patch next-server.js", err);
    }
  }

  #resolveNextServerPrototype(): NextServerPrototype | undefined {
    try {
      // This code only runs in Node.js (checked in enable())
      const nextServerPath = require.resolve(NEXT_SERVER_PATH);
      const nextServerModule = require(nextServerPath) as NextServerModule;
      const NextServer = nextServerModule?.default ?? nextServerModule;
      return NextServer?.prototype;
    } catch (err) {
      this.#logError("Failed to resolve NextServer prototype", err);
      return undefined;
    }
  }

  #unpatchNextServer(): void {
    if (!this.#patchedProto) return;

    try {
      const originalRender = originalRenderMethods.get(this.#patchedProto);
      if (originalRender) {
        this.#patchedProto.render = originalRender;
        this.#log("Successfully unpatched NextServer.prototype.render");
      }
    } catch (err) {
      this.#logError("Failed to unpatch next-server.js", err);
    } finally {
      this.#patchedProto = undefined;
    }
  }

  #createRenderPatch(original: RenderMethod): RenderMethod {
    const instrumentation = this;
    const spanName = this.config.spanName;
    const tracer = this.#tracer; // Reuse tracer instance

    return async function wrappedRender(
      this: unknown,
      req: IncomingMessage,
      res: ServerResponse,
      parsedUrl?: URL,
    ): Promise<NextServerRenderResponse> {
      const attrs = instrumentation.#buildAttributes(req, parsedUrl);
      const span = tracer.startSpan(
        spanName,
        { kind: SpanKind.SERVER, attributes: attrs },
        context.active(),
      );

      const ctx = trace.setSpan(context.active(), span);

      return context.with(ctx, async () => {
        const start = performance.now();

        try {
          const response = await original.call(this, req, res, parsedUrl);
          instrumentation.#recordSuccess(span, response, res, start);
          return response;
        } catch (err) {
          instrumentation.#recordError(span, err);
          throw err;
        } finally {
          span.end();
        }
      });
    };
  }

  #recordSuccess(
    span: Span,
    response: NextServerRenderResponse,
    res: ServerResponse,
    startTime: number,
  ): void {
    const duration = performance.now() - startTime;
    span.setAttribute("nextjs.render.duration_ms", duration);

    this.#setStatusCode(span, response, res);
    this.#setStreamingInfo(span, response);
    this.#setCacheInfo(span, response);
  }

  #setStatusCode(
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

  #setStreamingInfo(
    span: Span,
    response: NextServerRenderResponse,
  ): void {
    const isStream =
      response?.body instanceof ReadableStream ||
      (response?.body && typeof response.body.getReader === "function");

    span.setAttribute("nextjs.rsc.is_stream", Boolean(isStream));
  }

  #setCacheInfo(span: Span, response: NextServerRenderResponse): void {
    const headers = response?.headers;
    const cacheHeader =
      headers instanceof Map
        ? headers.get("x-nextjs-cache")
        : headers?.get?.("x-nextjs-cache");

    if (cacheHeader) {
      span.setAttribute("nextjs.cache", cacheHeader);
    }
  }

  #recordError(span: Span, err: unknown): void {
    const error = this.#ensureError(err);

    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message || "Next.js render error",
    });
  }

  #buildAttributes(req: IncomingMessage, parsedUrl?: URL): Attributes {
    const attrs: Record<string, AttributeValue> = {
      [ATTR_HTTP_REQUEST_METHOD]: req.method ?? "UNKNOWN",
      "nextjs.kind": "render",
      "nextjs.runtime": "nodejs",
    };

    if (req.url) {
      attrs[ATTR_URL_FULL] = req.url;
    }

    if (parsedUrl?.pathname) {
      attrs[ATTR_URL_PATH] = parsedUrl.pathname;
      attrs["http.route"] = parsedUrl.pathname;
    }

    const host = req.headers?.host;
    if (host) {
      attrs[ATTR_SERVER_ADDRESS] = host;
    }

    return attrs;
  }

  #ensureError(err: unknown): Error {
    if (err instanceof Error) {
      return err;
    }

    if (typeof err === "string") {
      return new Error(err);
    }

    return new Error("Unknown error occurred");
  }

  #log(message: string): void {
    if (this.config.debug) {
      diag.debug(`[${INSTRUMENTATION_NAME}] ${message}`);
    }
  }

  #logError(message: string, err: unknown): void {
    const error = this.#ensureError(err);
    diag.warn(`[${INSTRUMENTATION_NAME}] ${message}:`, error);
  }
}
