import type { SessionStore } from "../state/session-store"

export interface GetErrorsArgs {
  session_id?: string
  limit?: number
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export const getErrors = (store: SessionStore, args: GetErrorsArgs): string => {
  const limit = args.limit ?? 20
  let errors = store.getErrors()

  if (args.session_id) {
    errors = errors.filter((e) => e.session.id === args.session_id)
  }

  errors = errors.slice(0, limit)

  if (errors.length === 0) {
    if (args.session_id) {
      return `No errors found in session '${args.session_id}'.`
    }
    return "No errors found in recent sessions. Your app appears to be running without errors!"
  }

  const lines: string[] = []
  lines.push(`Errors Found: ${errors.length}`)
  lines.push("")

  for (let i = 0; i < errors.length; i++) {
    const error = errors[i]
    if (!error) continue
    const { session, resource } = error

    lines.push(`${i + 1}. Session: ${session.id} (${session.route})`)
    lines.push(`   Resource: ${resource.name}`)

    if (resource.statusCode) {
      const statusText =
        resource.statusCode >= 500 ? "Server Error" :
        resource.statusCode >= 400 ? "Client Error" : ""
      lines.push(`   Status: ${resource.statusCode} ${statusText}`)
    } else {
      lines.push(`   Status: error (span error status)`)
    }

    lines.push(`   Duration: ${formatDuration(resource.duration)}`)
    lines.push(`   Type: ${resource.type} (${resource.origin})`)

    if (resource.initiator) {
      lines.push(`   Initiator: ${resource.initiator}`)
    }

    if (resource.url) {
      lines.push(`   URL: ${resource.url}`)
    }

    lines.push("")
  }

  return lines.join("\n")
}
