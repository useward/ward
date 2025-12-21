import { Array as A, pipe } from "effect";
import type { Resource } from "../../types";
import type { IssueDetector, IssueMatch, IssueSuggestion } from "../types";

const DOCS_URL =
  "https://nextjs.org/docs/app/building-your-application/caching#fetch";

/**
 * Internal URLs that shouldn't trigger cache warnings.
 */
const INTERNAL_PATTERNS = [
  "localhost",
  "127.0.0.1",
  "_next",
  "__next",
  "webpack",
  "turbopack",
  "favicon",
  ".ico",
  ".png",
  ".jpg",
  ".svg",
  ".woff",
  ".css",
  ".js",
];

/**
 * Check if a resource is an internal/noise request.
 */
const isInternalRequest = (resource: Resource): boolean => {
  const url = (resource.url || resource.name).toLowerCase();
  return INTERNAL_PATTERNS.some((pattern) => url.includes(pattern));
};

/**
 * Check if a resource looks like it could be cached (GET request, no auth).
 */
const looksIdempotent = (resource: Resource): boolean => {
  const method =
    resource.attributes["http.request.method"] ||
    resource.attributes["http.method"];

  // Only GET requests are typically cacheable
  if (method && method !== "GET") return false;

  // Skip if name suggests mutation
  const name = resource.name.toLowerCase();
  if (
    name.includes("post ") ||
    name.includes("put ") ||
    name.includes("delete ") ||
    name.includes("patch ")
  ) {
    return false;
  }

  return true;
};

/**
 * Detects uncached fetch requests in Server Components.
 */
export const cacheFetchNoConfigDetector: IssueDetector = {
  definition: {
    id: "cache:fetch-no-config",
    title: "Uncached fetch in Server Component",
    category: "caching",
    defaultSeverity: "warning",
    docsUrl: DOCS_URL,
  },

  detect(session): IssueMatch | null {
    const uncached = pipe(
      session.resources,
      A.filter(
        (r) =>
          r.origin === "server" &&
          (r.type === "fetch" || r.type === "api" || r.type === "external") &&
          !r.cached &&
          r.duration > 30 &&
          !isInternalRequest(r) &&
          looksIdempotent(r),
      ),
    );

    if (uncached.length === 0) return null;

    const totalTime = pipe(
      uncached,
      A.map((r) => r.duration),
      A.reduce(0, (a, b) => a + b),
    );

    const severity =
      totalTime > 500 ? "critical" : uncached.length > 5 ? "warning" : "info";

    return {
      issueId: this.definition.id,
      severity,
      resources: uncached,
      impact: {
        timeMs: totalTime,
        percentOfTotal: (totalTime / session.stats.totalDuration) * 100,
      },
      context: {
        count: uncached.length,
        avgDuration: totalTime / uncached.length,
      },
    };
  },

  suggest(match): IssueSuggestion {
    const count = match.context.count as number;
    const totalMs = Math.round(match.impact.timeMs);

    const examples = pipe(
      match.resources,
      A.take(3),
      A.map((r) => formatUrl(r)),
    );

    const exampleList = examples.join(", ");
    const andMore = count > 3 ? ` and ${count - 3} more` : "";

    return {
      summary: `${count} fetch request(s) not cached`,
      explanation:
        `These requests are not cached: ${exampleList}${andMore}.\n\n` +
        `In Next.js App Router, \`fetch()\` defaults to no caching. For data that ` +
        `doesn't change on every request, adding cache configuration can significantly ` +
        `improve performance.\n\n` +
        `On repeat visits, cached requests return instantly instead of waiting ${totalMs}ms.`,
      codeExample: {
        before: `// No cache - fetches every time
const data = await fetch('https://api.example.com/data');`,
        after: `// Option 1: Time-based revalidation
const data = await fetch('https://api.example.com/data', {
  next: { revalidate: 3600 } // Cache for 1 hour
});

// Option 2: Tag-based invalidation
const data = await fetch('https://api.example.com/data', {
  next: { tags: ['data'] }
});
// Invalidate with: revalidateTag('data')

// Option 3: Force cache (never revalidate automatically)
const data = await fetch('https://api.example.com/data', {
  cache: 'force-cache'
});

// For non-fetch async functions, use unstable_cache:
import { unstable_cache } from 'next/cache';

const getCachedData = unstable_cache(
  async () => {
    const result = await db.query(...);
    return result;
  },
  ['cache-key'],
  { revalidate: 3600, tags: ['data'] }
);`,
        language: "typescript",
      },
      docsUrl: DOCS_URL,
      estimatedImprovement: `~${totalMs}ms faster on cache hits`,
    };
  },
};

/**
 * Format a URL for display.
 */
const formatUrl = (resource: Resource): string => {
  const url = resource.url || resource.name;

  try {
    const parsed = new URL(url, "http://localhost");
    const path = parsed.pathname;

    if (parsed.host && !parsed.host.includes("localhost")) {
      return `${parsed.host}${path.slice(0, 20)}`;
    }

    return path.slice(0, 30);
  } catch {
    return url.slice(0, 30);
  }
};
