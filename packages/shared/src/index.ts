export const SERVER_PORT = 19393;

export const CLIENT_TRACES_ROUTE = "/v1/client-traces";
export const CLIENT_METRICS_ROUTE = "/v1/client-metrics";
export const SERVER_TRACES_ROUTE = "/v1/server-traces";
export const SERVER_METRICS_ROUTE = "/v1/server-metrics";

export const CLIENT_TRACES_ENDPOINT = `http://localhost:${SERVER_PORT}${CLIENT_TRACES_ROUTE}`;
export const CLIENT_METRICS_ENDPOINT = `http://localhost:${SERVER_PORT}${CLIENT_METRICS_ROUTE}`;
export const SERVER_TRACES_ENDPOINT = `http://localhost:${SERVER_PORT}${SERVER_TRACES_ROUTE}`;
export const SERVER_METRICS_ENDPOINT = `http://localhost:${SERVER_PORT}${SERVER_METRICS_ROUTE}`;
