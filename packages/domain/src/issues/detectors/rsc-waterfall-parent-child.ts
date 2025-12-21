import type { Resource } from "../../types";
import { detectParentChildWaterfall } from "../algorithms/waterfall";
import type { IssueDetector, IssueMatch, IssueSuggestion } from "../types";

const DOCS_URL =
  "https://nextjs.org/docs/app/building-your-application/data-fetching/fetching#parallel-and-sequential-data-fetching";

/**
 * Detects when a layout's data fetching blocks page-level fetches.
 * This is a common performance issue in Next.js App Router.
 */
export const rscWaterfallParentChildDetector: IssueDetector = {
  definition: {
    id: "rsc:waterfall-parent-child",
    title: "Layout fetch blocks page render",
    category: "waterfall",
    defaultSeverity: "critical",
    docsUrl: DOCS_URL,
  },

  detect(session): IssueMatch | null {
    const waterfall = detectParentChildWaterfall(session.rootResources);

    if (!waterfall || waterfall.wastedTime < 50) {
      return null;
    }

    const parent = waterfall.resources[0];
    const child = waterfall.resources[1];

    if (!parent || !child) return null;

    if (parent.origin !== "server" || child.origin !== "server") {
      return null;
    }

    return {
      issueId: this.definition.id,
      severity: waterfall.wastedTime > 200 ? "critical" : "warning",
      resources: waterfall.resources,
      impact: {
        timeMs: waterfall.wastedTime,
        percentOfTotal:
          (waterfall.wastedTime / session.stats.totalDuration) * 100,
      },
      context: {
        parentResource: parent,
        childResource: child,
        depth: waterfall.depth,
      },
    };
  },

  suggest(match): IssueSuggestion {
    const parent = match.context.parentResource as Resource;
    const child = match.context.childResource as Resource;
    const timeMs = Math.round(match.impact.timeMs);

    const parentName = formatResourceName(parent);
    const childName = formatResourceName(child);

    return {
      summary: `Data fetch in layout blocks ${childName}`,
      explanation:
        `The fetch "${parentName}" in your layout completes before page-level ` +
        `fetches can start. This creates a waterfall that adds ~${timeMs}ms ` +
        `to every page using this layout.\n\n` +
        `In Next.js App Router, layouts wrap pages. If a layout awaits data, ` +
        `the page component won't start rendering until that await completes.`,
      codeExample: {
        before: `// layout.tsx
export default async function Layout({ children }) {
  const user = await getUser(); // Blocks everything below
  return (
    <div>
      <Nav user={user} />
      {children}
    </div>
  );
}

// page.tsx
export default async function Page() {
  const posts = await getPosts(); // Waits for layout first
  return <Posts posts={posts} />;
}`,
        after: `// Option 1: Move data fetching to page level
// layout.tsx
export default function Layout({ children }) {
  return (
    <div>
      <Suspense fallback={<NavSkeleton />}>
        <Nav />
      </Suspense>
      {children}
    </div>
  );
}

// page.tsx
export default async function Page() {
  // Fetch in parallel at the page level
  const [user, posts] = await Promise.all([
    getUser(),
    getPosts(),
  ]);
  return (
    <>
      <Nav user={user} />
      <Posts posts={posts} />
    </>
  );
}

// Option 2: Use Suspense in layout
// layout.tsx
export default function Layout({ children }) {
  return (
    <div>
      <Suspense fallback={<NavSkeleton />}>
        <NavWithData />
      </Suspense>
      {children}
    </div>
  );
}

// NavWithData.tsx (separate component)
async function NavWithData() {
  const user = await getUser();
  return <Nav user={user} />;
}`,
        language: "typescript",
      },
      docsUrl: DOCS_URL,
      estimatedImprovement: `~${timeMs}ms faster page loads`,
    };
  },
};

/**
 * Format a resource name for display.
 */
const formatResourceName = (resource: Resource): string => {
  if (resource.name.length <= 40) return resource.name;

  try {
    const url = new URL(resource.url || resource.name, "http://localhost");
    return url.pathname.slice(0, 40);
  } catch {
    return `${resource.name.slice(0, 40)}...`;
  }
};
