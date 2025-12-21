import { Array as A, Option as O, pipe } from "effect";
import type { Resource } from "../../types";
import { detectSequentialByInitiator } from "../algorithms/waterfall";
import type { IssueDetector, IssueMatch, IssueSuggestion } from "../types";

/**
 * Detects sequential awaits in the same component/file.
 * Common pattern: multiple await statements that could use Promise.all.
 */
export const rscWaterfallSequentialDetector: IssueDetector = {
  definition: {
    id: "rsc:waterfall-sequential-awaits",
    title: "Sequential awaits in Server Component",
    category: "waterfall",
    defaultSeverity: "warning",
  },

  detect(session): IssueMatch | null {
    const serverResources = pipe(
      session.resources,
      A.filter((r) => r.origin === "server"),
    );

    const waterfalls = detectSequentialByInitiator(serverResources);

    if (waterfalls.length === 0) return null;

    const worst = pipe(waterfalls, A.head, O.getOrNull);

    if (!worst || worst.wastedTime < 30) return null;

    const initiator = worst.resources[0]?.initiator;

    return {
      issueId: this.definition.id,
      severity: worst.wastedTime > 150 ? "critical" : "warning",
      resources: worst.resources,
      impact: {
        timeMs: worst.wastedTime,
        percentOfTotal: (worst.wastedTime / session.stats.totalDuration) * 100,
      },
      context: {
        initiator,
        chainLength: worst.resources.length,
        allWaterfalls: waterfalls,
      },
    };
  },

  suggest(match): IssueSuggestion {
    const initiator = match.context.initiator as string | undefined;
    const chainLength = match.context.chainLength as number;
    const timeMs = Math.round(match.impact.timeMs);

    const location = initiator ? ` in ${initiator}` : "";
    const fetchNames = pipe(
      match.resources,
      A.map((r) => formatFetchName(r)),
      A.take(4),
    );

    const fetchList = fetchNames.join(", ");
    const andMore =
      match.resources.length > 4
        ? ` and ${match.resources.length - 4} more`
        : "";

    return {
      summary: `${chainLength} sequential fetches${location}`,
      explanation:
        `These fetches run one after another: ${fetchList}${andMore}.\n\n` +
        `They don't depend on each other's results, so they could run in parallel. ` +
        `This would save ~${timeMs}ms.`,
      codeExample: {
        before: `// Sequential - each await blocks the next
const user = await getUser();
const posts = await getPosts();
const comments = await getComments();
const notifications = await getNotifications();`,
        after: `// Parallel - all run at once
const [user, posts, comments, notifications] = await Promise.all([
  getUser(),
  getPosts(),
  getComments(),
  getNotifications(),
]);

// Or if some depend on others, batch the independent ones:
const user = await getUser();
const [posts, notifications] = await Promise.all([
  getPostsForUser(user.id),
  getNotifications(user.id),
]);`,
        language: "typescript",
      },
      estimatedImprovement: `~${timeMs}ms faster`,
    };
  },
};

/**
 * Format a fetch resource name for display.
 */
const formatFetchName = (resource: Resource): string => {
  const name = resource.name;

  if (name.startsWith("GET ")) return name.slice(4, 30);
  if (name.startsWith("POST ")) return name.slice(5, 30);
  if (name.startsWith("fetch ")) return name.slice(6, 30);

  if (name.includes("/")) {
    const parts = name.split("/");
    const last = parts[parts.length - 1];
    if (last && last.length > 0 && last.length < 30) return last;
  }

  return name.slice(0, 25);
};
