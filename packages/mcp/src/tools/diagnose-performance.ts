import { findCriticalPath, type PageSession, type Resource } from "@nextdoctor/domain"
import type { SessionStore } from "../state/session-store"

export interface DiagnosePerformanceArgs {
  session_id?: string
  route?: string
  threshold_ms?: number
}

interface PerformanceIssue {
  severity: "critical" | "warning" | "info"
  type: string
  resource: Resource
  impact: number
  suggestion: string
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

const generateSuggestion = (resource: Resource): string => {
  if (resource.type === "database") {
    return "Consider adding database indexes, optimizing the query, or using caching"
  }
  if (resource.type === "fetch" && !resource.cached) {
    return "Consider enabling Next.js fetch cache with { next: { revalidate: <seconds> } }"
  }
  if (resource.type === "api" && !resource.cached) {
    return "Consider caching this API response or using unstable_cache"
  }
  if (resource.type === "rsc" && resource.duration > 200) {
    return "Consider optimizing React Server Component or moving heavy computation"
  }
  if (resource.origin === "server" && resource.duration > 300) {
    return "Consider moving this to client-side, background job, or streaming"
  }
  return "Optimize this resource to improve page load time"
}

const analyzeSession = (session: PageSession, thresholdMs: number): PerformanceIssue[] => {
  const issues: PerformanceIssue[] = []
  const totalDuration = session.stats.totalDuration

  for (const resource of session.resources) {
    if (resource.duration >= thresholdMs) {
      const impact = (resource.duration / totalDuration) * 100

      issues.push({
        severity: resource.duration > 500 ? "critical" : impact > 20 ? "critical" : "warning",
        type: resource.type === "database" ? "Slow Database Query" :
              resource.type === "fetch" && !resource.cached ? "Uncached Fetch" :
              resource.type === "api" ? "Slow API Call" :
              resource.type === "rsc" ? "Slow RSC Render" :
              "Slow Resource",
        resource,
        impact,
        suggestion: generateSuggestion(resource),
      })
    }
  }

  const uncachedFetches = session.resources.filter(
    (r) => (r.type === "fetch" || r.type === "api") && !r.cached && r.duration > 50
  )

  for (const resource of uncachedFetches) {
    if (!issues.find((i) => i.resource.id === resource.id)) {
      issues.push({
        severity: "info",
        type: "Cacheable Resource",
        resource,
        impact: (resource.duration / totalDuration) * 100,
        suggestion: "This resource could benefit from caching",
      })
    }
  }

  return issues.sort((a, b) => b.impact - a.impact)
}

const formatIssue = (issue: PerformanceIssue, index: number): string => {
  const lines: string[] = []
  const severityLabel = issue.severity === "critical" ? "[CRITICAL]" :
                       issue.severity === "warning" ? "[WARNING]" : "[INFO]"

  lines.push(
    `${index + 1}. ${severityLabel} ${issue.type} (${formatDuration(issue.resource.duration)}, ${issue.impact.toFixed(1)}% of total)`
  )
  lines.push(`   Resource: ${issue.resource.name}`)
  if (issue.resource.initiator) {
    lines.push(`   File: ${issue.resource.initiator}`)
  }
  lines.push(`   Suggestion: ${issue.suggestion}`)

  return lines.join("\n")
}

export const diagnosePerformance = (store: SessionStore, args: DiagnosePerformanceArgs): string => {
  const thresholdMs = args.threshold_ms ?? 100
  let session: PageSession | undefined

  if (args.session_id) {
    session = store.getSession(args.session_id)
    if (!session) {
      return `Session '${args.session_id}' not found. Use get_sessions to see available sessions.`
    }
  } else if (args.route) {
    const sessions = store.getSessionsByRoute(args.route)
    if (sessions.length === 0) {
      return `No sessions found for route '${args.route}'.`
    }
    session = sessions[0]
  } else {
    const sessions = store.getSessions()
    if (sessions.length === 0) {
      return "No sessions available. Navigate to pages in your Next.js app to generate telemetry."
    }
    session = sessions[0]
  }

  if (!session) {
    return "Unable to find session."
  }

  const issues = analyzeSession(session, thresholdMs)
  const lines: string[] = []

  lines.push(`Performance Diagnosis: ${session.route} (session ${session.id})`)
  lines.push(`Total Duration: ${formatDuration(session.stats.totalDuration)}`)
  lines.push("")

  if (issues.length === 0) {
    lines.push(`No performance issues found with threshold of ${thresholdMs}ms.`)
    lines.push("")
    lines.push("The page appears to be performing well!")
    return lines.join("\n")
  }

  lines.push(`Issues Found (${issues.length}):`)
  lines.push("")

  for (let i = 0; i < Math.min(issues.length, 10); i++) {
    const issue = issues[i]
    if (issue) {
      lines.push(formatIssue(issue, i))
      lines.push("")
    }
  }

  if (issues.length > 10) {
    lines.push(`... and ${issues.length - 10} more issues`)
    lines.push("")
  }

  const criticalPathIds = findCriticalPath(session.rootResources)
  if (criticalPathIds.length > 0) {
    const criticalResources = criticalPathIds
      .map((id) => session!.resources.find((r) => r.id === id))
      .filter((r): r is Resource => r !== undefined)

    const criticalDuration = criticalResources.reduce((sum, r) => sum + r.duration, 0)
    const criticalPercent = (criticalDuration / session.stats.totalDuration) * 100

    lines.push(`Critical Path: ${formatDuration(criticalDuration)} (${criticalPercent.toFixed(1)}% of session)`)
    lines.push(
      criticalResources
        .map((r) => `  ${r.type}: ${r.name.substring(0, 50)} (${formatDuration(r.duration)})`)
        .join("\n  → ")
    )
  }

  const cacheRate = session.stats.totalResources > 0
    ? (session.stats.cachedCount / session.stats.totalResources) * 100
    : 0
  lines.push("")
  lines.push(`Cache Hit Rate: ${cacheRate.toFixed(1)}% (${session.stats.cachedCount}/${session.stats.totalResources})`)

  return lines.join("\n")
}
