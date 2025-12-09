import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_URL_FULL,
} from "@opentelemetry/semantic-conventions";
import { SERVER_PORT } from "@nextdoctor/shared";
import {
  getRequestContext,
  ATTR_REQUEST_ID,
  ATTR_FETCH_INITIATOR,
  ATTR_SPAN_CATEGORY,
  ATTR_COMPONENT_FILE,
} from "../request-context.js";
import { BaseInstrumentation } from "./base-instrumentation.js";

const INSTRUMENTATION_NAME = "nextdoctor-fetch-instrumentation";
const INSTRUMENTATION_VERSION = "1.0.0";

const IGNORE_PATTERNS = [
  `localhost:${SERVER_PORT}`,
  "127.0.0.1:19393",
  "_next/webpack",
  "__nextjs_original-stack-frame",
  "favicon.ico",
];

export interface FetchInstrumentationConfig {
  debug?: boolean;
  ignoreUrls?: (string | RegExp)[];
}

type GlobalFetch = typeof globalThis.fetch;

let originalFetch: GlobalFetch | null = null;

export class FetchInstrumentation extends BaseInstrumentation {
  private ignoreUrls: (string | RegExp)[];

  constructor(config: FetchInstrumentationConfig = {}) {
    super({
      debug: config.debug,
      instrumentationName: INSTRUMENTATION_NAME,
      instrumentationVersion: INSTRUMENTATION_VERSION,
    });

    this.ignoreUrls = config.ignoreUrls || [];
  }

  protected patch(): void {
    if (typeof globalThis.fetch !== "function") {
      this.log("fetch not available, skipping patch");
      return;
    }

    if (originalFetch) {
      this.log("fetch already patched, skipping");
      return;
    }

    originalFetch = globalThis.fetch;
    const instrumentation = this;

    globalThis.fetch = async function patchedFetch(
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> {
      const url = instrumentation.extractUrl(input);

      if (instrumentation.shouldIgnore(url)) {
        return originalFetch!(input, init);
      }

      const method = init?.method || "GET";
      const requestCtx = getRequestContext();

      const callSite = instrumentation.getCallSite();

      const attributes: Record<string, string | number | boolean> = {
        [ATTR_HTTP_REQUEST_METHOD]: method,
        [ATTR_URL_FULL]: url,
        [ATTR_SPAN_CATEGORY]: "http",
        "http.request.type": "fetch",
      };

      if (requestCtx) {
        attributes[ATTR_REQUEST_ID] = requestCtx.requestId;
        attributes["nextdoctor.parent.url"] = requestCtx.url;
        if (requestCtx.route) {
          attributes["nextdoctor.parent.route"] = requestCtx.route;
        }
      }

      if (callSite) {
        attributes[ATTR_FETCH_INITIATOR] = callSite.source;
        if (callSite.file) {
          attributes[ATTR_COMPONENT_FILE] = callSite.file;
        }
        if (callSite.functionName) {
          attributes["nextdoctor.fetch.function"] = callSite.functionName;
        }
      }

      const category = instrumentation.categorizeUrl(url);
      if (category !== "http") {
        attributes[ATTR_SPAN_CATEGORY] = category;
      }

      const spanName = instrumentation.createSpanName(method, url, category);

      const tracer = trace.getTracer(INSTRUMENTATION_NAME, INSTRUMENTATION_VERSION);
      const span = tracer.startSpan(spanName, {
        kind: SpanKind.CLIENT,
        attributes,
      }, context.active());

      const ctx = trace.setSpan(context.active(), span);

      return context.with(ctx, async () => {
        const startTime = performance.now();

        try {
          const response = await originalFetch!(input, init);

          span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, response.status);
          span.setAttribute("http.response.duration_ms", performance.now() - startTime);

          const cacheStatus = response.headers.get("x-nextjs-cache") ||
            response.headers.get("x-vercel-cache") ||
            response.headers.get("cf-cache-status");
          if (cacheStatus) {
            span.setAttribute("http.cache.status", cacheStatus);
            if (cacheStatus === "HIT" || cacheStatus === "STALE") {
              attributes[ATTR_SPAN_CATEGORY] = "cache";
            }
          }

          const contentLength = response.headers.get("content-length");
          if (contentLength) {
            span.setAttribute("http.response.body.size", parseInt(contentLength, 10));
          }

          if (response.status >= 400) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: `HTTP ${response.status}`,
            });
          }

          return response;
        } catch (error) {
          span.recordException(error as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: (error as Error).message || "Fetch failed",
          });
          throw error;
        } finally {
          span.end();
        }
      });
    };

    this.log("Successfully patched global fetch");
  }

  protected unpatch(): void {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
      originalFetch = null;
      this.log("Successfully unpatched global fetch");
    }
  }

  private extractUrl(input: RequestInfo | URL): string {
    if (typeof input === "string") {
      return input;
    }
    if (input instanceof URL) {
      return input.toString();
    }
    if (input instanceof Request) {
      return input.url;
    }
    return String(input);
  }

  private shouldIgnore(url: string): boolean {
    for (const pattern of IGNORE_PATTERNS) {
      if (url.includes(pattern)) {
        return true;
      }
    }

    for (const pattern of this.ignoreUrls) {
      if (typeof pattern === "string") {
        if (url.includes(pattern)) return true;
      } else if (pattern instanceof RegExp) {
        if (pattern.test(url)) return true;
      }
    }

    return false;
  }

  private categorizeUrl(url: string): string {
    const urlLower = url.toLowerCase();

    if (urlLower.includes("supabase") || urlLower.includes("prisma") ||
      urlLower.includes("planetscale") || urlLower.includes("neon.tech")) {
      return "database";
    }

    if (urlLower.includes("stripe.com") || urlLower.includes("api.github.com") ||
      urlLower.includes("googleapis.com") || urlLower.includes("api.openai.com")) {
      return "external";
    }

    if (urlLower.includes("auth0.com") || urlLower.includes("clerk.") ||
      urlLower.includes("supabase.co/auth")) {
      return "auth";
    }

    if (urlLower.includes("analytics") || urlLower.includes("gtag") ||
      urlLower.includes("plausible") || urlLower.includes("posthog")) {
      return "analytics";
    }

    return "http";
  }

  private createSpanName(method: string, url: string, category: string): string {
    try {
      const parsed = new URL(url, "http://localhost");
      const path = parsed.pathname;

      if (path.includes("/api/") || path.includes("/rest/")) {
        return `${method} ${path.split("?")[0]}`;
      }

      if (parsed.host && !parsed.host.includes("localhost")) {
        return `${method} ${parsed.host}${path.split("?")[0]}`;
      }

      return `${method} ${path.split("?")[0]}`;
    } catch {
      return `${method} ${url.substring(0, 50)}`;
    }
  }

  private getCallSite(): { source: string; file?: string; functionName?: string } | null {
    try {
      const err = new Error();
      const stack = err.stack;
      if (!stack) return null;

      const lines = stack.split("\n");

      const skipPatterns = [
        "node_modules",
        "nextdoctor",
        "next/dist",
        "<anonymous>",
        "node:internal",
        "node:async_hooks",
        "node:events",
        "node:net",
        "node:http",
        "node:https",
        "node:stream",
        "node:buffer",
        "internal/process",
        "internal/modules",
        "runMicrotasks",
        "processTicksAndRejections",
        "AsyncResource",
        "webpack",
        "turbopack",
        "__webpack",
        "Module._compile",
        "Object.Module",
      ];

      for (let i = 3; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;

        const shouldSkip = skipPatterns.some(pattern => line.includes(pattern));
        if (shouldSkip) continue;

        const match = line.match(/at\s+(?:(.+?)\s+\()?(.*?):(\d+):(\d+)\)?/);
        if (match) {
          const functionName = match[1] || "anonymous";
          const file = match[2];

          if (!file || file.includes("node:") || file.includes("internal/")) {
            continue;
          }

          const cleanFile = file
            ?.replace(/^file:\/\//, "")
            ?.replace(/.*\/\.next\/server\//, ".next/server/")
            ?.replace(/.*\/app\//, "app/")
            ?.replace(/.*\/src\//, "src/")
            ?.replace(/.*\/pages\//, "pages/")
            ?.replace(/.*\/components\//, "components/")
            ?.replace(/.*\/lib\//, "lib/");

          if (cleanFile && !cleanFile.startsWith("node:")) {
            return {
              source: `${cleanFile}:${match[3]}`,
              file: cleanFile,
              functionName: functionName !== "anonymous" ? functionName : undefined,
            };
          }
        }
      }
    } catch {
    }

    return null;
  }
}
