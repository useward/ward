#!/usr/bin/env node
import { createServer } from "./server"
import { loadConfig } from "./config"

const main = async () => {
  const config = loadConfig()
  const { run } = await createServer(config)
  await run()
}

main().catch((error) => {
  console.error("[NextDoctor MCP] Fatal error:", error)
  process.exit(1)
})
