export const SERVER_PORT = 19393;

export const CLIENT_TRACES_ROUTE = "/v1/client-traces";
export const CLIENT_METRICS_ROUTE = "/v1/client-metrics";
export const SERVER_TRACES_ROUTE = "/v1/server-traces";
export const SERVER_METRICS_ROUTE = "/v1/server-metrics";
export const NAVIGATION_EVENTS_ROUTE = "/v1/navigation-events";

export const CLIENT_TRACES_ENDPOINT = `http://localhost:${SERVER_PORT}${CLIENT_TRACES_ROUTE}`;
export const CLIENT_METRICS_ENDPOINT = `http://localhost:${SERVER_PORT}${CLIENT_METRICS_ROUTE}`;
export const SERVER_TRACES_ENDPOINT = `http://localhost:${SERVER_PORT}${SERVER_TRACES_ROUTE}`;
export const SERVER_METRICS_ENDPOINT = `http://localhost:${SERVER_PORT}${SERVER_METRICS_ROUTE}`;
export const NAVIGATION_EVENTS_ENDPOINT = `http://localhost:${SERVER_PORT}${NAVIGATION_EVENTS_ROUTE}`;

export const SESSION_ID_HEADER = "x-nextdoctor-session-id";
export const ATTR_SESSION_ID = "nextdoctor.session.id";

export const CLIENT_SESSION_ID_PREFIX = "nav_";
export const SERVER_SESSION_ID_PREFIX = "srv_";

export const isValidSessionId = (sessionId: string): boolean =>
  sessionId.startsWith(CLIENT_SESSION_ID_PREFIX) ||
  sessionId.startsWith(SERVER_SESSION_ID_PREFIX);
