import { Hono } from "hono";
import { bootstrap } from "./bootstrap";

export async function runServer() {
  const app = new Hono();

  bootstrap(app);
}
