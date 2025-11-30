import {
  type Attributes,
  type AttributeValue,
  context,
  diag,
  SpanKind,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";
import {
  InstrumentationBase,
  type InstrumentationConfig,
  isWrapped,
} from "@opentelemetry/instrumentation";
import type { IncomingMessage, ServerResponse } from "http";
import { createRequire } from "module";

const require = createRequire(__filename);

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

export class NextJsRscInstrumentation extends InstrumentationBase<InstrumentationConfig> {
  private readonly _userConfig: Required<NextJsRscInstrumentationConfig>;
  private _patchedProto?: NextServerPrototype;

  constructor(userConfig: NextJsRscInstrumentationConfig = {}) {
    super(INSTRUMENTATION_NAME, INSTRUMENTATION_VERSION, {});
    this._userConfig = {
      spanName: userConfig.spanName ?? DEFAULT_SPAN_NAME,
      debug: userConfig.debug ?? false,
    };
  }

  override init() {
    return [];
  }

  override enable() {
    super.enable();
    this._patchNextServer();
  }

  override disable() {
    this._unpatchNextServer();
    super.disable();
  }

  private _patchNextServer(): void {
    try {
      const proto = this._resolveNextServerPrototype();
      if (!proto?.render) {
        this._log("NextServer.prototype.render not found; skipping patch");
        return;
      }

      this._ensureUnwrapped(proto);
      this._wrap(proto, "render", this._createRenderPatch());
      
      this._patchedProto = proto;
      this._log("Successfully patched NextServer.prototype.render");
    } catch (err) {
      this._logError("Failed to patch next-server.js", err);
    }
  }

  private _resolveNextServerPrototype(): NextServerPrototype | undefined {
    const nextServerPath = require.resolve(NEXT_SERVER_PATH);
    const nextServerModule = require(nextServerPath) as NextServerModule;
    const NextServer = nextServerModule?.default ?? nextServerModule;
    return NextServer?.prototype;
  }

  private _ensureUnwrapped(proto: NextServerPrototype): void {
    if (isWrapped(proto.render)) {
      this._log("NextServer.prototype.render already wrapped; unwrapping first");
      this._unwrap(proto, "render");
    }
  }

  private _unpatchNextServer(): void {
    if (!this._patchedProto) return;

    try {
      if (isWrapped(this._patchedProto.render)) {
        this._unwrap(this._patchedProto, "render");
        this._log("Successfully unpatched NextServer.prototype.render");
      }
    } catch (err) {
      this._logError("Failed to unpatch next-server.js", err);
    } finally {
      this._patchedProto = undefined;
    }
  }

  private _createRenderPatch() {
    const instrumentation = this;
    const tracer = this.tracer;
    const spanName = this._userConfig?.spanName || DEFAULT_SPAN_NAME;

    return function patch(original: RenderMethod): RenderMethod {
      return async function wrappedRender(
        this: NextServerPrototype,
        req: IncomingMessage,
        res: ServerResponse,
        parsedUrl?: URL,
      ): Promise<NextServerRenderResponse> {
        const attrs = instrumentation._buildAttributes(req, parsedUrl);
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
            instrumentation._recordSuccess(span, response, res, start);
            return response;
          } catch (err) {
            instrumentation._recordError(span, err);
            throw err;
          } finally {
            span.end();
          }
        });
      };
    };
  }

  private _recordSuccess(
    span: ReturnType<typeof this.tracer.startSpan>,
    response: NextServerRenderResponse,
    res: ServerResponse,
    startTime: number,
  ): void {
    const duration = performance.now() - startTime;
    span.setAttribute("nextjs.render.duration_ms", duration);

    this._setStatusCode(span, response, res);
    this._setStreamingInfo(span, response);
    this._setCacheInfo(span, response);
  }

  private _setStatusCode(
    span: ReturnType<typeof this.tracer.startSpan>,
    response: NextServerRenderResponse,
    res: ServerResponse,
  ): void {
    const status = response?.status ?? response?.statusCode ?? res?.statusCode;

    if (typeof status === "number") {
      span.setAttribute("http.status_code", status);
      
      if (status >= HTTP_SERVER_ERROR_THRESHOLD) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: `HTTP ${status}`,
        });
      }
    }
  }

  private _setStreamingInfo(
    span: ReturnType<typeof this.tracer.startSpan>,
    response: NextServerRenderResponse,
  ): void {
    const isStream =
      response?.body instanceof ReadableStream ||
      (response?.body && typeof response.body.getReader === "function");
    
    span.setAttribute("nextjs.rsc.is_stream", Boolean(isStream));
  }

  private _setCacheInfo(
    span: ReturnType<typeof this.tracer.startSpan>,
    response: NextServerRenderResponse,
  ): void {
    const headers = response?.headers;
    const cacheHeader = headers instanceof Map
      ? headers.get("x-nextjs-cache")
      : headers?.get?.("x-nextjs-cache");

    if (cacheHeader) {
      span.setAttribute("nextjs.cache", cacheHeader);
    }
  }

  private _recordError(
    span: ReturnType<typeof this.tracer.startSpan>,
    err: unknown,
  ): void {
    const error = this._ensureError(err);
    
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message || "Next.js render error",
    });
  }

  private _buildAttributes(req: IncomingMessage, parsedUrl?: URL): Attributes {
    const attrs: Record<string, AttributeValue> = {
      "http.method": req.method ?? "UNKNOWN",
      "nextjs.kind": "render",
      "nextjs.runtime": "node",
    };

    if (req.url) {
      attrs["url.full"] = req.url;
    }

    if (parsedUrl?.pathname) {
      attrs["url.path"] = parsedUrl.pathname;
      attrs["http.route"] = parsedUrl.pathname;
    }

    const host = req.headers?.host;
    if (host) {
      attrs["server.address"] = host;
    }

    return attrs;
  }

  private _ensureError(err: unknown): Error {
    if (err instanceof Error) {
      return err;
    }
    
    if (typeof err === "string") {
      return new Error(err);
    }
    
    return new Error("Unknown error occurred");
  }

  private _log(message: string): void {
    if (this._userConfig?.debug) {
      diag.debug(`[${INSTRUMENTATION_NAME}] ${message}`);
    }
  }

  private _logError(message: string, err: unknown): void {
    const error = this._ensureError(err);
    diag.warn(`[${INSTRUMENTATION_NAME}] ${message}:`, error);
  }
}