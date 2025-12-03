import { context, type Span, SpanKind, trace } from "@opentelemetry/api";
import { BaseInstrumentation } from "./base-instrumentation";

const INSTRUMENTATION_NAME = "react-cache-instrumentation";
const INSTRUMENTATION_VERSION = "1.0.0";

export interface ReactCacheInstrumentationConfig {
  debug?: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: Generic cache function signature
let originalReactCache: ((...args: any[]) => any) | undefined;

export class ReactCacheInstrumentation extends BaseInstrumentation {
  private reactCachePatched = false;

  constructor(userConfig: ReactCacheInstrumentationConfig = {}) {
    super({
      debug: userConfig.debug,
      instrumentationName: INSTRUMENTATION_NAME,
      instrumentationVersion: INSTRUMENTATION_VERSION,
    });
  }

  protected patch(): void {
    if (this.reactCachePatched) {
      this.log("React cache already patched, skipping");
      return;
    }

    try {
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic require for React module
      const reactModule = require("react") as any;

      if (!reactModule?.cache || typeof reactModule.cache !== "function") {
        this.log("React.cache not found; skipping patch");
        return;
      }

      if (!originalReactCache) {
        originalReactCache = reactModule.cache;
      }

      if (!originalReactCache) {
        this.log("Failed to store original React.cache");
        return;
      }

      reactModule.cache = this.createCachePatch(originalReactCache);
      this.reactCachePatched = true;

      this.log("Successfully patched React.cache");
    } catch (err) {
      this.logError("Failed to patch React.cache", err);
    }
  }

  protected unpatch(): void {
    if (!this.reactCachePatched) return;

    try {
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic require for React module
      const reactModule = require("react") as any;

      if (originalReactCache && reactModule) {
        reactModule.cache = originalReactCache;
        this.log("Successfully unpatched React.cache");
      }
    } catch (err) {
      this.logError("Failed to unpatch React.cache", err);
    } finally {
      this.reactCachePatched = false;
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: Generic cache function requires any
  private createCachePatch(original: (...args: any[]) => any): (...args: any[]) => any {
    const instrumentation = this;
    const tracer = this.tracer;

    // biome-ignore lint/suspicious/noExplicitAny: Generic cache wrapper requires any
    return function patchedCache<T extends (...args: any[]) => any>(fn: T): T {
      const cachedFn = original(fn);

      // biome-ignore lint/suspicious/noExplicitAny: Generic instrumented function requires any
      const instrumentedFn = function (this: unknown, ...args: any[]): any {
        const functionName = fn.name || "anonymous";
        const span = tracer.startSpan(
          "react.cache",
          {
            kind: SpanKind.INTERNAL,
            attributes: {
              "react.cache.function": functionName,
              "react.cache.args_count": args.length,
            },
          },
          context.active(),
        );

        const ctx = trace.setSpan(context.active(), span);

        return context.with(ctx, () => {
          const start = performance.now();

          try {
            const result = cachedFn.apply(this, args);

            if (result && typeof result === "object" && typeof result.then === "function") {
              return result
                // biome-ignore lint/suspicious/noExplicitAny: Promise result type is unknown
                .then((value: any) => {
                  const duration = performance.now() - start;
                  span.setAttribute("react.cache.duration_ms", duration);
                  span.setAttribute("react.cache.async", true);
                  span.end();
                  return value;
                })
                // biome-ignore lint/suspicious/noExplicitAny: Error type is unknown
                .catch((error: any) => {
                  instrumentation.recordError(span, error);
                  span.end();
                  throw error;
                });
            }

            const duration = performance.now() - start;
            span.setAttribute("react.cache.duration_ms", duration);
            span.setAttribute("react.cache.async", false);
            span.end();

            return result;
          } catch (error) {
            instrumentation.recordError(span, error);
            span.end();
            throw error;
          }
        });
      };

      Object.defineProperty(instrumentedFn, "name", {
        value: fn.name || "cachedFunction",
        configurable: true,
      });

      return instrumentedFn as T;
    };
  }

  private recordError(span: Span, err: unknown): void {
    const error = this.ensureError(err);

    span.recordException(error);
    span.setStatus({
      code: 2, // SpanStatusCode.ERROR
      message: error.message || "React cache error",
    });
  }
}
