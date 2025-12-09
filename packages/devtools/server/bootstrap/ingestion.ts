import { EventEmitter } from "node:events";
import type { Hono } from "hono";
import { createIngestionRouter, createTelemetryStreamRouter } from "../routes";

export function setupIngestion(app: Hono) {
  const eventEmitter = new EventEmitter();

  app.route("/", createIngestionRouter(eventEmitter));
  app.route("/", createTelemetryStreamRouter(eventEmitter));
}
