import type { Resource } from "@ward/domain";
import type { SessionStore } from "../state/session-store";

export interface GetSessionDetailsArgs {
  session_id: string;
  include_attributes?: boolean;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

const formatSize = (bytes: number | undefined): string => {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

const formatResource = (
  resource: Resource,
  baseTime: number,
  depth: number,
  includeAttrs: boolean,
): string[] => {
  const indent = "  ".repeat(depth);
  const relativeStart = Math.round(resource.startTime - baseTime);
  const relativeEnd = Math.round(resource.endTime - baseTime);
  const duration = formatDuration(resource.duration);

  const statusIndicator = resource.status === "error" ? "[ERROR] " : "";
  const cachedIndicator = resource.cached ? " [CACHED]" : "";

  const lines: string[] = [];

  const name =
    resource.name.length > 60
      ? `${resource.name.substring(0, 57)}...`
      : resource.name;
  lines.push(
    `${indent}[${relativeStart}ms-${relativeEnd}ms] (${duration}) ${statusIndicator}${resource.type}: ${name}${cachedIndicator}`,
  );

  const details: string[] = [];
  if (resource.initiator) {
    details.push(`at ${resource.initiator}`);
  }
  if (resource.statusCode) {
    details.push(`status: ${resource.statusCode}`);
  }
  if (resource.size) {
    details.push(`size: ${formatSize(resource.size)}`);
  }

  if (details.length > 0) {
    lines.push(`${indent}  ${details.join(", ")}`);
  }

  if (includeAttrs && Object.keys(resource.attributes).length > 0) {
    const attrLines = Object.entries(resource.attributes)
      .filter(([key]) => !key.startsWith("ward."))
      .slice(0, 10)
      .map(([key, value]) => `${indent}    ${key}: ${value}`);
    lines.push(...attrLines);
  }

  return lines;
};

const formatResourceTree = (
  resources: ReadonlyArray<Resource>,
  baseTime: number,
  depth: number,
  includeAttrs: boolean,
): string[] => {
  const lines: string[] = [];
  for (const resource of resources) {
    lines.push(...formatResource(resource, baseTime, depth, includeAttrs));
    if (resource.children.length > 0) {
      lines.push(
        ...formatResourceTree(
          resource.children,
          baseTime,
          depth + 1,
          includeAttrs,
        ),
      );
    }
  }
  return lines;
};

export const getSessionDetails = (
  store: SessionStore,
  args: GetSessionDetailsArgs,
): string => {
  const session = store.getSession(args.session_id);

  if (!session) {
    const sessions = store.getSessions().slice(0, 5);
    const available =
      sessions.length > 0
        ? `Available sessions (most recent):\n${sessions.map((s) => `- ${s.id} (${s.route})`).join("\n")}`
        : "No sessions available.";

    return `Session '${args.session_id}' not found.

${available}

Use get_sessions tool to see all available sessions.`;
  }

  const lines: string[] = [];

  lines.push(`Session: ${session.id}`);
  lines.push(`URL: ${session.url}`);
  lines.push(`Route: ${session.route}`);
  lines.push(
    `Type: ${session.navigationType === "initial" ? "Initial Load" : "SPA Navigation"}`,
  );
  lines.push(`Duration: ${formatDuration(session.stats.totalDuration)}`);
  lines.push("");

  lines.push("Timing:");
  const timing = session.timing;
  if (timing.serverStart !== undefined && timing.serverEnd !== undefined) {
    lines.push(
      `  Server: ${formatDuration(timing.serverEnd - timing.serverStart)}`,
    );
  }
  if (timing.fcp !== undefined) {
    lines.push(`  FCP: ${formatDuration(timing.fcp - timing.navigationStart)}`);
  }
  if (timing.lcp !== undefined) {
    lines.push(`  LCP: ${formatDuration(timing.lcp - timing.navigationStart)}`);
  }
  if (timing.spaLcp !== undefined) {
    lines.push(`  SPA LCP: ${formatDuration(timing.spaLcp)}`);
  }
  lines.push("");

  lines.push("Stats:");
  lines.push(`  Total Resources: ${session.stats.totalResources}`);
  lines.push(`  Server Resources: ${session.stats.serverResources}`);
  lines.push(`  Client Resources: ${session.stats.clientResources}`);
  if (session.stats.errorCount > 0) {
    lines.push(`  Errors: ${session.stats.errorCount}`);
  }
  if (session.stats.cachedCount > 0) {
    lines.push(`  Cached: ${session.stats.cachedCount}`);
  }
  lines.push("");

  if (session.rootResources.length > 0) {
    lines.push("Resources (waterfall):");
    lines.push("");

    const serverResources = session.rootResources.filter(
      (r) => r.origin === "server",
    );
    const clientResources = session.rootResources.filter(
      (r) => r.origin === "client",
    );

    if (serverResources.length > 0) {
      lines.push("Server:");
      lines.push(
        ...formatResourceTree(
          serverResources,
          session.timing.navigationStart,
          1,
          args.include_attributes ?? false,
        ),
      );
      lines.push("");
    }

    if (clientResources.length > 0) {
      lines.push("Client:");
      lines.push(
        ...formatResourceTree(
          clientResources,
          session.timing.navigationStart,
          1,
          args.include_attributes ?? false,
        ),
      );
    }
  }

  return lines.join("\n");
};
