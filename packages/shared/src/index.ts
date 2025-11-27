export const SERVER_PORT = 19393;

export const TRACES_ROUTE = "/v1/traces";
export const METRICS_ROUTE = "/v1/metrics";

export const TRACE_ENDPOINT = `http://localhost:${SERVER_PORT}${TRACES_ROUTE}`;
export const METRIC_ENDPOINT = `http://localhost:${SERVER_PORT}${METRICS_ROUTE}`;
