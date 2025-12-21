import { Array as A, Option as O, pipe } from "effect";
import type { PageSession } from "../types";
import type { DetectedIssue, IssueDetector, IssueSeverity } from "./types";

/**
 * Severity order (lower = more severe).
 */
const SEVERITY_ORDER: Record<IssueSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  optimization: 3,
};

/**
 * Run all detectors against a session and return detected issues.
 *
 * @param session The page session to analyze
 * @param detectors Array of issue detectors to run
 * @returns Array of detected issues, sorted by impact (highest first)
 */
export const runDetectors = (
  session: PageSession,
  detectors: readonly IssueDetector[],
): readonly DetectedIssue[] =>
  pipe(
    detectors,
    A.filterMap((detector) =>
      pipe(
        O.fromNullable(safeDetect(detector, session)),
        O.map((match) => ({
          definition: detector.definition,
          match,
          suggestion: detector.suggest(match),
        })),
      ),
    ),
    A.sort(issueOrder),
  );

/**
 * Safely run a detector, catching any errors.
 */
const safeDetect = (
  detector: IssueDetector,
  session: PageSession,
): ReturnType<IssueDetector["detect"]> => {
  try {
    return detector.detect(session);
  } catch (error) {
    console.error(`Issue detector "${detector.definition.id}" failed:`, error);
    return null;
  }
};

/**
 * Order for sorting issues (by severity, then by time impact).
 */
const issueOrder = (a: DetectedIssue, b: DetectedIssue): -1 | 0 | 1 => {
  const severityDiff =
    SEVERITY_ORDER[a.match.severity] - SEVERITY_ORDER[b.match.severity];
  if (severityDiff !== 0) return severityDiff < 0 ? -1 : 1;

  const timeDiff = b.match.impact.timeMs - a.match.impact.timeMs;
  if (timeDiff !== 0) return timeDiff > 0 ? -1 : 1;

  return 0;
};

/**
 * Filter issues by minimum severity.
 */
export const filterBySeverity =
  (minSeverity: IssueSeverity) =>
  (issues: readonly DetectedIssue[]): readonly DetectedIssue[] =>
    pipe(
      issues,
      A.filter(
        (issue) =>
          SEVERITY_ORDER[issue.match.severity] <= SEVERITY_ORDER[minSeverity],
      ),
    );

/**
 * Filter issues by category.
 */
export const filterByCategory =
  (categories: readonly string[]) =>
  (issues: readonly DetectedIssue[]): readonly DetectedIssue[] =>
    pipe(
      issues,
      A.filter((issue) => categories.includes(issue.definition.category)),
    );

/**
 * Group issues by category.
 */
export const groupByCategory = (
  issues: readonly DetectedIssue[],
): ReadonlyMap<string, readonly DetectedIssue[]> =>
  pipe(
    issues,
    A.groupBy((issue) => issue.definition.category),
    (record) => new Map(Object.entries(record)),
  );

/**
 * Get issues above a time threshold.
 */
export const filterByMinTime =
  (minTimeMs: number) =>
  (issues: readonly DetectedIssue[]): readonly DetectedIssue[] =>
    pipe(
      issues,
      A.filter((issue) => issue.match.impact.timeMs >= minTimeMs),
    );

/**
 * Take the top N issues.
 */
export const takeTop =
  (n: number) =>
  (issues: readonly DetectedIssue[]): readonly DetectedIssue[] =>
    pipe(issues, A.take(n));

/**
 * Compute total time impact of all issues.
 */
export const totalTimeImpact = (issues: readonly DetectedIssue[]): number =>
  pipe(
    issues,
    A.map((issue) => issue.match.impact.timeMs),
    A.reduce(0, (acc, ms) => acc + ms),
  );
