import type {
  AttributeValue,
  KeyValue,
  Metric,
  Span,
} from "@nextdoctor/core/domain";
import { InvalidMetricError, InvalidSpanError } from "@nextdoctor/core/errors";
import { OtlpParser } from "@nextdoctor/core/services";
import { Effect, Layer } from "effect";

type OTLPTraceRequest = {
  resourceSpans?: Array<{
    resource?: {
      attributes?: Array<{
        key?: string;
        value?: {
          stringValue?: string;
          intValue?: string | number;
          doubleValue?: number;
          boolValue?: boolean;
          arrayValue?: { values?: unknown[] };
          kvlistValue?: { values?: unknown[] };
        };
      }>;
    };
    scopeSpans?: Array<{
      spans?: Array<{
        traceId?: Uint8Array | string;
        spanId?: Uint8Array | string;
        parentSpanId?: Uint8Array | string;
        name?: string;
        kind?: number;
        startTimeUnixNano?: string | number;
        endTimeUnixNano?: string | number;
        attributes?: Array<{
          key?: string;
          value?: {
            stringValue?: string;
            intValue?: string | number;
            doubleValue?: number;
            boolValue?: boolean;
          };
        }>;
        events?: Array<{
          name?: string;
          timeUnixNano?: string | number;
          attributes?: Array<{
            key?: string;
            value?: {
              stringValue?: string;
              intValue?: string | number;
              doubleValue?: number;
              boolValue?: boolean;
            };
          }>;
        }>;
        status?: {
          code?: number;
          message?: string;
        };
      }>;
    }>;
  }>;
};

type OTLPMetricRequest = {
  resourceMetrics?: Array<{
    resource?: {
      attributes?: Array<{
        key?: string;
        value?: {
          stringValue?: string;
          intValue?: string | number;
          doubleValue?: number;
          boolValue?: boolean;
        };
      }>;
    };
    scopeMetrics?: Array<{
      metrics?: Array<{
        name?: string;
        gauge?: {
          dataPoints?: Array<{
            attributes?: Array<{
              key?: string;
              value?: {
                stringValue?: string;
                intValue?: string | number;
                doubleValue?: number;
                boolValue?: boolean;
              };
            }>;
            timeUnixNano?: string | number;
            asDouble?: number;
            asInt?: string | number;
          }>;
        };
        sum?: {
          dataPoints?: Array<{
            attributes?: Array<{
              key?: string;
              value?: {
                stringValue?: string;
                intValue?: string | number;
                doubleValue?: number;
                boolValue?: boolean;
              };
            }>;
            timeUnixNano?: string | number;
            asDouble?: number;
            asInt?: string | number;
          }>;
        };
        histogram?: {
          dataPoints?: Array<{
            attributes?: Array<{
              key?: string;
              value?: {
                stringValue?: string;
                intValue?: string | number;
                doubleValue?: number;
                boolValue?: boolean;
              };
            }>;
            timeUnixNano?: string | number;
            count?: string | number;
            sum?: number;
            bucketCounts?: Array<string | number>;
            explicitBounds?: Array<number>;
          }>;
        };
      }>;
    }>;
  }>;
};

type OTLPKeyValue = {
  key?: string;
  value?: {
    stringValue?: string;
    intValue?: string | number;
    doubleValue?: number;
    boolValue?: boolean;
    arrayValue?: { values?: unknown[] };
    kvlistValue?: { values?: unknown[] };
  };
};

const convertOtlpAttribute = (attr: OTLPKeyValue): KeyValue => {
  const value = attr.value;
  let attributeValue: AttributeValue;

  if (!value) {
    attributeValue = { type: "string", value: "" };
  } else if (value.stringValue !== undefined) {
    attributeValue = { type: "string", value: value.stringValue };
  } else if (value.intValue !== undefined) {
    attributeValue = { type: "int", value: Number(value.intValue) };
  } else if (value.doubleValue !== undefined) {
    attributeValue = { type: "double", value: value.doubleValue };
  } else if (value.boolValue !== undefined) {
    attributeValue = { type: "bool", value: value.boolValue };
  } else {
    attributeValue = { type: "string", value: JSON.stringify(value) };
  }

  return { key: attr.key || "", value: attributeValue };
};

const make = Effect.sync(() =>
  OtlpParser.of({
    parseTraces: (payload, source) =>
      Effect.try({
        try: (): ReadonlyArray<Span> => {
          const request = payload as OTLPTraceRequest;
          const spans: Span[] = [];

          for (const resourceSpan of request.resourceSpans || []) {
            for (const scopeSpan of resourceSpan.scopeSpans || []) {
              for (const span of scopeSpan.spans || []) {
                const toHex = (id?: Uint8Array | string): string => {
                  if (!id) return "";
                  if (typeof id === "string") return id;
                  return Buffer.from(id).toString("hex");
                };

                spans.push({
                  traceId: toHex(span.traceId),
                  spanId: toHex(span.spanId),
                  parentSpanId: span.parentSpanId
                    ? toHex(span.parentSpanId)
                    : null,
                  name: span.name || "",
                  kind: span.kind || 0,
                  startTimeUnixNano: (span.startTimeUnixNano || "0").toString(),
                  endTimeUnixNano: (span.endTimeUnixNano || "0").toString(),
                  attributes: (span.attributes || []).map(convertOtlpAttribute),
                  events: (span.events || []).map((event) => ({
                    name: event.name || "",
                    timeUnixNano: (event.timeUnixNano || "0").toString(),
                    attributes: (event.attributes || []).map(
                      convertOtlpAttribute,
                    ),
                  })),
                  status: {
                    code: span.status?.code || 0,
                    message: span.status?.message,
                  },
                  source,
                });
              }
            }
          }

          return spans;
        },
        catch: (error) =>
          new InvalidSpanError({
            message: `Failed to parse OTLP traces: ${error}`,
          }),
      }),

    parseMetrics: (payload, source) =>
      Effect.try({
        try: (): ReadonlyArray<Metric> => {
          const request = payload as OTLPMetricRequest;
          const metrics: Metric[] = [];

          for (const resourceMetric of request.resourceMetrics || []) {
            for (const scopeMetric of resourceMetric.scopeMetrics || []) {
              for (const metric of scopeMetric.metrics || []) {
                const name = metric.name || "unknown";

                if (metric.gauge) {
                  const dataPoints = (metric.gauge.dataPoints || []).map(
                    (dp) => ({
                      value: (dp.asDouble as number) || Number(dp.asInt) || 0,
                      timeUnixNano: (dp.timeUnixNano || "0").toString(),
                      attributes: (dp.attributes || []).map(
                        convertOtlpAttribute,
                      ),
                    }),
                  );

                  metrics.push({ name, type: "gauge", dataPoints, source });
                } else if (metric.sum) {
                  const dataPoints = (metric.sum.dataPoints || []).map(
                    (dp) => ({
                      value: (dp.asDouble as number) || Number(dp.asInt) || 0,
                      timeUnixNano: (dp.timeUnixNano || "0").toString(),
                      attributes: (dp.attributes || []).map(
                        convertOtlpAttribute,
                      ),
                    }),
                  );

                  metrics.push({ name, type: "sum", dataPoints, source });
                } else if (metric.histogram) {
                  const dataPoints = (metric.histogram.dataPoints || []).map(
                    (dp) => ({
                      value: dp.sum || 0,
                      timeUnixNano: (dp.timeUnixNano || "0").toString(),
                      attributes: [
                        ...(dp.attributes || []).map(convertOtlpAttribute),
                        {
                          key: "count",
                          value: {
                            type: "int" as const,
                            value: Number(dp.count) || 0,
                          },
                        },
                      ],
                    }),
                  );

                  metrics.push({ name, type: "histogram", dataPoints, source });
                }
              }
            }
          }

          return metrics;
        },
        catch: (error) =>
          new InvalidMetricError({
            message: `Failed to parse OTLP metrics: ${error}`,
          }),
      }),
  }),
);

export const OtlpParserLive = Layer.effect(OtlpParser, make);
