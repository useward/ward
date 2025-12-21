import type { PageSession, Resource, ResourceType } from "@nextdoctor/domain";
import type { SessionStore } from "../state/session-store";

export interface FindSlowRequestsArgs {
  threshold_ms?: number;
  type?: "fetch" | "database" | "api" | "all";
  limit?: number;
  project_id?: string;
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

const typeMatches = (
  resourceType: ResourceType,
  filterType: string,
): boolean => {
  if (filterType === "all") return true;
  if (filterType === "fetch")
    return resourceType === "fetch" || resourceType === "external";
  if (filterType === "database") return resourceType === "database";
  if (filterType === "api") return resourceType === "api";
  return false;
};

export const findSlowRequests = (
  store: SessionStore,
  args: FindSlowRequestsArgs,
): string => {
  const thresholdMs = args.threshold_ms ?? 200;
  const filterType = args.type ?? "all";
  const limit = args.limit ?? 20;

  let slowResources = store.getSlowResources(thresholdMs);

  if (args.project_id) {
    slowResources = slowResources.filter(
      ({ session }) => session.projectId === args.project_id,
    );
  }

  if (filterType !== "all") {
    slowResources = slowResources.filter(({ resource }) =>
      typeMatches(resource.type, filterType),
    );
  }

  slowResources = slowResources.slice(0, limit);

  if (slowResources.length === 0) {
    const typeLabel =
      filterType === "all" ? "requests" : `${filterType} requests`;
    return `No ${typeLabel} slower than ${thresholdMs}ms found. Your app is performing well!`;
  }

  const lines: string[] = [];
  const typeLabel =
    filterType === "all"
      ? "Requests"
      : `${filterType.charAt(0).toUpperCase() + filterType.slice(1)} Requests`;
  lines.push(`Slow ${typeLabel} (>${thresholdMs}ms):`);
  lines.push("");

  type SlowResource = { session: PageSession; resource: Resource };
  const grouped = new Map<
    string,
    { count: number; totalDuration: number; resources: SlowResource[] }
  >();

  for (const item of slowResources) {
    const key = item.resource.name;
    const existing = grouped.get(key) ?? {
      count: 0,
      totalDuration: 0,
      resources: [] as SlowResource[],
    };
    existing.count++;
    existing.totalDuration += item.resource.duration;
    existing.resources.push(item);
    grouped.set(key, existing);
  }

  const sortedGroups = [...grouped.entries()].sort(
    (a, b) => b[1].totalDuration - a[1].totalDuration,
  );

  let index = 0;
  for (const [name, data] of sortedGroups.slice(0, limit)) {
    const avgDuration = data.totalDuration / data.count;
    const mostRecent = data.resources[0];
    if (!mostRecent) continue;

    lines.push(
      `${index + 1}. ${name.substring(0, 70)}${name.length > 70 ? "..." : ""}`,
    );
    lines.push(
      `   Duration: ${formatDuration(mostRecent.resource.duration)}${data.count > 1 ? ` (avg: ${formatDuration(avgDuration)}, ${data.count} occurrences)` : ""}`,
    );
    lines.push(
      `   Session: ${mostRecent.session.id} (${mostRecent.session.route})`,
    );

    if (mostRecent.resource.initiator) {
      lines.push(`   Initiator: ${mostRecent.resource.initiator}`);
    }

    const details: string[] = [];
    if (mostRecent.resource.statusCode) {
      details.push(`Status: ${mostRecent.resource.statusCode}`);
    }
    if (mostRecent.resource.size) {
      details.push(`Size: ${formatSize(mostRecent.resource.size)}`);
    }
    details.push(`Cached: ${mostRecent.resource.cached ? "yes" : "no"}`);

    if (details.length > 0) {
      lines.push(`   ${details.join(", ")}`);
    }

    lines.push("");
    index++;
  }

  const totalSlowTime = slowResources.reduce(
    (sum, r) => sum + r.resource.duration,
    0,
  );
  lines.push(`Total slow request time: ${formatDuration(totalSlowTime)}`);
  lines.push(`Unique slow resources: ${grouped.size}`);

  return lines.join("\n");
};
