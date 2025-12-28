import type { PageSession } from "@useward/domain";
import type { SessionStore } from "../state/session-store";

export interface GetSessionsArgs {
  limit?: number;
  route?: string;
  project_id?: string;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

const formatNavigationType = (type: string): string => {
  switch (type) {
    case "initial":
      return "Initial Load";
    case "navigation":
      return "SPA Navigation";
    case "back-forward":
      return "Back/Forward";
    default:
      return type;
  }
};

const formatSession = (
  session: PageSession,
  index: number,
  showProject: boolean,
): string => {
  const lines: string[] = [];

  const navType = formatNavigationType(session.navigationType);
  const projectPrefix = showProject ? `[${session.projectId}] ` : "";
  lines.push(
    `${index + 1}. ${projectPrefix}[${session.id}] ${session.route} (${navType})`,
  );

  const duration = formatDuration(session.stats.totalDuration);
  const resources = session.stats.totalResources;
  const errors = session.stats.errorCount;
  const cached = session.stats.cachedCount;

  let metrics = `   Duration: ${duration} | Resources: ${resources}`;
  if (errors > 0) metrics += ` | Errors: ${errors}`;
  if (cached > 0) metrics += ` | Cached: ${cached}`;

  const lcp = session.timing.lcp ?? session.timing.spaLcp;
  if (lcp) {
    const lcpLabel = session.timing.spaLcp ? "SPA LCP" : "LCP";
    metrics += ` | ${lcpLabel}: ${formatDuration(lcp - session.timing.navigationStart)}`;
  }

  lines.push(metrics);

  if (session.stats.slowestResource) {
    const slowest = session.stats.slowestResource;
    lines.push(
      `   Slowest: ${slowest.name} (${formatDuration(slowest.duration)})`,
    );
  }

  return lines.join("\n");
};

export const getSessions = (
  store: SessionStore,
  args: GetSessionsArgs,
): string => {
  const limit = args.limit ?? 10;
  let sessions = args.project_id
    ? store.getSessionsByProject(args.project_id)
    : store.getSessions();

  if (args.route) {
    const route = args.route;
    sessions = sessions.filter(
      (s) => s.route === route || s.route.startsWith(route),
    );
  }

  sessions = sessions.slice(0, limit);

  if (sessions.length === 0) {
    if (!store.isConnected) {
      return `Not connected to Ward DevTools.

To start recording:
1. Ensure Ward DevTools server is running (npx @ward/devtools)
2. Navigate to pages in your Next.js app to generate telemetry
3. Sessions will appear here automatically`;
    }

    const projectFilter = args.project_id
      ? ` for project "${args.project_id}"`
      : "";
    return `No sessions recorded${projectFilter} yet.

To start recording:
1. Navigate to pages in your Next.js app
2. Sessions will appear here automatically`;
  }

  const showProject = !args.project_id;
  let header: string;
  if (args.route && args.project_id) {
    header = `Sessions for route "${args.route}" in project "${args.project_id}" (${sessions.length}):`;
  } else if (args.route) {
    header = `Sessions for route "${args.route}" (${sessions.length}):`;
  } else if (args.project_id) {
    header = `Sessions for project "${args.project_id}" (${sessions.length}):`;
  } else {
    header = `Recent Sessions (${sessions.length}):`;
  }

  const formatted = sessions
    .map((s, i) => formatSession(s, i, showProject))
    .join("\n\n");

  return `${header}\n\n${formatted}`;
};
