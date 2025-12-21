import type { PageSession, Resource } from "../types";

/**
 * Categories of performance issues.
 */
export type IssueCategory =
  | "caching"
  | "waterfall"
  | "data-fetching"
  | "rendering"
  | "server-actions"
  | "configuration";

/**
 * Severity levels for issues.
 */
export type IssueSeverity = "critical" | "warning" | "info" | "optimization";

/**
 * Static definition of an issue type.
 */
export interface IssueDefinition {
  /** Unique identifier, e.g., "rsc:waterfall-parent-child" */
  readonly id: string;

  /** Human-readable title */
  readonly title: string;

  /** Category for grouping */
  readonly category: IssueCategory;

  /** Default severity when detected */
  readonly defaultSeverity: IssueSeverity;

  /** Link to documentation */
  readonly docsUrl?: string;
}

/**
 * A detected instance of an issue.
 */
export interface IssueMatch {
  /** ID of the issue definition */
  readonly issueId: string;

  /** Computed severity (may differ from default based on impact) */
  readonly severity: IssueSeverity;

  /** Resources involved in this issue */
  readonly resources: readonly Resource[];

  /** Quantified impact */
  readonly impact: {
    /** Time in milliseconds affected by this issue */
    readonly timeMs: number;
    /** Percentage of total session duration */
    readonly percentOfTotal: number;
  };

  /** Issue-specific context data */
  readonly context: Record<string, unknown>;
}

/**
 * A suggestion for fixing an issue.
 */
export interface IssueSuggestion {
  /** Brief summary of the fix */
  readonly summary: string;

  /** Detailed explanation */
  readonly explanation: string;

  /** Code example showing before/after */
  readonly codeExample?: {
    readonly before?: string;
    readonly after: string;
    readonly language: string;
  };

  /** Link to relevant documentation */
  readonly docsUrl?: string;

  /** Estimated improvement if fixed */
  readonly estimatedImprovement?: string;
}

/**
 * A detected issue with all context.
 */
export interface DetectedIssue {
  /** The issue definition */
  readonly definition: IssueDefinition;

  /** The match details */
  readonly match: IssueMatch;

  /** The suggestion for fixing */
  readonly suggestion: IssueSuggestion;
}

/**
 * Interface for issue detectors.
 * Implement this to create new issue types.
 */
export interface IssueDetector {
  /** Static definition of this issue */
  readonly definition: IssueDefinition;

  /**
   * Detect if this issue exists in a session.
   * @param session The page session to analyze
   * @returns Match details if issue detected, null otherwise
   */
  detect(session: PageSession): IssueMatch | null;

  /**
   * Generate a suggestion for fixing the issue.
   * @param match The detected issue match
   * @returns Suggestion with explanation and code examples
   */
  suggest(match: IssueMatch): IssueSuggestion;
}

/**
 * Helper to create an issue detector with type inference.
 */
export const createDetector = (detector: IssueDetector): IssueDetector =>
  detector;
