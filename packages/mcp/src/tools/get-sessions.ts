import type { PageSession } from "@nextdoctor/domain"
import type { SessionStore } from "../state/session-store"

export interface GetSessionsArgs {
  limit?: number
  route?: string
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

const formatNavigationType = (type: string): string => {
  switch (type) {
    case "initial":
      return "Initial Load"
    case "navigation":
      return "SPA Navigation"
    case "back-forward":
      return "Back/Forward"
    default:
      return type
  }
}

const formatSession = (session: PageSession, index: number): string => {
  const lines: string[] = []

  const navType = formatNavigationType(session.navigationType)
  lines.push(`${index + 1}. [${session.id}] ${session.route} (${navType})`)

  const duration = formatDuration(session.stats.totalDuration)
  const resources = session.stats.totalResources
  const errors = session.stats.errorCount
  const cached = session.stats.cachedCount

  let metrics = `   Duration: ${duration} | Resources: ${resources}`
  if (errors > 0) metrics += ` | Errors: ${errors}`
  if (cached > 0) metrics += ` | Cached: ${cached}`

  const lcp = session.timing.lcp ?? session.timing.spaLcp
  if (lcp) {
    const lcpLabel = session.timing.spaLcp ? "SPA LCP" : "LCP"
    metrics += ` | ${lcpLabel}: ${formatDuration(lcp - session.timing.navigationStart)}`
  }

  lines.push(metrics)

  if (session.stats.slowestResource) {
    const slowest = session.stats.slowestResource
    lines.push(`   Slowest: ${slowest.name} (${formatDuration(slowest.duration)})`)
  }

  return lines.join("\n")
}

export const getSessions = (store: SessionStore, args: GetSessionsArgs): string => {
  const limit = args.limit ?? 10
  let sessions = store.getSessions()

  if (args.route) {
    sessions = sessions.filter(
      (s) => s.route === args.route || s.route.startsWith(args.route!)
    )
  }

  sessions = sessions.slice(0, limit)

  if (sessions.length === 0) {
    if (!store.isConnected) {
      return `Not connected to NextDoctor DevTools.

To start recording:
1. Ensure NextDoctor DevTools server is running (npx @nextdoctor/devtools)
2. Navigate to pages in your Next.js app to generate telemetry
3. Sessions will appear here automatically`
    }

    return `No sessions recorded yet.

To start recording:
1. Navigate to pages in your Next.js app
2. Sessions will appear here automatically`
  }

  const header = args.route
    ? `Sessions for route "${args.route}" (${sessions.length}):`
    : `Recent Sessions (${sessions.length}):`

  const formatted = sessions.map((s, i) => formatSession(s, i)).join("\n\n")

  return `${header}\n\n${formatted}`
}
