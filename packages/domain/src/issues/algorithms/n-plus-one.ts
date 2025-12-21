import { Array as A, Option, pipe } from "effect";
import type { Resource } from "../../types";

/**
 * A detected N+1 query pattern.
 */
export interface NPlusOnePattern {
  /** The URL pattern that was repeated (e.g., "/api/users/*") */
  readonly pattern: string;

  /** All resources matching this pattern */
  readonly resources: readonly Resource[];

  /** Number of repetitions */
  readonly count: number;

  /** Total time spent on these requests */
  readonly totalDuration: number;

  /** Average duration per request */
  readonly avgDuration: number;

  /** File that initiated these requests (if available) */
  readonly initiator?: string;
}

export interface NPlusOneOptions {
  /** Minimum number of repetitions to flag as N+1. Default: 3 */
  readonly minCount?: number;

  /** Custom function to extract pattern from URL. Default: replaces IDs with * */
  readonly patternExtractor?: (resource: Resource) => string;

  /** Only consider resources of these types. Default: all data-fetching types */
  readonly resourceTypes?: readonly string[];
}

const DEFAULT_OPTIONS: Required<Omit<NPlusOneOptions, "patternExtractor">> & {
  patternExtractor?: (resource: Resource) => string;
} = {
  minCount: 3,
  resourceTypes: ["fetch", "api", "database", "external"],
};

/**
 * Default pattern extractor: replaces numeric IDs and UUIDs with wildcards.
 */
const defaultPatternExtractor = (resource: Resource): string => {
  const url = resource.url || resource.name;

  try {
    const parsed = new URL(url, "http://localhost");
    let path = parsed.pathname;

    // Replace UUIDs
    path = path.replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "*",
    );

    // Replace numeric IDs (sequences of digits)
    path = path.replace(/\/\d+/g, "/*");

    // Replace MongoDB ObjectIds (24 hex chars)
    path = path.replace(/[0-9a-f]{24}/gi, "*");

    // Include host for external URLs
    if (
      parsed.host &&
      !parsed.host.includes("localhost") &&
      !parsed.host.includes("127.0.0.1")
    ) {
      return `${parsed.host}${path}`;
    }

    return path;
  } catch {
    // Fallback for non-URL strings
    return url
      .replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        "*",
      )
      .replace(/\/\d+/g, "/*")
      .replace(/[0-9a-f]{24}/gi, "*");
  }
};

/**
 * Detect N+1 query patterns in resources.
 * Finds cases where the same URL pattern is fetched multiple times.
 *
 * @param resources Resources to analyze
 * @param options Detection options
 * @returns Detected N+1 patterns, sorted by total duration
 */
export const detectNPlusOne = (
  resources: readonly Resource[],
  options?: NPlusOneOptions,
): readonly NPlusOnePattern[] => {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const extractPattern = opts.patternExtractor ?? defaultPatternExtractor;

  // Filter to relevant resource types
  const filtered = pipe(
    resources,
    A.filter((r) => opts.resourceTypes.includes(r.type)),
  );

  // Group by pattern
  const byPattern = pipe(filtered, A.groupBy(extractPattern));

  // Build patterns for groups with enough repetitions
  const patterns: NPlusOnePattern[] = [];

  for (const [pattern, group] of Object.entries(byPattern)) {
    if (group.length < opts.minCount) continue;

    const totalDuration = pipe(
      group,
      A.map((r) => r.duration),
      A.reduce(0, (a, b) => a + b),
    );

    // Find common initiator if any
    const initiators = pipe(
      group,
      A.filterMap((r) =>
        r.initiator !== undefined ? Option.some(r.initiator) : Option.none(),
      ),
    );

    const commonInitiator =
      initiators.length > 0 && initiators.every((i) => i === initiators[0])
        ? initiators[0]
        : undefined;

    patterns.push({
      pattern,
      resources: group,
      count: group.length,
      totalDuration,
      avgDuration: totalDuration / group.length,
      initiator: commonInitiator,
    });
  }

  // Sort by total duration (most impactful first)
  return pipe(
    patterns,
    A.sort((a: NPlusOnePattern, b: NPlusOnePattern) =>
      a.totalDuration > b.totalDuration ? -1 : 1,
    ),
  );
};

/**
 * Calculate total time that could be saved by batching N+1 patterns.
 * Assumes batching would reduce N requests to 1 request.
 */
export const calculateNPlusOneSavings = (
  patterns: readonly NPlusOnePattern[],
): number =>
  pipe(
    patterns,
    A.map((p) => {
      // If batched, would take ~1 request time instead of N
      const batchedTime = p.avgDuration * 1.5; // Assume batch is slightly slower
      return Math.max(0, p.totalDuration - batchedTime);
    }),
    A.reduce(0, (a, b) => a + b),
  );

/**
 * Check if a resource looks like it's fetching a single item by ID.
 * Useful for identifying N+1 patterns that fetch individual records.
 */
export const isIndividualFetch = (resource: Resource): boolean => {
  const url = resource.url || resource.name;

  // Check for common patterns like /users/123 or /api/posts/abc-123
  const hasIdInPath =
    /\/\d+$/.test(url) ||
    /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      url,
    ) ||
    /\/[0-9a-f]{24}$/i.test(url);

  // Check for query params like ?id=123
  const hasIdParam = /[?&]id=/i.test(url);

  return hasIdInPath || hasIdParam;
};

/**
 * Get the likely entity type from an N+1 pattern.
 * Extracts the resource name from the URL pattern.
 */
export const getEntityType = (pattern: string): string | undefined => {
  // Try to extract the entity from patterns like /api/users/* or /posts/*
  const match = pattern.match(/\/(?:api\/)?(\w+)\/\*$/);
  return match?.[1];
};
