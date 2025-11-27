import { Array as Arr, Option, Schema } from "effect";
import type { Span } from "./Span";
import { getAttributeAsString, getSpanDuration, isRootSpan } from "./Span";

export interface Trace {
  readonly traceId: string;
  readonly spans: ReadonlyArray<Span>;
  readonly source: "client" | "server";
}

export const TraceSchema = Schema.Struct({
  traceId: Schema.String,
  spans: Schema.Array(Schema.Unknown),
  source: Schema.Literal("client", "server"),
});

export const getRootSpan = (trace: Trace): Option.Option<Span> =>
  Arr.findFirst(trace.spans, isRootSpan);

export const getTotalDuration = (trace: Trace): bigint =>
  Option.match(getRootSpan(trace), {
    onNone: () => 0n,
    onSome: getSpanDuration,
  });

export const getServiceName = (trace: Trace): Option.Option<string> =>
  Option.flatMap(getRootSpan(trace), (span) =>
    Option.fromNullable(getAttributeAsString(span, "service.name")),
  );

export const getSpanCount = (trace: Trace): number => trace.spans.length;

export interface SpanNode {
  readonly span: Span;
  readonly children: ReadonlyArray<SpanNode>;
}

export const buildSpanTree = (
  spans: ReadonlyArray<Span>,
): ReadonlyArray<SpanNode> => {
  const spanMap = new Map<string, Span>();
  const childrenMap = new Map<string, Span[]>();

  for (const span of spans) {
    spanMap.set(span.spanId, span);

    if (span.parentSpanId) {
      if (!childrenMap.has(span.parentSpanId)) {
        childrenMap.set(span.parentSpanId, []);
      }
      childrenMap.get(span.parentSpanId)?.push(span);
    }
  }

  const buildNode = (span: Span): SpanNode => ({
    span,
    children: (childrenMap.get(span.spanId) || []).map(buildNode),
  });

  return spans.filter(isRootSpan).map(buildNode);
};

export const getMaxDepth = (nodes: ReadonlyArray<SpanNode>): number => {
  if (nodes.length === 0) return 0;

  const depths = nodes.map((node) => 1 + getMaxDepth(node.children));

  return Math.max(...depths);
};
