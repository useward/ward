export function wardMiddleware(request: Request, response: Response): Response {
  const traceparent = request.headers.get("traceparent");
  const tracestate = request.headers.get("tracestate");

  if (traceparent) {
    response.headers.set("traceparent", traceparent);
  }

  if (tracestate) {
    response.headers.set("tracestate", tracestate);
  }

  return response;
}
