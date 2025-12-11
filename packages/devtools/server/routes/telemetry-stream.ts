import type { EventEmitter } from "node:events";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

type TelemetryEvent = {
  origin: string;
  entity: string;
  data: string;
};

type NavigationEvent = {
  sessionId: string;
  url: string;
  route: string;
  navigationType: string;
  previousSessionId: string | null;
  timing: {
    navigationStart: number;
    responseStart: number | null;
    domContentLoaded: number | null;
    load: number | null;
  };
};

export function createTelemetryStreamRouter(eventEmitter: EventEmitter) {
  const telemetryStreamRouter = new Hono();

  telemetryStreamRouter.get("/v1/telemetry-stream", (c) =>
    streamSSE(c, async (stream) => {
      const telemetryHandler = async ({ origin, entity, data }: TelemetryEvent) => {
        await stream.writeSSE({
          data,
          event: `${origin}-${entity}`,
          id: crypto.randomUUID(),
        });
      };

      const navigationHandler = async (event: NavigationEvent) => {
        await stream.writeSSE({
          data: JSON.stringify(event),
          event: "navigation-event",
          id: crypto.randomUUID(),
        });
      };

      eventEmitter.on("telemetry", telemetryHandler);
      eventEmitter.on("navigation-event", navigationHandler);

      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          eventEmitter.off("telemetry", telemetryHandler);
          eventEmitter.off("navigation-event", navigationHandler);
          resolve();
        });
      });
    }),
  );

  return telemetryStreamRouter;
}
