import { Circle, Play, Square, Trash2, Wifi, WifiOff } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { useProfilingStore } from "@/lib/profiling-store"
import { cn } from "@/lib/utils"
import { formatElapsedTime } from "@/lib/view-models"

export function ProfilingControls() {
  const { status, sessions, isConnected, startProfiling, stopProfiling, clearSessions, sessionStartTime } = useProfilingStore()
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    if (status !== "recording" || !sessionStartTime) return
    setNow(Date.now())
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [status, sessionStartTime])

  const totalResources = sessions.reduce((sum: number, s) => sum + s.stats.totalResources, 0)
  const errorCount = sessions.reduce((sum: number, s) => sum + s.stats.errorCount, 0)
  const avgDuration = sessions.length > 0 ? Math.round(sessions.reduce((sum: number, s) => sum + s.stats.totalDuration, 0) / sessions.length) : 0

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
        <div className="text-sm text-muted-foreground font-mono">{formatElapsedTime(sessionStartTime, now)}</div>
      )}

      {status === "recording" && (
        <div className={cn("flex items-center gap-1.5 text-xs", isConnected ? "text-green-500" : "text-amber-500")}>
          {isConnected ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
          <span>{isConnected ? "Connected" : "Connecting..."}</span>
        </div>
      )}

      <div className="flex items-center gap-4 ml-auto">
        {sessions.length > 0 && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              <span className="font-mono">{sessions.length}</span> {sessions.length === 1 ? "session" : "sessions"}
            </span>
            <span>
              <span className="font-mono">{totalResources}</span> resources
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

        {sessions.length > 0 && (
          <Button onClick={clearSessions} variant="ghost" size="sm" className="gap-2">
            <Trash2 className="size-4" />
            Clear
          </Button>
        )}
      </div>
    </div>
  )
}
