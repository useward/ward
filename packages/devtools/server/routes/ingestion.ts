import type { EventEmitter } from "node:events";
import { NAVIGATION_EVENTS_ROUTE } from "@useward/shared";
import { Hono } from "hono";

const origins = ["client", "server"];
const entities = ["metrics", "traces"];
const combinedEntities = origins.flatMap((o) => entities.map((e) => [o, e]));

export function createIngestionRouter(eventEmitter: EventEmitter) {
  const ingestionRouter = new Hono();

  combinedEntities.forEach(([origin, entity]) => {
    ingestionRouter.post(`/v1/${origin}-${entity}`, async (c) => {
      const data = await c.req.text();
      eventEmitter.emit("telemetry", { origin, entity, data });
      return c.json({ status: "ok" });
    });
  });

  ingestionRouter.post(NAVIGATION_EVENTS_ROUTE, async (c) => {
    const data = await c.req.json();

    eventEmitter.emit("navigation-event", data);

    return c.json({ status: "ok" });
  });

  return ingestionRouter;
}
