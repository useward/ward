import { Array as A, Option as O, pipe } from "effect";
import { detectNPlusOne, getEntityType } from "../algorithms/n-plus-one";
import type { IssueDetector, IssueMatch, IssueSuggestion } from "../types";

/**
 * Detects N+1 query patterns.
 * Finds cases where the same URL pattern is fetched many times.
 */
export const nPlusOneDetector: IssueDetector = {
  definition: {
    id: "rsc:n-plus-1",
    title: "N+1 query pattern",
    category: "data-fetching",
    defaultSeverity: "critical",
  },

  detect(session): IssueMatch | null {
    const patterns = detectNPlusOne(session.resources, {
      minCount: 3,
    });

    if (patterns.length === 0) return null;

    const worst = pipe(patterns, A.head, O.getOrNull);

    if (!worst) return null;

    return {
      issueId: this.definition.id,
      severity: worst.count > 10 ? "critical" : "warning",
      resources: worst.resources,
      impact: {
        timeMs: worst.totalDuration,
        percentOfTotal:
          (worst.totalDuration / session.stats.totalDuration) * 100,
      },
      context: {
        pattern: worst.pattern,
        count: worst.count,
        avgDuration: worst.avgDuration,
        initiator: worst.initiator,
        entityType: getEntityType(worst.pattern),
        allPatterns: patterns,
      },
    };
  },

  suggest(match): IssueSuggestion {
    const pattern = match.context.pattern as string;
    const count = match.context.count as number;
    const avgDuration = Math.round(match.context.avgDuration as number);
    const initiator = match.context.initiator as string | undefined;
    const totalMs = Math.round(match.impact.timeMs);

    const location = initiator ? ` from ${initiator}` : "";

    return {
      summary: `${count} requests to ${pattern}`,
      explanation:
        `You're making ${count} individual requests${location} that could be batched.\n\n` +
        `Each request takes ~${avgDuration}ms, totaling ${totalMs}ms. ` +
        `This is often caused by fetching data in a loop or in a component that renders ` +
        `for each item in a list.\n\n` +
        `Batching these into a single request would be much faster.`,
      codeExample: {
        before: `// N+1 pattern - fetching one at a time
const posts = await getPosts();
const authors = await Promise.all(
  posts.map(post => getUser(post.authorId)) // ${count} requests!
);

// Or in a component:
function PostList({ posts }) {
  return posts.map(post => (
    <PostWithAuthor key={post.id} post={post} />
  ));
}

async function PostWithAuthor({ post }) {
  const author = await getUser(post.authorId); // Called N times
  return <Post post={post} author={author} />;
}`,
        after: `// Batch fetch - single request
const posts = await getPosts();
const authorIds = [...new Set(posts.map(p => p.authorId))];
const authors = await getUsersByIds(authorIds); // 1 request

const authorMap = new Map(authors.map(a => [a.id, a]));
const postsWithAuthors = posts.map(post => ({
  ...post,
  author: authorMap.get(post.authorId),
}));

// Or use a DataLoader pattern:
import DataLoader from 'dataloader';

const userLoader = new DataLoader(async (ids) => {
  const users = await getUsersByIds(ids);
  return ids.map(id => users.find(u => u.id === id));
});

// Now each getUser call is batched automatically
const author = await userLoader.load(post.authorId);`,
        language: "typescript",
      },
      estimatedImprovement: `~${totalMs - avgDuration}ms faster (${count} requests → 1)`,
    };
  },
};
