import { useEffect, useState } from "react"
import { Circle, Play, Square, Trash2, Wifi, WifiOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useProfilingStore } from "@/lib/profiling-store"
import { formatSessionDuration } from "@/lib/view-models"
import { cn } from "@/lib/utils"

export function ProfilingControls() {
  const { status, flows, isConnected, startProfiling, stopProfiling, clearFlows, sessionStartTime } = useProfilingStore()
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    if (status !== "recording") return
    const interval = setInterval(() => forceUpdate((n) => n + 1), 1000)
    return () => clearInterval(interval)
  }, [status])

  const totalSpans = flows.reduce((sum, f) => sum + f.spans.length, 0)
  const errorCount = flows.reduce((sum, f) => sum + f.stats.errorCount, 0)
  const avgDuration = flows.length > 0 ? Math.round(flows.reduce((sum, f) => sum + f.duration, 0) / flows.length) : 0

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card">
      <div className="flex items-center gap-2">
        {status === "idle" && (
          <Button onClick={startProfiling} size="sm" className="gap-2">
            <Play className="size-4" />
            Start Profiling
          </Button>
        )}

        {status === "recording" && (
          <>
            <Button onClick={stopProfiling} variant="destructive" size="sm" className="gap-2">
              <Square className="size-4" />
              Stop
            </Button>
            <div className="flex items-center gap-2">
              <Circle className="size-2 animate-pulse" fill="rgb(239 68 68)" color="rgb(239 68 68)" />
              <span className="text-sm font-mono text-red-500">Recording</span>
            </div>
          </>
        )}

        {status === "stopped" && (
          <Button onClick={startProfiling} size="sm" className="gap-2">
            <Play className="size-4" />
            Record Again
          </Button>
        )}
      </div>

      {sessionStartTime && status === "recording" && (
        <div className="text-sm text-muted-foreground font-mono">{formatSessionDuration(sessionStartTime)}</div>
      )}

      {status === "recording" && (
        <div className={cn("flex items-center gap-1.5 text-xs", isConnected ? "text-green-500" : "text-amber-500")}>
          {isConnected ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
          <span>{isConnected ? "Connected" : "Connecting..."}</span>
        </div>
      )}

      <div className="flex items-center gap-4 ml-auto">
        {flows.length > 0 && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              <span className="font-mono">{flows.length}</span> {flows.length === 1 ? "flow" : "flows"}
            </span>
            <span>
              <span className="font-mono">{totalSpans}</span> spans
            </span>
            {errorCount > 0 && (
              <span className="text-red-400">
                <span className="font-mono">{errorCount}</span> errors
              </span>
            )}
            <span>
              avg <span className="font-mono">{avgDuration}ms</span>
            </span>
          </div>
        )}

        {flows.length > 0 && (
          <Button onClick={clearFlows} variant="ghost" size="sm" className="gap-2">
            <Trash2 className="size-4" />
            Clear
          </Button>
        )}
      </div>
    </div>
  )
}
