#!/usr/bin/env node
import { loadConfig } from "./config";
import { createServer } from "./server";

const main = async () => {
  const config = loadConfig();
  const { run } = await createServer(config);
  await run();
};

main().catch((error) => {
  console.error("[NextDoctor MCP] Fatal error:", error);
  process.exit(1);
});
