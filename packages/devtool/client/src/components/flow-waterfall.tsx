import { Server, Monitor } from "lucide-react"
import { cn } from "@/lib/utils"
import { CATEGORY_COLORS, getSpanColors, getSpanDisplayName } from "@/lib/view-models"
import type { RequestFlow, TraceSpan, SpanCategory } from "@/domain"

interface FlowWaterfallProps {
  flow: RequestFlow
  compact?: boolean
}

export function FlowWaterfall({ flow, compact = false }: FlowWaterfallProps) {
  const { spans, startTime, duration, phases } = flow

  if (spans.length === 0) {
    return <div className="text-sm text-muted-foreground p-4">No spans to display</div>
  }

  const serverSpans = spans.filter((s) => s.origin === "server").slice(0, compact ? 10 : 30)
  const clientSpans = spans.filter((s) => s.origin === "client").slice(0, compact ? 5 : 20)

  return (
    <div className="space-y-3">
      <PhaseBar phases={phases} startTime={startTime} duration={duration} />

      <TimelineHeader duration={duration} />

      <div className="relative">
        <TimelineGrid />

        {serverSpans.length > 0 && (
          <SpanSection
            title="Server"
            spans={serverSpans}
            totalCount={spans.filter((s) => s.origin === "server").length}
            maxShown={compact ? 10 : 30}
            startTime={startTime}
            duration={duration}
            color="green"
          />
        )}

        {clientSpans.length > 0 && (
          <SpanSection
            title="Client"
            spans={clientSpans}
            totalCount={spans.filter((s) => s.origin === "client").length}
            maxShown={compact ? 5 : 20}
            startTime={startTime}
            duration={duration}
            color="blue"
            subtitle={serverSpans.length > 0 ? "after server render" : undefined}
          />
        )}
      </div>

      {!compact && <WaterfallLegend />}
    </div>
  )
}

interface PhaseBarProps {
  phases: RequestFlow["phases"]
  startTime: number
  duration: number
}

function PhaseBar({ phases, startTime, duration }: PhaseBarProps) {
  const phaseConfigs = [
    { phase: phases.serverDataFetch, label: "Data", bgClass: "bg-amber-500/30", borderClass: "border-amber-500", textClass: "text-amber-300" },
    { phase: phases.serverRender, label: "Render", bgClass: "bg-green-500/30", borderClass: "border-green-500", textClass: "text-green-300" },
    { phase: phases.networkTransfer, label: "Network", bgClass: "bg-gray-500/30", borderClass: "border-gray-500 border-dashed", textClass: "text-gray-400" },
    { phase: phases.hydration, label: "Hydrate", bgClass: "bg-purple-500/30", borderClass: "border-purple-500", textClass: "text-purple-300" },
    { phase: phases.clientDataFetch, label: "Client", bgClass: "bg-blue-500/30", borderClass: "", textClass: "text-blue-300" },
  ]

  return (
    <div className="relative h-8 bg-card rounded overflow-hidden border border-border">
      {phaseConfigs.map(({ phase, label, bgClass, borderClass, textClass }) =>
        phase ? (
          <div
            key={label}
            className={cn("absolute h-full border-r", bgClass, borderClass)}
            style={{
              left: `${((phase.startTime - startTime) / duration) * 100}%`,
              width: `${Math.max((phase.duration / duration) * 100, 1)}%`,
            }}
            title={`${label}: ${phase.duration}ms`}
          >
            <span className={cn("absolute inset-0 flex items-center justify-center text-[10px] truncate px-1", textClass)}>
              {label}
            </span>
          </div>
        ) : null
      )}
    </div>
  )
}

function TimelineHeader({ duration }: { duration: number }) {
  return (
    <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
      <span>0ms</span>
      <span>{Math.round(duration / 4)}ms</span>
      <span>{Math.round(duration / 2)}ms</span>
      <span>{Math.round((duration * 3) / 4)}ms</span>
      <span>{duration}ms</span>
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

interface SpanSectionProps {
  title: string
  spans: ReadonlyArray<TraceSpan>
  totalCount: number
  maxShown: number
  startTime: number
  duration: number
  color: "green" | "blue"
  subtitle?: string
}

function SpanSection({ title, spans, totalCount, maxShown, startTime, duration, color, subtitle }: SpanSectionProps) {
  const colorClasses = color === "green"
    ? { text: "text-green-400", border: "border-green-500/30" }
    : { text: "text-blue-400", border: "border-blue-500/30" }

  return (
    <div className={cn("relative", color === "blue" && "mt-3")}>
      <div className={cn("flex items-center gap-2 py-1.5 text-[10px] font-semibold border-b mb-1", colorClasses.text, colorClasses.border)}>
        {color === "green" ? <Server className="size-3" /> : <Monitor className="size-3" />}
        <span>{title} ({totalCount} spans)</span>
        {subtitle && <span className="text-muted-foreground font-normal ml-2">— {subtitle}</span>}
      </div>
      <div className="space-y-0.5">
        {spans.map((span) => (
          <SpanRow key={span.id} span={span} startTime={startTime} duration={duration} />
        ))}
        {totalCount > maxShown && (
          <div className="text-[10px] text-muted-foreground py-1 pl-[170px]">
            +{totalCount - maxShown} more {title.toLowerCase()} spans...
          </div>
        )}
      </div>
    </div>
  )
}

interface SpanRowProps {
  span: TraceSpan
  startTime: number
  duration: number
}

function SpanRow({ span, startTime, duration }: SpanRowProps) {
  const offsetPercent = ((span.startTime - startTime) / duration) * 100
  const widthPercent = Math.max((span.duration / duration) * 100, 0.5)
  const colors = getSpanColors(span)
  const displayName = getSpanDisplayName(span)

  return (
    <div className="flex items-center gap-2 h-5 group" title={`${span.name}\nDuration: ${span.duration}ms\nOrigin: ${span.origin}`}>
      <div className={cn("w-1 h-full rounded-sm flex-shrink-0", span.origin === "server" ? "bg-green-500" : "bg-blue-500")} />

      <div className="flex flex-col min-w-[160px] max-w-[160px]">
        <div className={cn("text-[10px] truncate leading-tight", colors.text)}>{displayName}</div>
      </div>

      <div className="flex-1 relative h-3">
        <div
          className={cn("absolute h-full rounded-sm border transition-all group-hover:brightness-125", colors.bg, colors.border)}
          style={{
            left: `${Math.max(0, offsetPercent)}%`,
            width: `${Math.max(0.5, widthPercent)}%`,
            minWidth: "4px",
          }}
        />
      </div>

      <span className="text-[10px] font-mono text-muted-foreground min-w-[40px] text-right flex-shrink-0">
        {span.duration}ms
      </span>
    </div>
  )
}

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
      {(Object.entries(CATEGORY_COLORS) as [SpanCategory, typeof CATEGORY_COLORS[SpanCategory]][]).map(([category, colors]) => (
        <div key={category} className="flex items-center gap-1.5">
          <div className={cn("w-3 h-3 rounded-sm border", colors.bg, colors.border)} />
          <span className="text-[10px] text-muted-foreground capitalize">{category}</span>
        </div>
      ))}
    </div>
  )
}
