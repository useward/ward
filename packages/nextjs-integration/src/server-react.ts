import { context, type Span, SpanKind, trace } from "@opentelemetry/api";
import * as ReactOriginal from "react";
import { cache as reactCache } from "react";

const INSTRUMENTATION_NAME = "react-cache-instrumentation";
const INSTRUMENTATION_VERSION = "1.0.0";

export function cache<CachedFunction extends Function>(
  fn: CachedFunction,
): CachedFunction {
  const tracer = trace.getTracer(INSTRUMENTATION_NAME, INSTRUMENTATION_VERSION);
  const cachedFn = reactCache(fn);

  const instrumentedFn = function (this: unknown, ...args: unknown[]): unknown {
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

        if (
          result &&
          typeof result === "object" &&
          typeof result.then === "function"
        ) {
          return (result as Promise<unknown>)
            .then((value: unknown) => {
              const duration = performance.now() - start;
              span.setAttribute("react.cache.duration_ms", duration);
              span.setAttribute("react.cache.async", true);
              span.end();
              return value;
            })
            .catch((error: unknown) => {
              recordError(span, error);
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
        recordError(span, error);
        span.end();
        throw error;
      }
    });
  };

  Object.defineProperty(instrumentedFn, "name", {
    value: fn.name || "cachedFunction",
    configurable: true,
  });

  return instrumentedFn as unknown as CachedFunction;
}

function recordError(span: Span, err: unknown): void {
  const error = err instanceof Error ? err : new Error(String(err));

  span.recordException(error);
  span.setStatus({
    code: 2, // SpanStatusCode.ERROR
    message: error.message || "React cache error",
  });
}

// Re-export only React Server Components compatible APIs
// Note: Component, PureComponent, createContext, and client-only hooks
// are not available in RSC environment
export const Children = ReactOriginal.Children;
export const Fragment = ReactOriginal.Fragment;
export const Profiler = ReactOriginal.Profiler;
export const StrictMode = ReactOriginal.StrictMode;
export const Suspense = ReactOriginal.Suspense;
export const cloneElement = ReactOriginal.cloneElement;
export const createElement = ReactOriginal.createElement;
export const createRef = ReactOriginal.createRef;
export const forwardRef = ReactOriginal.forwardRef;
export const isValidElement = ReactOriginal.isValidElement;
export const lazy = ReactOriginal.lazy;
export const memo = ReactOriginal.memo;
export const use = ReactOriginal.use;
export const useCallback = ReactOriginal.useCallback;
export const useDebugValue = ReactOriginal.useDebugValue;
export const useId = ReactOriginal.useId;
export const useMemo = ReactOriginal.useMemo;
export const version = ReactOriginal.version;

export default ReactOriginal;
