import { Array as A, pipe } from "effect";
import type {
  AnyValue,
  KeyValue,
  OTLPExportTraceServiceRequest,
  OTLPSpan,
} from "./otel-types";
import { StatusCode } from "./otel-types";
import type { SpanCategory, SpanOrigin, SpanStatus, TraceSpan } from "./types";

const ATTR_REQUEST_ID = "nextdoctor.request.id";
const ATTR_SESSION_ID = "nextdoctor.session.id";
const ATTR_PROJECT_ID = "nextdoctor.project.id";
const ATTR_SPAN_CATEGORY = "nextdoctor.span.category";

interface RawSpan extends TraceSpan {
  readonly requestId: string | undefined;
  readonly sessionId: string | undefined;
  readonly projectId: string | undefined;
}

const extractAttributeValue = (
  value: AnyValue,
): string | number | boolean | undefined => {
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.boolValue !== undefined) return value.boolValue;
  if (value.intValue !== undefined) return parseInt(value.intValue, 10);
  if (value.doubleValue !== undefined) return value.doubleValue;
  return undefined;
};

const parseAttributes = (
  attrs: ReadonlyArray<KeyValue> | undefined,
): Record<string, string | number | boolean> => {
  if (!attrs) return {};
  return pipe(
    attrs,
    A.reduce({} as Record<string, string | number | boolean>, (acc, kv) => {
      const val = extractAttributeValue(kv.value);
      if (val !== undefined) {
        return { ...acc, [kv.key]: val };
      }
      return acc;
    }),
  );
};

const parseStatus = (status: OTLPSpan["status"]): SpanStatus => {
  if (!status) return "unset";
  if (status.code === StatusCode.ERROR) return "error";
  if (status.code === StatusCode.OK) return "ok";
  return "unset";
};

const VALID_CATEGORIES: ReadonlyArray<SpanCategory> = [
  "http",
  "render",
  "hydration",
  "database",
  "cache",
  "external",
  "middleware",
  "other",
];

const normalizeCategory = (
  category: string | undefined,
): SpanCategory | undefined => {
  if (!category) return undefined;
  if (VALID_CATEGORIES.includes(category as SpanCategory)) {
    return category as SpanCategory;
  }
  return undefined;
};

const inferCategory = (
  name: string,
  attrs: Record<string, string | number | boolean>,
): SpanCategory => {
  const nameLower = name.toLowerCase();

  if (
    attrs["http.method"] ||
    attrs["http.request.method"] ||
    nameLower.includes("fetch") ||
    nameLower.includes("http")
  ) {
    return "http";
  }

  if (
    attrs["db.system"] ||
    nameLower.includes("database") ||
    nameLower.includes("query") ||
    nameLower.includes("prisma")
  ) {
    return "database";
  }

  if (nameLower.includes("cache") || attrs["cache.hit"] !== undefined) {
    return "cache";
  }

  if (
    nameLower.includes("render") ||
    nameLower.includes("rsc") ||
    nameLower.includes("component")
  ) {
    return "render";
  }

  if (nameLower.includes("hydrat")) {
    return "hydration";
  }

  if (nameLower.includes("middleware")) {
    return "middleware";
  }

  if (attrs["peer.service"] || attrs["net.peer.name"]) {
    return "external";
  }

  return "other";
};

const nanoToMs = (nano: string): number =>
  Math.floor(parseInt(nano, 10) / 1_000_000);

export const convertOTLPSpan = (
  span: OTLPSpan,
  origin: SpanOrigin,
): RawSpan => {
  const startTime = nanoToMs(span.startTimeUnixNano);
  const endTime = nanoToMs(span.endTimeUnixNano);
  const attributes = parseAttributes(span.attributes);
  const customCategory = attributes[ATTR_SPAN_CATEGORY] as string | undefined;
  const category =
    normalizeCategory(customCategory) ?? inferCategory(span.name, attributes);
  const requestId = attributes[ATTR_REQUEST_ID] as string | undefined;
  const sessionId = attributes[ATTR_SESSION_ID] as string | undefined;
  const projectId = attributes[ATTR_PROJECT_ID] as string | undefined;

  return {
    id: span.spanId,
    parentId: span.parentSpanId,
    traceId: span.traceId,
    name: span.name,
    origin,
    category,
    startTime,
    endTime,
    duration: endTime - startTime,
    status: parseStatus(span.status),
    attributes,
    children: [],
    requestId,
    sessionId,
    projectId,
  };
};

export const extractSpansFromPayload = (
  payload: OTLPExportTraceServiceRequest,
  origin: SpanOrigin,
): ReadonlyArray<RawSpan> =>
  pipe(
    payload.resourceSpans ?? [],
    A.flatMap((rs) => rs.scopeSpans ?? []),
    A.flatMap((ss) => ss.spans ?? []),
    A.map((span) => convertOTLPSpan(span, origin)),
  );

export const groupSpansByTraceId = (
  spans: ReadonlyArray<RawSpan>,
): Map<string, RawSpan[]> => {
  const result = new Map<string, RawSpan[]>();
  for (const span of spans) {
    const existing = result.get(span.traceId) ?? [];
    result.set(span.traceId, [...existing, span]);
  }
  return result;
};

export const groupSpansByRequestId = (
  spans: ReadonlyArray<RawSpan>,
): Map<string, RawSpan[]> => {
  const result = new Map<string, RawSpan[]>();
  for (const span of spans) {
    if (span.requestId) {
      const existing = result.get(span.requestId) ?? [];
      result.set(span.requestId, [...existing, span]);
    }
  }
  return result;
};

export const groupSpansBySessionId = (
  spans: ReadonlyArray<RawSpan>,
): Map<string, RawSpan[]> => {
  const result = new Map<string, RawSpan[]>();
  for (const span of spans) {
    if (span.sessionId) {
      const existing = result.get(span.sessionId) ?? [];
      result.set(span.sessionId, [...existing, span]);
    }
  }
  return result;
};

export const buildSpanTree = (
  spans: ReadonlyArray<TraceSpan>,
): TraceSpan | undefined => {
  if (spans.length === 0) return undefined;

  const spanMap = new Map(
    spans.map((s) => [s.id, { ...s, children: [] as TraceSpan[] }]),
  );
  const spanIdSet = new Set(spans.map((s) => s.id));

  for (const span of spanMap.values()) {
    if (span.parentId && spanMap.has(span.parentId)) {
      const parent = spanMap.get(span.parentId)!;
      parent.children = [...parent.children, span].sort(
        (a, b) => a.startTime - b.startTime,
      );
    }
  }

  const root = [...spanMap.values()].find(
    (s) => !s.parentId || !spanIdSet.has(s.parentId),
  );
  return (
    root ?? [...spanMap.values()].sort((a, b) => a.startTime - b.startTime)[0]
  );
};

export type { RawSpan };
