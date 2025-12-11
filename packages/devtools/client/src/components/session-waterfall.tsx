import { useRef, useMemo, useCallback, memo } from "react"
import { Server, Monitor } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  RESOURCE_TYPE_CONFIG,
  getResourceConfig,
  getResourceDisplayName,
  formatDuration,
  formatTimeMarker,
  getTimelinePosition,
  getTimelineWidth,
} from "@/lib/view-models"
import { useProfilingStore } from "@/lib/profiling-store"
import type { PageSession, Resource } from "@/domain"

interface SessionWaterfallProps {
  session: PageSession
  filteredResources: ReadonlyArray<Resource>
  zoom: number
}

export function SessionWaterfall({ session, filteredResources, zoom }: SessionWaterfallProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { zoomPan, setPanOffset, selectResource, selectedResourceId } = useProfilingStore()

  const filteredIds = useMemo(() => new Set(filteredResources.map((r) => r.id)), [filteredResources])

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.shiftKey) {
        e.preventDefault()
        const newOffset = zoomPan.panOffset + e.deltaY * 0.1
        setPanOffset(newOffset)
      }
    },
    [zoomPan.panOffset, setPanOffset]
  )

  const handleResourceClick = useCallback(
    (resourceId: string) => {
      selectResource(resourceId)
    },
    [selectResource]
  )

  if (session.resources.length === 0) {
    return <div className="text-sm text-muted-foreground p-4">No resources to display</div>
  }

  const { timing, stats } = session
  const totalDuration = stats.totalDuration

  return (
    <div className="space-y-3">
      <TimingPhasesBar session={session} zoom={zoom} panOffset={zoomPan.panOffset} />

      <TimelineHeader duration={totalDuration} zoom={zoom} panOffset={zoomPan.panOffset} />

      <div
        ref={containerRef}
        className="relative overflow-x-auto"
        onWheel={handleWheel}
        style={{ cursor: zoom > 1 ? "grab" : "default" }}
      >
        <TimelineGrid />

        <div className="space-y-0.5 relative">
          {session.resources.map((resource) => (
            <ResourceRow
              key={resource.id}
              resource={resource}
              sessionStartTime={timing.navigationStart}
              totalDuration={totalDuration}
              zoom={zoom}
              panOffset={zoomPan.panOffset}
              isFiltered={!filteredIds.has(resource.id)}
              isSelected={selectedResourceId === resource.id}
              onClick={handleResourceClick}
            />
          ))}
        </div>
      </div>

      <WaterfallLegend />
    </div>
  )
}

interface TimingPhasesBarProps {
  session: PageSession
  zoom: number
  panOffset: number
}

function TimingPhasesBar({ session, zoom, panOffset }: TimingPhasesBarProps) {
  const { timing, stats } = session
  const totalDuration = stats.totalDuration
  const startTime = timing.navigationStart

  const phases = [
    {
      label: "Server",
      start: timing.serverStart,
      end: timing.serverEnd,
      bg: "bg-green-500/30",
      border: "border-green-500",
      text: "text-green-300",
    },
    {
      label: "TTFB",
      start: startTime,
      end: timing.responseStart ? startTime + timing.responseStart : undefined,
      bg: "bg-gray-500/30",
      border: "border-gray-500 border-dashed",
      text: "text-gray-400",
    },
    {
      label: "DOM",
      start: timing.responseStart ? startTime + timing.responseStart : undefined,
      end: timing.domContentLoaded ? startTime + timing.domContentLoaded : undefined,
      bg: "bg-blue-500/30",
      border: "border-blue-500",
      text: "text-blue-300",
    },
    {
      label: "Load",
      start: timing.domContentLoaded ? startTime + timing.domContentLoaded : undefined,
      end: timing.load ? startTime + timing.load : undefined,
      bg: "bg-purple-500/30",
      border: "border-purple-500",
      text: "text-purple-300",
    },
  ]

  return (
    <div className="relative h-8 bg-card rounded overflow-hidden border border-border">
      {phases.map(({ label, start, end, bg, border, text }) => {
        if (start === undefined || end === undefined) return null
        const duration = end - start
        if (duration <= 0) return null

        const left = getTimelinePosition(start, startTime, totalDuration, zoom, panOffset)
        const width = getTimelineWidth(duration, totalDuration, zoom)

        if (left + width < 0 || left > 100) return null

        return (
          <div
            key={label}
            className={cn("absolute h-full border-r", bg, border)}
            style={{
              left: `${Math.max(0, left)}%`,
              width: `${Math.min(width, 100 - Math.max(0, left))}%`,
            }}
            title={`${label}: ${formatDuration(duration)}`}
          >
            <span className={cn("absolute inset-0 flex items-center justify-center text-[10px] truncate px-1", text)}>
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

interface TimelineHeaderProps {
  duration: number
  zoom: number
  panOffset: number
}

function TimelineHeader({ duration, zoom, panOffset }: TimelineHeaderProps) {
  const markerCount = 5
  const markers = useMemo(() => {
    const result = []
    for (let i = 0; i < markerCount; i++) {
      const time = (duration * i) / (markerCount - 1)
      const position = ((i / (markerCount - 1)) * 100 - panOffset) * zoom
      if (position >= -10 && position <= 110) {
        result.push({ time, position })
      }
    }
    return result
  }, [duration, zoom, panOffset])

  return (
    <div className="relative h-4 text-[10px] text-muted-foreground">
      {markers.map(({ time, position }) => (
        <span
          key={time}
          className="absolute transform -translate-x-1/2"
          style={{ left: `${Math.max(0, Math.min(100, position))}%` }}
        >
          {formatTimeMarker(time)}
        </span>
      ))}
    </div>
  )
}

function TimelineGrid() {
  return (
    <div className="absolute inset-0 flex pointer-events-none">
      <div className="flex-1 border-r border-border/20" />
      <div className="flex-1 border-r border-border/20" />
      <div className="flex-1 border-r border-border/20" />
      <div className="flex-1" />
    </div>
  )
}

interface ResourceRowProps {
  resource: Resource
  sessionStartTime: number
  totalDuration: number
  zoom: number
  panOffset: number
  isFiltered: boolean
  isSelected: boolean
  onClick: (id: string) => void
}

const ResourceRow = memo(function ResourceRow({
  resource,
  sessionStartTime,
  totalDuration,
  zoom,
  panOffset,
  isFiltered,
  isSelected,
  onClick,
}: ResourceRowProps) {
  const config = getResourceConfig(resource)
  const left = getTimelinePosition(resource.startTime, sessionStartTime, totalDuration, zoom, panOffset)
  const width = getTimelineWidth(resource.duration, totalDuration, zoom)

  const displayName = useMemo(() => getResourceDisplayName(resource), [resource])

  const handleClick = useCallback(() => {
    onClick(resource.id)
  }, [onClick, resource.id])

  return (
    <div
      className={cn(
        "flex items-center gap-2 h-5 group cursor-pointer transition-colors",
        isFiltered && "opacity-30",
        isSelected && "bg-accent/50"
      )}
      onClick={handleClick}
      title={`${resource.name}\nDuration: ${formatDuration(resource.duration)}\nOrigin: ${resource.origin}\nType: ${resource.type}`}
    >
      <div
        className={cn("w-1 h-full rounded-sm flex-shrink-0", resource.origin === "server" ? "bg-green-500" : "bg-blue-500")}
      />

      <div className="flex items-center gap-1 min-w-[180px] max-w-[180px]">
        {resource.origin === "server" ? (
          <Server className="size-2.5 text-green-400 flex-shrink-0" />
        ) : (
          <Monitor className="size-2.5 text-blue-400 flex-shrink-0" />
        )}
        <span className={cn("text-[10px] truncate leading-tight", config.text)}>{displayName}</span>
      </div>

      <div className="flex-1 relative h-3">
        <div
          className={cn(
            "absolute h-full rounded-sm border transition-all group-hover:brightness-125",
            config.bg,
            config.border,
            resource.status === "error" && "border-red-500 bg-red-500/40"
          )}
          style={{
            left: `${Math.max(0, Math.min(100, left))}%`,
            width: `${Math.max(0.5, Math.min(100 - Math.max(0, left), width))}%`,
            minWidth: "4px",
          }}
        />
      </div>

      <span className="text-[10px] font-mono text-muted-foreground min-w-[50px] text-right flex-shrink-0">
        {formatDuration(resource.duration)}
      </span>
    </div>
  )
})

function WaterfallLegend() {
  return (
    <div className="flex flex-wrap gap-3 pt-2 border-t border-border">
      <div className="flex items-center gap-1.5">
        <div className="w-1 h-3 rounded-sm bg-green-500" />
        <span className="text-[10px] text-muted-foreground">Server</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-1 h-3 rounded-sm bg-blue-500" />
        <span className="text-[10px] text-muted-foreground">Client</span>
      </div>
      <div className="w-px h-3 bg-border" />
      {Object.entries(RESOURCE_TYPE_CONFIG).map(([type, cfg]) => (
        <div key={type} className="flex items-center gap-1.5">
          <div className={cn("w-3 h-3 rounded-sm border", cfg.bg, cfg.border)} />
          <span className="text-[10px] text-muted-foreground">{cfg.label}</span>
        </div>
      ))}
    </div>
  )
}
