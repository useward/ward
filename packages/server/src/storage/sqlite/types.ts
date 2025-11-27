export interface SpanRow {
  readonly trace_id: string;
  readonly span_id: string;
  readonly parent_span_id: string | null;
  readonly name: string;
  readonly kind: number;
  readonly start_time_unix_nano: string;
  readonly end_time_unix_nano: string;
  readonly attributes: string;
  readonly events: string;
  readonly status: string;
  readonly source: "client" | "server";
  readonly created_at: number;
}

export interface MetricRow {
  readonly id: number;
  readonly name: string;
  readonly type: "gauge" | "sum" | "histogram";
  readonly data_points: string;
  readonly source: "client" | "server";
  readonly created_at: number;
}

export interface TraceRow {
  readonly trace_id: string;
  readonly source: "client" | "server";
  readonly min_time: string;
}
