import type { SessionStore } from "../state/session-store";

export const listProjects = (
  store: SessionStore,
  autoDetectedProjectId: string | undefined,
): string => {
  const projects = store.getProjects();

  if (projects.length === 0) {
    if (!store.isConnected) {
      return `Not connected to NextDoctor DevTools.

To start recording:
1. Ensure NextDoctor DevTools server is running (npx @nextdoctor/devtools)
2. Navigate to pages in your Next.js app to generate telemetry
3. Projects will appear here automatically`;
    }

    return `No projects have sent telemetry yet.

To start recording:
1. Ensure your Next.js app is instrumented with @nextdoctor/nextjs-integration
2. Navigate to pages in your app to generate telemetry
3. Projects will appear here automatically`;
  }

  const lines: string[] = [`Known Projects (${projects.length}):`];

  for (const projectId of projects) {
    const sessions = store.getSessionsByProject(projectId);
    const isCurrentProject =
      autoDetectedProjectId && projectId === autoDetectedProjectId;
    const marker = isCurrentProject ? " (current)" : "";
    lines.push(`  - ${projectId}${marker}: ${sessions.length} sessions`);
  }

  if (autoDetectedProjectId) {
    lines.push("");
    lines.push(`Auto-detected project from cwd: "${autoDetectedProjectId}"`);
    lines.push("Tools will filter to this project by default.");
  } else {
    lines.push("");
    lines.push("No project auto-detected from cwd.");
    lines.push("Tools will show data from all projects by default.");
  }

  return lines.join("\n");
};
