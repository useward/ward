import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Info,
  Lightbulb,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { DetectedIssue, PageSession } from "@/domain";
import { ALL_DETECTORS, runDetectors } from "@/domain";
import { cn } from "@/lib/utils";

interface SessionIssuesProps {
  session: PageSession;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

const SEVERITY_CONFIG = {
  critical: {
    label: "Critical",
    icon: AlertTriangle,
    bgColor: "bg-red-500/20 text-red-400 border-red-500/30",
    textColor: "text-red-400",
  },
  warning: {
    label: "Warning",
    icon: AlertTriangle,
    bgColor: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    textColor: "text-amber-400",
  },
  info: {
    label: "Info",
    icon: Info,
    bgColor: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    textColor: "text-blue-400",
  },
  optimization: {
    label: "Optimization",
    icon: Lightbulb,
    bgColor: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    textColor: "text-purple-400",
  },
} as const;

export function SessionIssues({ session }: SessionIssuesProps) {
  const issues = useMemo(() => runDetectors(session, ALL_DETECTORS), [session]);

  if (issues.length === 0) {
    return (
      <div className="px-4 py-3 bg-green-500/10 border-b border-green-500/30">
        <div className="flex items-center gap-2 text-xs text-green-400">
          <Zap className="size-4" />
          <span className="font-medium">No performance issues detected</span>
        </div>
      </div>
    );
  }

  const criticalCount = issues.filter(
    (i) => i.match.severity === "critical",
  ).length;
  const warningCount = issues.filter(
    (i) => i.match.severity === "warning",
  ).length;

  return (
    <div className="border-b border-border">
      <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30">
        <div className="flex items-center gap-3 text-xs">
          <AlertTriangle className="size-4 text-amber-400" />
          <span className="font-medium text-amber-300">
            {issues.length} performance{" "}
            {issues.length === 1 ? "issue" : "issues"} detected
          </span>
          <div className="flex items-center gap-2 ml-auto">
            {criticalCount > 0 && (
              <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px] px-1.5">
                {criticalCount} critical
              </Badge>
            )}
            {warningCount > 0 && (
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] px-1.5">
                {warningCount} warning
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="max-h-[300px] overflow-y-auto">
        {issues.map((issue, index) => (
          <IssueItem key={`${issue.definition.id}-${index}`} issue={issue} />
        ))}
      </div>
    </div>
  );
}

interface IssueItemProps {
  issue: DetectedIssue;
}

function IssueItem({ issue }: IssueItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { definition, match, suggestion } = issue;
  const config = SEVERITY_CONFIG[match.severity];
  const Icon = config.icon;

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left px-4 py-2 hover:bg-accent/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="size-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3 text-muted-foreground" />
          )}
          <Icon className={cn("size-3.5", config.textColor)} />
          <span className="text-xs font-medium flex-1">{definition.title}</span>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="size-3" />
              {formatDuration(match.impact.timeMs)}
            </span>
            <span>({match.impact.percentOfTotal.toFixed(1)}%)</span>
          </div>
          <Badge className={cn("text-[10px] px-1.5", config.bgColor)}>
            {config.label}
          </Badge>
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-3 pt-1 ml-5 space-y-3">
          <p className="text-xs text-muted-foreground">{suggestion.summary}</p>

          {match.resources.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Affected Resources ({match.resources.length})
              </h4>
              <div className="space-y-0.5">
                {match.resources.slice(0, 5).map((resource) => (
                  <div
                    key={resource.id}
                    className="text-[11px] font-mono text-muted-foreground truncate"
                  >
                    {resource.name.slice(0, 80)}
                  </div>
                ))}
                {match.resources.length > 5 && (
                  <div className="text-[11px] text-muted-foreground">
                    ... and {match.resources.length - 5} more
                  </div>
                )}
              </div>
            </div>
          )}

          {suggestion.codeExample && (
            <div>
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Suggested Fix
              </h4>
              <pre className="text-[11px] bg-background/50 rounded p-2 overflow-x-auto border border-border/50">
                <code className="text-green-400">
                  {suggestion.codeExample.after
                    .split("\n")
                    .slice(0, 8)
                    .join("\n")}
                  {suggestion.codeExample.after.split("\n").length > 8 &&
                    "\n..."}
                </code>
              </pre>
            </div>
          )}

          {suggestion.estimatedImprovement && (
            <div className="flex items-center gap-2 text-xs text-green-400">
              <Zap className="size-3" />
              <span>{suggestion.estimatedImprovement}</span>
            </div>
          )}

          {suggestion.docsUrl && (
            <a
              href={suggestion.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="size-3" />
              Documentation
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Get issue count for a session (for use in session list badges).
 */
export function useSessionIssueCount(session: PageSession | null): {
  total: number;
  critical: number;
  warning: number;
} {
  return useMemo(() => {
    if (!session) return { total: 0, critical: 0, warning: 0 };
    const issues = runDetectors(session, ALL_DETECTORS);
    return {
      total: issues.length,
      critical: issues.filter((i) => i.match.severity === "critical").length,
      warning: issues.filter((i) => i.match.severity === "warning").length,
    };
  }, [session]);
}
