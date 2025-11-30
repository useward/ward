import { Schema } from "effect";

export interface Span {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId: string | null;
  readonly name: string;
  readonly kind: number;
  readonly startTimeUnixNano: string;
  readonly endTimeUnixNano: string;
  readonly attributes: ReadonlyArray<KeyValue>;
  readonly events: ReadonlyArray<SpanEvent>;
  readonly status: SpanStatus;
  readonly source: "client" | "server";
}

export interface KeyValue {
  readonly key: string;
  readonly value: AttributeValue;
}

export type AttributeValue =
  | { readonly type: "string"; readonly value: string }
  | { readonly type: "int"; readonly value: number }
  | { readonly type: "double"; readonly value: number }
  | { readonly type: "bool"; readonly value: boolean };

export interface SpanEvent {
  readonly name: string;
  readonly timeUnixNano: string;
  readonly attributes: ReadonlyArray<KeyValue>;
}

export interface SpanStatus {
  readonly code: number;
  readonly message?: string;
}

export const AttributeValueSchema = Schema.Union(
  Schema.Struct({
    type: Schema.Literal("string"),
    value: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("int"),
    value: Schema.Number,
  }),
  Schema.Struct({
    type: Schema.Literal("double"),
    value: Schema.Number,
  }),
  Schema.Struct({
    type: Schema.Literal("bool"),
    value: Schema.Boolean,
  }),
);

export const KeyValueSchema = Schema.Struct({
  key: Schema.String,
  value: AttributeValueSchema,
});

export const SpanEventSchema = Schema.Struct({
  name: Schema.String,
  timeUnixNano: Schema.String,
  attributes: Schema.Array(KeyValueSchema),
});

export const SpanStatusSchema = Schema.Struct({
  code: Schema.Number,
  message: Schema.optional(Schema.String),
});

export const SpanSchema = Schema.Struct({
  traceId: Schema.String,
  spanId: Schema.String,
  parentSpanId: Schema.NullOr(Schema.String),
  name: Schema.String,
  kind: Schema.Number,
  startTimeUnixNano: Schema.String,
  endTimeUnixNano: Schema.String,
  attributes: Schema.Array(KeyValueSchema),
  events: Schema.Array(SpanEventSchema),
  status: SpanStatusSchema,
  source: Schema.Literal("client", "server"),
});

export const isRootSpan = (span: Span): boolean => span.parentSpanId === null;

export const getSpanDuration = (span: Span): bigint =>
  BigInt(span.endTimeUnixNano) - BigInt(span.startTimeUnixNano);

export const findAttribute = (
  span: Span,
  key: string,
): AttributeValue | undefined =>
  span.attributes.find((attr) => attr.key === key)?.value;

export const getAttributeAsString = (
  span: Span,
  key: string,
): string | undefined => {
  const attr = findAttribute(span, key);
  if (!attr) return undefined;

  switch (attr.type) {
    case "string":
      return attr.value;
    case "int":
    case "double":
      return String(attr.value);
    case "bool":
      return attr.value ? "true" : "false";
  }
};
