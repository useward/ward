import {
  ALL_DETECTORS,
  type DetectedIssue,
  findCriticalPath,
  type PageSession,
  type Resource,
  runDetectors,
} from "@useward/domain";
import type { SessionStore } from "../state/session-store";

export interface DiagnosePerformanceArgs {
  session_id?: string;
  route?: string;
  threshold_ms?: number;
  project_id?: string;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

const formatIssue = (issue: DetectedIssue, index: number): string => {
  const lines: string[] = [];
  const { definition, match, suggestion } = issue;

  const severityLabel =
    match.severity === "critical"
      ? "[CRITICAL]"
      : match.severity === "warning"
        ? "[WARNING]"
        : match.severity === "info"
          ? "[INFO]"
          : "[OPT]";

  lines.push(`${index + 1}. ${severityLabel} ${definition.title}`);
  lines.push(
    `   Impact: ${formatDuration(match.impact.timeMs)} (${match.impact.percentOfTotal.toFixed(1)}% of total)`,
  );

  if (match.resources.length > 0 && match.resources.length <= 3) {
    for (const resource of match.resources) {
      lines.push(`   Resource: ${resource.name.slice(0, 60)}`);
      if (resource.initiator) {
        lines.push(`   File: ${resource.initiator}`);
      }
    }
  } else if (match.resources.length > 3) {
    lines.push(`   Resources: ${match.resources.length} affected`);
  }

  lines.push("");
  lines.push(`   ${suggestion.summary}`);

  if (suggestion.codeExample) {
    lines.push("");
    lines.push("   Fix:");
    const afterLines = suggestion.codeExample.after.split("\n").slice(0, 6);
    for (const line of afterLines) {
      lines.push(`   ${line}`);
    }
    if (suggestion.codeExample.after.split("\n").length > 6) {
      lines.push("   ...");
    }
  }

  if (suggestion.docsUrl) {
    lines.push("");
    lines.push(`   Docs: ${suggestion.docsUrl}`);
  }

  return lines.join("\n");
};

const getSession = (
  store: SessionStore,
  args: DiagnosePerformanceArgs,
): PageSession | undefined => {
  if (args.session_id) {
    return store.getSession(args.session_id);
  }

  if (args.route) {
    let sessions = store.getSessionsByRoute(args.route);
    if (args.project_id) {
      sessions = sessions.filter((s) => s.projectId === args.project_id);
    }
    return sessions[0];
  }

  const sessions = args.project_id
    ? store.getSessionsByProject(args.project_id)
    : store.getSessions();
  return sessions[0];
};

export const diagnosePerformance = (
  store: SessionStore,
  args: DiagnosePerformanceArgs,
): string => {
  const session = getSession(store, args);

  if (!session) {
    if (args.session_id) {
      return `Session '${args.session_id}' not found. Use get_sessions to see available sessions.`;
    }
    if (args.route) {
      return `No sessions found for route '${args.route}'.`;
    }
    return "No sessions available. Navigate to pages in your Next.js app to generate telemetry.";
  }

  const issues = runDetectors(session, ALL_DETECTORS);

  const lines: string[] = [];

  lines.push(`Performance Diagnosis: ${session.route}`);
  lines.push(`Session: ${session.id}`);
  lines.push(`Total Duration: ${formatDuration(session.stats.totalDuration)}`);
  lines.push("");

  if (issues.length === 0) {
    lines.push("No performance issues detected.");
    lines.push("");
    lines.push("The page appears to be performing well!");
  } else {
    lines.push(`Issues Found: ${issues.length}`);
    lines.push("");

    // Show top 10 issues
    for (let i = 0; i < Math.min(issues.length, 10); i++) {
      const issue = issues[i];
      if (issue) {
        lines.push(formatIssue(issue, i));
        lines.push("");
        lines.push("─".repeat(60));
        lines.push("");
      }
    }

    if (issues.length > 10) {
      lines.push(`... and ${issues.length - 10} more issues`);
      lines.push("");
    }
  }

  const criticalPathIds = findCriticalPath(session.rootResources);
  if (criticalPathIds.length > 0) {
    const criticalResources = criticalPathIds
      .map((id) => session.resources.find((r) => r.id === id))
      .filter((r): r is Resource => r !== undefined);

    const criticalDuration = criticalResources.reduce(
      (sum, r) => sum + r.duration,
      0,
    );
    const criticalPercent =
      (criticalDuration / session.stats.totalDuration) * 100;

    lines.push(
      `Critical Path: ${formatDuration(criticalDuration)} (${criticalPercent.toFixed(1)}% of session)`,
    );

    const pathDisplay = criticalResources
      .map(
        (r) =>
          `  ${r.type}: ${r.name.substring(0, 40)} (${formatDuration(r.duration)})`,
      )
      .join("\n  → ");
    lines.push(pathDisplay);
    lines.push("");
  }

  const cacheRate =
    session.stats.totalResources > 0
      ? (session.stats.cachedCount / session.stats.totalResources) * 100
      : 0;
  lines.push(
    `Cache Hit Rate: ${cacheRate.toFixed(1)}% (${session.stats.cachedCount}/${session.stats.totalResources})`,
  );

  return lines.join("\n");
};
