import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { McpConfig } from "./config";
import { SessionStore } from "./state/session-store";
import {
  diagnosePerformance,
  findSlowRequests,
  getErrors,
  getSessionDetails,
  getSessions,
} from "./tools";

export const createServer = async (config: McpConfig) => {
  const store = new SessionStore(config);

  const server = new McpServer({
    name: "nextdoctor",
    version: "0.0.1",
  });

  server.registerTool(
    "get_sessions",
    {
      description:
        "List recent Next.js page sessions with performance metrics. Use this to see what pages have been visited and their performance.",
      inputSchema: {
        limit: z
          .number()
          .optional()
          .describe("Maximum number of sessions to return (default: 10)"),
        route: z
          .string()
          .optional()
          .describe("Filter sessions by route path (e.g., '/dashboard')"),
      },
    },
    async (args) => {
      const result = getSessions(store, args);
      return { content: [{ type: "text", text: result }] };
    },
  );

  server.registerTool(
    "get_session_details",
    {
      description:
        "Get detailed resource waterfall for a specific session. Shows all requests, their timing, and source file locations.",
      inputSchema: {
        session_id: z.string().describe("Session ID (e.g., 'nav_abc123')"),
        include_attributes: z
          .boolean()
          .optional()
          .describe("Include span attributes in output (default: false)"),
      },
    },
    async (args) => {
      const result = getSessionDetails(store, args);
      return { content: [{ type: "text", text: result }] };
    },
  );

  server.registerTool(
    "diagnose_performance",
    {
      description:
        "Diagnose performance issues in a session or route. Finds bottlenecks, slow queries, uncached requests, and suggests fixes.",
      inputSchema: {
        session_id: z
          .string()
          .optional()
          .describe("Specific session to analyze"),
        route: z
          .string()
          .optional()
          .describe(
            "Route path to analyze (uses most recent session for that route)",
          ),
        threshold_ms: z
          .number()
          .optional()
          .describe(
            "Consider resources slower than this threshold (default: 100ms)",
          ),
      },
    },
    async (args) => {
      const result = diagnosePerformance(store, args);
      return { content: [{ type: "text", text: result }] };
    },
  );

  server.registerTool(
    "get_errors",
    {
      description:
        "Get all errors from recent sessions with context. Shows failed requests, error status codes, and source locations.",
      inputSchema: {
        session_id: z
          .string()
          .optional()
          .describe("Filter by specific session"),
        limit: z
          .number()
          .optional()
          .describe("Maximum errors to return (default: 20)"),
      },
    },
    async (args) => {
      const result = getErrors(store, args);
      return { content: [{ type: "text", text: result }] };
    },
  );

  server.registerTool(
    "find_slow_requests",
    {
      description:
        "Find HTTP requests or database queries slower than a threshold. Helps identify performance bottlenecks.",
      inputSchema: {
        threshold_ms: z
          .number()
          .optional()
          .describe("Minimum duration in milliseconds (default: 200)"),
        type: z
          .enum(["fetch", "database", "api", "all"])
          .optional()
          .describe("Filter by resource type (default: all)"),
        limit: z.number().optional().describe("Maximum results (default: 20)"),
      },
    },
    async (args) => {
      const result = findSlowRequests(store, args);
      return { content: [{ type: "text", text: result }] };
    },
  );

  const run = async () => {
    store.connect();

    const transport = new StdioServerTransport();
    await server.connect(transport);

    process.on("SIGINT", () => {
      store.disconnect();
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      store.disconnect();
      process.exit(0);
    });
  };

  return { run, store, server };
};
