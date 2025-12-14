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

interface Phase {
  label: string
  start: number
  end: number
  bg: string
  border: string
  text: string
}

function assignPhasesToRows(phases: Phase[]): Phase[][] {
  const rows: Phase[][] = []

  for (const phase of phases) {
    let placed = false
    for (const row of rows) {
      const overlaps = row.some((p) => !(phase.end <= p.start || phase.start >= p.end))
      if (!overlaps) {
        row.push(phase)
        placed = true
        break
      }
    }
    if (!placed) {
      rows.push([phase])
    }
  }

  return rows
}

function TimingPhasesBar({ session, zoom, panOffset }: TimingPhasesBarProps) {
  const { timing, stats } = session
  const totalDuration = stats.totalDuration
  const startTime = timing.navigationStart

  const navTiming = session.timing

  const allPhases: Array<{
    label: string
    start: number | undefined
    end: number | undefined
    bg: string
    border: string
    text: string
  }> = [
    {
      label: "TTFB",
      start: startTime,
      end: navTiming.responseStart,
      bg: "bg-slate-500/30",
      border: "border-slate-400 border-dashed",
      text: "text-slate-300",
    },
    {
      label: "DOM",
      start: navTiming.responseStart,
      end: navTiming.domContentLoaded,
      bg: "bg-sky-500/30",
      border: "border-sky-400",
      text: "text-sky-300",
    },
    {
      label: "Load",
      start: navTiming.domContentLoaded,
      end: navTiming.load,
      bg: "bg-violet-500/30",
      border: "border-violet-400",
      text: "text-violet-300",
    },
  ]

  const validPhases: Phase[] = allPhases.filter(
    (p): p is Phase => p.start !== undefined && p.end !== undefined && p.end - p.start > 0
  )

  const phaseRows = useMemo(() => assignPhasesToRows(validPhases), [validPhases])

  const markers = [
    {
      label: "FCP",
      time: timing.fcp,
      color: "bg-teal-400",
    },
    {
      label: "LCP",
      time: timing.lcp,
      color: "bg-orange-400",
    },
    {
      label: "SPA-LCP",
      time: timing.spaLcp !== undefined ? startTime + timing.spaLcp : undefined,
      color: "bg-amber-400",
    },
  ]

  const rowHeight = 8
  const totalHeight = phaseRows.length * rowHeight

  return (
    <div className="flex items-center gap-2 mt-4 mb-2">
      <div className="w-1 shrink-0" />
      <div className="min-w-45 max-w-45" />
      <div
        className="flex-1 relative bg-card rounded border border-border overflow-visible"
        style={{ height: `${Math.max(totalHeight, 24)}px` }}
      >
        {phaseRows.map((row, rowIndex) =>
          row.map(({ label, start, end, bg, border, text }) => {
            const duration = end - start
            const left = getTimelinePosition(start, startTime, totalDuration, zoom, panOffset)
            const width = getTimelineWidth(duration, totalDuration, zoom)

            if (left + width < 0 || left > 100) return null

            const fitsInBar = width >= 8

            return (
              <div
                key={label}
                className={cn("absolute border-r group/phase", bg, border)}
                style={{
                  top: `${rowIndex * rowHeight}px`,
                  height: `${rowHeight}px`,
                  left: `${Math.max(0, left)}%`,
                  width: `${Math.min(width, 100 - Math.max(0, left))}%`,
                  minWidth: "4px",
                }}
                title={`${label}: ${formatDuration(duration)}`}
              >
                {fitsInBar ? (
                  <span
                    className={cn(
                      "absolute inset-0 flex items-center justify-center text-[10px] font-medium truncate px-1",
                      text
                    )}
                  >
                    {label}
                  </span>
                ) : (
                  <span
                    className={cn(
                      "absolute text-[8px] font-bold px-0.5 rounded-sm whitespace-nowrap opacity-0 group-hover/phase:opacity-100 transition-opacity",
                      bg,
                      text
                    )}
                    style={{ top: 0, left: 0, transform: "translateY(-100%)" }}
                  >
                    {label}
                  </span>
                )}
              </div>
            )
          })
        )}

        {markers.map(({ label, time, color }) => {
          if (time === undefined) return null

          const left = getTimelinePosition(time, startTime, totalDuration, zoom, panOffset)
          if (left < 0 || left > 100) return null

          return (
            <div
              key={label}
              className="absolute h-full flex flex-col items-center z-10 group/marker"
              style={{ left: `${left}%`, transform: "translateX(-50%)" }}
              title={`${label}: ${formatDuration(time - startTime)}`}
            >
              <div className={cn("w-1 h-full", color)} />
              <span
                className={cn(
                  "absolute top-0 text-[8px] font-bold px-0.5 rounded-sm whitespace-nowrap opacity-0 group-hover/marker:opacity-100 transition-opacity",
                  color,
                  "text-black"
                )}
                style={{ transform: "translateY(-100%)" }}
              >
                {label}
              </span>
            </div>
          )
        })}
      </div>
      <div className="min-w-12.5 shrink-0" />
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

const TIMING_MARKERS = [
  { label: "FCP", color: "bg-teal-400" },
  { label: "LCP", color: "bg-orange-400" },
  { label: "SPA-LCP", color: "bg-amber-400" },
]

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
      {TIMING_MARKERS.map(({ label, color }) => (
        <div key={label} className="flex items-center gap-1.5">
          <div className={cn("w-0.5 h-3", color)} />
          <span className="text-[10px] text-muted-foreground">{label}</span>
        </div>
      ))}
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
