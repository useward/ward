import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { type McpConfig, resolveProjectId } from "./config";
import { SessionStore } from "./state/session-store";
import {
  diagnosePerformance,
  findSlowRequests,
  getErrors,
  getSessionDetails,
  getSessions,
  listProjects,
} from "./tools";

export const createServer = async (config: McpConfig) => {
  const store = new SessionStore(config);

  const autoProjectId = resolveProjectId();

  const server = new McpServer({
    name: "Ward",
    version: "0.1.0",
    description:
      "Next.js observability. Use when debugging performance issues, investigating errors, or when you need runtime telemetry to understand what's happening in the app.",
  });

  server.registerTool(
    "list_projects",
    {
      description:
        "List all projects that have sent telemetry data. Use this to see which applications are being monitored.",
      inputSchema: {},
    },
    async () => {
      const result = listProjects(store, autoProjectId);
      return { content: [{ type: "text", text: result }] };
    },
  );

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
        project_id: z
          .string()
          .optional()
          .describe(
            "Filter by project ID. If not specified, auto-detects from cwd or shows all projects.",
          ),
      },
    },
    async (args) => {
      const effectiveProjectId = args.project_id ?? autoProjectId;
      const result = getSessions(store, {
        ...args,
        project_id: effectiveProjectId,
      });
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
        project_id: z.string().optional().describe("Filter by project ID"),
      },
    },
    async (args) => {
      const effectiveProjectId = args.project_id ?? autoProjectId;
      const result = diagnosePerformance(store, {
        ...args,
        project_id: effectiveProjectId,
      });
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
        project_id: z.string().optional().describe("Filter by project ID"),
      },
    },
    async (args) => {
      const effectiveProjectId = args.project_id ?? autoProjectId;
      const result = getErrors(store, {
        ...args,
        project_id: effectiveProjectId,
      });
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
        project_id: z.string().optional().describe("Filter by project ID"),
      },
    },
    async (args) => {
      const effectiveProjectId = args.project_id ?? autoProjectId;
      const result = findSlowRequests(store, {
        ...args,
        project_id: effectiveProjectId,
      });
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
