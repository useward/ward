import type { EventEmitter } from "node:events";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

type TelemetryEvent = {
  origin: string;
  entity: string;
  data: string;
};

export function createTelemetryStreamRouter(eventEmitter: EventEmitter) {
  const telemetryStreamRouter = new Hono();

  telemetryStreamRouter.get("/v1/telemetry-stream", (c) =>
    streamSSE(c, async (stream) => {
      const handler = async ({ origin, entity, data }: TelemetryEvent) => {
        await stream.writeSSE({
          data,
          event: `${origin}-${entity}`,
          id: crypto.randomUUID(),
        });
      };

      eventEmitter.on("telemetry", handler);

      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          eventEmitter.off("telemetry", handler);
          resolve();
        });
      });
    }),
  );

  return telemetryStreamRouter;
}
