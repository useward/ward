import type { Span } from "@opentelemetry/api";

const AsyncLocalStorage =
  (globalThis as unknown as { AsyncLocalStorage: typeof import("node:async_hooks").AsyncLocalStorage }).AsyncLocalStorage;

export interface RequestContext {
  requestId: string;
  sessionId: string;
  rootSpan: Span;
  url: string;
  startTime: number;
  route?: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateSessionId(): string {
  return `srv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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

export function runWithRequestContext<T>(
  ctx: RequestContext,
  fn: () => T
): T {
  return requestContextStorage.run(ctx, fn);
}

export const ATTR_REQUEST_ID = "nextdoctor.request.id";
export const ATTR_REQUEST_URL = "nextdoctor.request.url";
export const ATTR_REQUEST_ROUTE = "nextdoctor.request.route";
export const ATTR_COMPONENT_NAME = "nextdoctor.component.name";
export const ATTR_COMPONENT_FILE = "nextdoctor.component.file";
export const ATTR_FETCH_INITIATOR = "nextdoctor.fetch.initiator";
export const ATTR_SPAN_CATEGORY = "nextdoctor.span.category";
