export interface OTLPExportTraceServiceRequest {
  readonly resourceSpans: ReadonlyArray<ResourceSpans>;
}

export interface ResourceSpans {
  readonly resource: Resource;
  readonly scopeSpans: ReadonlyArray<ScopeSpans>;
}

export interface Resource {
  readonly attributes: ReadonlyArray<KeyValue>;
}

export interface ScopeSpans {
  readonly scope: InstrumentationScope;
  readonly spans: ReadonlyArray<OTLPSpan>;
}

export interface InstrumentationScope {
  readonly name: string;
  readonly version?: string;
}

export interface OTLPSpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly name: string;
  readonly kind: number;
  readonly startTimeUnixNano: string;
  readonly endTimeUnixNano: string;
  readonly attributes?: ReadonlyArray<KeyValue>;
  readonly status?: SpanStatus;
}

export interface SpanStatus {
  readonly code: number;
  readonly message?: string;
}

export interface KeyValue {
  readonly key: string;
  readonly value: AnyValue;
}

export interface AnyValue {
  readonly stringValue?: string;
  readonly boolValue?: boolean;
  readonly intValue?: string;
  readonly doubleValue?: number;
}

export const StatusCode = {
  UNSET: 0,
  OK: 1,
  ERROR: 2,
} as const;
