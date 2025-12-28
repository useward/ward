import type { Span } from "@opentelemetry/api";
import { SERVER_SESSION_ID_PREFIX } from "@useward/shared";

const AsyncLocalStorage = (
  globalThis as unknown as {
    AsyncLocalStorage: typeof import("node:async_hooks").AsyncLocalStorage;
  }
).AsyncLocalStorage;

export interface RequestContext {
  requestId: string;
  sessionId: string;
  rootSpan: Span;
  url: string;
  startTime: number;
  route?: string;
}

const STORAGE_KEY = Symbol.for("ward.requestContextStorage");
const globalWithStorage = globalThis as unknown as Record<
  symbol,
  import("node:async_hooks").AsyncLocalStorage<RequestContext>
>;

if (!globalWithStorage[STORAGE_KEY]) {
  globalWithStorage[STORAGE_KEY] = new AsyncLocalStorage<RequestContext>();
}

export const requestContextStorage = globalWithStorage[STORAGE_KEY];

export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateSessionId(): string {
  return `${SERVER_SESSION_ID_PREFIX}${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

export function getRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}

export function getRootSpan(): Span | undefined {
  return requestContextStorage.getStore()?.rootSpan;
}

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return requestContextStorage.run(ctx, fn);
}

export const ATTR_REQUEST_ID = "ward.request.id";
export const ATTR_REQUEST_URL = "ward.request.url";
export const ATTR_REQUEST_ROUTE = "ward.request.route";
export const ATTR_COMPONENT_NAME = "ward.component.name";
export const ATTR_COMPONENT_FILE = "ward.component.file";
export const ATTR_FETCH_INITIATOR = "ward.fetch.initiator";
export const ATTR_SPAN_CATEGORY = "ward.span.category";
